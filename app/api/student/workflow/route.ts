import { NextRequest } from 'next/server';

import { callLLM } from '@/lib/ai/llm';
import { isAgentRuntimeConfigured } from '@/lib/config/feature-flags';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getOwnerScopedDocumentStore } from '@/lib/server/agent-runtime/owner-scoped-documents';
import { ownerNotFound } from '@/lib/server/agent-runtime/route-response';
import { withRequestOwnerId } from '@/lib/server/agent-runtime/with-owner';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { selectStudentQaEvidence } from '@/lib/student-qa/course-context';
import {
  buildFallbackStudentWorkflow,
  buildFallbackStudentWorkflowExpansion,
  buildStudentWorkflowExpansionPrompt,
  buildStudentWorkflowPrompt,
  parseStudentWorkflow,
  parseStudentWorkflowExpansion,
} from '@/lib/student-workflow/generation';
import type {
  StudentLearningIntent,
  StudentWorkflowAction,
  StudentWorkflowNode,
} from '@/lib/student-workflow/types';

export const runtime = 'nodejs';
export const maxDuration = 180;

type WorkflowBody = {
  courseId?: unknown;
  prompt?: unknown;
  intent?: unknown;
  operation?: unknown;
  action?: unknown;
  parentNode?: unknown;
  answer?: unknown;
  thinkingConfig?: unknown;
};

const intents = new Set<StudentLearningIntent>(['question', 'practice', 'note']);
const actions = new Set<StudentWorkflowAction>([
  'explain',
  'practice',
  'note',
  'grade',
  'explore',
]);

function parseIntent(value: unknown): StudentLearningIntent | null {
  return typeof value === 'string' && intents.has(value as StudentLearningIntent)
    ? (value as StudentLearningIntent)
    : null;
}

function parseAction(value: unknown): StudentWorkflowAction | null {
  return typeof value === 'string' && actions.has(value as StudentWorkflowAction)
    ? (value as StudentWorkflowAction)
    : null;
}

function parseParentNode(value: unknown): StudentWorkflowNode | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StudentWorkflowNode>;
  if (
    typeof record.id !== 'string' ||
    typeof record.kind !== 'string' ||
    typeof record.title !== 'string' ||
    typeof record.content !== 'string'
  ) {
    return null;
  }
  return {
    id: record.id.slice(0, 200),
    kind: record.kind as StudentWorkflowNode['kind'],
    title: record.title.slice(0, 100),
    content: record.content.slice(0, 2_000),
    sourceSceneIds: Array.isArray(record.sourceSceneIds)
      ? record.sourceSceneIds.filter((item): item is string => typeof item === 'string').slice(0, 6)
      : [],
    ...(typeof record.question === 'string' ? { question: record.question.slice(0, 800) } : {}),
  };
}

export async function POST(req: NextRequest) {
  if (!isAgentRuntimeConfigured()) return new Response('Not found', { status: 404 });

  let body: WorkflowBody;
  try {
    body = (await req.json()) as WorkflowBody;
  } catch {
    return apiError('INVALID_REQUEST', 400, '请求内容不是有效的 JSON');
  }

  const courseId = typeof body.courseId === 'string' ? body.courseId.trim() : '';
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 2_000) : '';
  const operation = body.operation === 'expand' ? 'expand' : 'create';
  const intent = parseIntent(body.intent);
  if (!courseId || !prompt || !intent) {
    return apiError('INVALID_REQUEST', 400, '需要有效的课程、学习目标和工作流类型');
  }

  return withRequestOwnerId(req, async (ownerId, responseHeaders) => {
    const store = await getOwnerScopedDocumentStore(ownerId);
    const document = await store.loadDocument(courseId);
    if (!document) return ownerNotFound(responseHeaders);

    const parentNode = operation === 'expand' ? parseParentNode(body.parentNode) : null;
    const action = operation === 'expand' ? parseAction(body.action) : null;
    const answer = typeof body.answer === 'string' ? body.answer.trim().slice(0, 2_000) : undefined;
    if (operation === 'expand' && (!parentNode || !action)) {
      return apiError('INVALID_REQUEST', 400, '继续学习需要有效的父节点和操作');
    }
    if (action === 'grade' && !answer) {
      return apiError('INVALID_REQUEST', 400, '提交练习前需要填写答案');
    }
    if (action === 'explore' && !answer) {
      return apiError('INVALID_REQUEST', 400, '请输入下一步想探索的内容');
    }

    const evidenceQuery = [prompt, answer, parentNode?.title, parentNode?.content]
      .filter(Boolean)
      .join(' ');
    const evidence = selectStudentQaEvidence(document, evidenceQuery, undefined, 5);
    const sources = evidence.sources;
    const { model, modelInfo } = await resolveModelFromRequest(req, body, 'chat-adapter');

    try {
      const llmPrompt =
        operation === 'create'
          ? buildStudentWorkflowPrompt({
              courseName: document.stage.name,
              intent,
              prompt,
              evidence: evidence.context,
            })
          : buildStudentWorkflowExpansionPrompt({
              courseName: document.stage.name,
              action: action!,
              workflowPrompt: prompt,
              parentNode: parentNode!,
              answer,
              evidence: evidence.context,
            });

      const parseResult = (text: string) =>
        operation === 'create'
          ? parseStudentWorkflow(text, { intent, prompt, sources })
          : parseStudentWorkflowExpansion(text, {
              action: action!,
              parentId: parentNode!.id,
              sources,
            });
      const generationSignal = AbortSignal.any([
        req.signal,
        AbortSignal.timeout(operation === 'create' ? 45_000 : 30_000),
      ]);
      const result = await callLLM(
        {
          model,
          system:
            '你是学生学习工作流引擎。严格依据提供的课程资料生成结构化学习节点，只输出请求指定的 JSON。',
          prompt: llmPrompt,
          maxOutputTokens: Math.min(
            modelInfo?.outputWindow ?? (operation === 'create' ? 2_800 : 1_200),
            operation === 'create' ? 3_200 : 1_400,
          ),
          maxRetries: 0,
          abortSignal: generationSignal,
        },
        operation === 'create' ? 'student-workflow-create' : 'student-workflow-expand',
        {
          retries: 1,
          validate: (text) => {
            try {
              parseResult(text);
              return true;
            } catch {
              return false;
            }
          },
        },
        { mode: 'disabled', enabled: false },
      );

      const headers = Object.fromEntries(responseHeaders.entries());
      if (operation === 'create') {
        let workflow;
        try {
          workflow = parseStudentWorkflow(result.text, { intent, prompt, sources });
        } catch {
          workflow = buildFallbackStudentWorkflow({
            intent,
            prompt,
            courseName: document.stage.name,
            sources,
          });
        }
        const response = apiSuccess({ workflow });
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        return response;
      }

      let node;
      try {
        node = parseStudentWorkflowExpansion(result.text, {
          action: action!,
          parentId: parentNode!.id,
          sources,
        });
      } catch (error) {
        if (action === 'grade') throw error;
        node = buildFallbackStudentWorkflowExpansion({
          action: action!,
          parentNode: parentNode!,
          sources,
          request: answer,
        });
      }
      const response = apiSuccess({ node, sources });
      for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      return response;
    } catch (error) {
      console.error('[Student workflow] generation failed', error);
      const headers = Object.fromEntries(responseHeaders.entries());
      if (operation === 'create') {
        const response = apiSuccess({
          workflow: buildFallbackStudentWorkflow({
            intent,
            prompt,
            courseName: document.stage.name,
            sources,
          }),
          degraded: true,
        });
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        return response;
      }
      if (action && action !== 'grade' && parentNode) {
        const response = apiSuccess({
          node: buildFallbackStudentWorkflowExpansion({
            action,
            parentNode,
            sources,
            request: answer,
          }),
          sources,
          degraded: true,
        });
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        return response;
      }
      return apiError('GENERATION_FAILED', 502, '新学习节点生成失败，请稍后重试');
    }
  });
}
