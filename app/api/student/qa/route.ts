import { NextRequest } from 'next/server';

import { callLLM, streamLLM } from '@/lib/ai/llm';
import { isAgentRuntimeConfigured } from '@/lib/config/feature-flags';
import { apiError } from '@/lib/server/api-response';
import { getOwnerScopedDocumentStore } from '@/lib/server/agent-runtime/owner-scoped-documents';
import { ownerNotFound } from '@/lib/server/agent-runtime/route-response';
import { withRequestOwnerId } from '@/lib/server/agent-runtime/with-owner';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import {
  buildClassroomQuickQaSystemPrompt,
  buildStudentQaSystemPrompt,
  selectStudentQaEvidence,
} from '@/lib/student-qa/course-context';

export const runtime = 'nodejs';
export const maxDuration = 180;

type StudentQaMessage = { role: 'user' | 'assistant'; content: string };
type StudentQaBody = {
  courseId?: unknown;
  currentSceneId?: unknown;
  messages?: unknown;
  mode?: unknown;
  thinkingConfig?: unknown;
};

function parseMessages(value: unknown): StudentQaMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return null;
  const parsed: StudentQaMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > 4_000) return null;
    parsed.push({ role, content: trimmed });
  }
  if (parsed.at(-1)?.role !== 'user') return null;
  return parsed;
}

export async function POST(req: NextRequest) {
  if (!isAgentRuntimeConfigured()) return new Response('Not found', { status: 404 });

  let body: StudentQaBody;
  try {
    body = (await req.json()) as StudentQaBody;
  } catch {
    return apiError('INVALID_REQUEST', 400, '请求内容不是有效的 JSON');
  }

  const courseId = typeof body.courseId === 'string' ? body.courseId.trim() : '';
  const currentSceneId =
    typeof body.currentSceneId === 'string' ? body.currentSceneId.trim() : undefined;
  const mode = body.mode === 'classroom' ? 'classroom' : 'study';
  const messages = parseMessages(body.messages);
  if (!courseId || !messages) {
    return apiError('INVALID_REQUEST', 400, '需要有效的课程和对话内容');
  }

  return withRequestOwnerId(req, async (ownerId, responseHeaders) => {
    const store = await getOwnerScopedDocumentStore(ownerId);
    const document = await store.loadDocument(courseId);
    if (!document) return ownerNotFound(responseHeaders);

    const evidence = selectStudentQaEvidence(
      document,
      messages.at(-1)?.content ?? '',
      currentSceneId,
      mode === 'classroom' ? 2 : 4,
    );
    const currentScene = currentSceneId
      ? document.scenes.find((scene) => scene.id === currentSceneId)
      : undefined;
    const { model, modelInfo, thinkingConfig } = await resolveModelFromRequest(
      req,
      body,
      'chat-adapter',
    );
    const modelParams = {
      model,
      system:
        mode === 'classroom'
          ? buildClassroomQuickQaSystemPrompt(document.stage.name, currentScene?.title, evidence)
          : buildStudentQaSystemPrompt(document.stage.name, document.stage.description, evidence),
      messages,
      maxOutputTokens:
        mode === 'classroom'
          ? Math.min(modelInfo?.outputWindow ?? 384, 384)
          : Math.min(modelInfo?.outputWindow ?? 2_048, 4_096),
      maxRetries: 0,
      abortSignal: req.signal,
    } as const;
    const effectiveThinking =
      mode === 'classroom'
        ? { mode: 'disabled' as const, enabled: false }
        : (thinkingConfig ?? { mode: 'disabled' as const, enabled: false });
    const result = streamLLM(
      modelParams,
      mode === 'classroom' ? 'student-classroom-qa' : 'student-course-qa',
      effectiveThinking,
    );

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        const heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        }, 15_000);
        try {
          send({ type: 'sources', sources: evidence.sources });
          let receivedText = false;
          for await (const delta of result.textStream) {
            if (req.signal.aborted) break;
            if (delta) {
              receivedText = true;
              send({ type: 'delta', delta });
            }
          }
          // A few OpenAI-compatible endpoints close a nominally successful
          // stream without any text. Reuse the same model and grounded prompt
          // through the non-streaming path so the student never gets a stuck
          // empty bubble. This is a transport fallback, not a second model.
          if (!receivedText && !req.signal.aborted) {
            const fallback = await callLLM(
              modelParams,
              mode === 'classroom' ? 'student-classroom-qa-fallback' : 'student-course-qa-fallback',
              { retries: mode === 'classroom' ? 0 : 1 },
              effectiveThinking,
            );
            if (fallback.text.trim()) {
              receivedText = true;
              send({ type: 'delta', delta: fallback.text });
            }
          }
          if (!req.signal.aborted) {
            if (receivedText) send({ type: 'done' });
            else send({ type: 'error', message: '模型没有返回回答内容，请稍后重试。' });
          }
        } catch (error) {
          if (!req.signal.aborted) {
            console.error('[Student QA] stream failed', error);
            send({ type: 'error', message: 'AI 答疑暂时失败，请稍后重试。' });
          }
        } finally {
          clearInterval(heartbeat);
          controller.close();
        }
      },
      cancel() {
        void result.consumeStream();
      },
    });

    const headers = new Headers(responseHeaders);
    headers.set('Content-Type', 'text/event-stream; charset=utf-8');
    headers.set('Cache-Control', 'no-cache, no-transform');
    headers.set('Connection', 'keep-alive');
    return new Response(stream, { headers });
  });
}
