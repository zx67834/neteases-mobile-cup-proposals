'use client';

export type StudentQaMode = 'study' | 'classroom';

export interface StudentQaSource {
  sceneId: string;
  sceneOrder: number;
  title: string;
  excerpt: string;
}

export interface StudentQaMessageInput {
  role: 'user' | 'assistant';
  content: string;
}

export class StudentQaInterruptedError extends Error {
  override readonly name = 'StudentQaInterruptedError';
}

function readApiError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'AI 答疑连接失败，请稍后重试。';
  const record = payload as { error?: unknown; message?: unknown };
  const message = record.error ?? record.message;
  return typeof message === 'string' ? message : 'AI 答疑连接失败，请稍后重试。';
}

export async function streamStudentQa({
  courseId,
  currentSceneId,
  messages,
  mode,
  signal,
  onSources,
  onDelta,
}: {
  courseId: string;
  currentSceneId?: string;
  messages: StudentQaMessageInput[];
  mode: StudentQaMode;
  signal: AbortSignal;
  onSources?: (sources: StudentQaSource[]) => void;
  onDelta: (delta: string) => void;
}): Promise<void> {
  const response = await fetch('/api/student/qa', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      courseId,
      currentSceneId,
      messages,
      mode,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    throw new Error(readApiError(payload));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let streamError = '';
  let completed = false;

  const processFrame = (frame: string) => {
    const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
    if (!dataLine) return;
    const event = JSON.parse(dataLine.slice(6)) as {
      type: 'sources' | 'delta' | 'done' | 'error';
      sources?: StudentQaSource[];
      delta?: string;
      message?: string;
    };
    if (event.type === 'sources' && event.sources) onSources?.(event.sources);
    else if (event.type === 'delta' && event.delta) onDelta(event.delta);
    else if (event.type === 'done') completed = true;
    else if (event.type === 'error') {
      streamError = event.message || 'AI 答疑暂时失败，请稍后重试。';
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) processFrame(frame);
  }
  if (buffer.trim()) processFrame(buffer);

  if (streamError) throw new Error(streamError);
  if (!completed && !signal.aborted) {
    throw new StudentQaInterruptedError('回答传输意外中断，可以继续补全。');
  }
}
