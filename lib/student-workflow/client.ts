'use client';

import type {
  StudentLearningIntent,
  StudentLearningWorkflow,
  StudentWorkflowAction,
  StudentWorkflowNode,
  StudentWorkflowSource,
} from '@/lib/student-workflow/types';

function modelHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
  };
}

async function workflowRequest<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/student/workflow', {
    method: 'POST',
    headers: modelHeaders(),
    body: JSON.stringify(body),
    signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | ({ success?: boolean; error?: string } & T)
    | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || '学习工作流生成失败，请稍后重试。');
  }
  return payload;
}

export async function createStudentWorkflow({
  courseId,
  prompt,
  intent,
  signal,
}: {
  courseId: string;
  prompt: string;
  intent: StudentLearningIntent;
  signal?: AbortSignal;
}): Promise<StudentLearningWorkflow> {
  const payload = await workflowRequest<{ workflow: StudentLearningWorkflow }>(
    { courseId, prompt, intent, operation: 'create' },
    signal,
  );
  return payload.workflow;
}

export async function expandStudentWorkflow({
  courseId,
  prompt,
  intent,
  action,
  parentNode,
  answer,
  signal,
}: {
  courseId: string;
  prompt: string;
  intent: StudentLearningIntent;
  action: StudentWorkflowAction;
  parentNode: StudentWorkflowNode;
  answer?: string;
  signal?: AbortSignal;
}): Promise<{ node: StudentWorkflowNode; sources: StudentWorkflowSource[] }> {
  return workflowRequest(
    {
      courseId,
      prompt,
      intent,
      operation: 'expand',
      action,
      parentNode,
      answer,
    },
    signal,
  );
}
