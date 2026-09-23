'use client';

import {
  mergeStudentWorkflowMemories,
  parseStudentWorkflowMemory,
  type StudentWorkflowMemory,
} from './storage';

interface NotesResponse {
  success?: boolean;
  error?: string;
  records?: unknown[];
  record?: unknown;
}
async function readPayload(response: Response): Promise<NotesResponse> {
  return (await response.json().catch(() => ({}))) as NotesResponse;
}

export async function fetchStudentWorkflowMemories(
  courseId?: string,
): Promise<StudentWorkflowMemory[]> {
  const query = courseId ? `?courseId=${encodeURIComponent(courseId)}` : '';
  const response = await fetch(`/api/student/notes${query}`, { cache: 'no-store' });
  const payload = await readPayload(response);
  if (!response.ok || !payload.success || !Array.isArray(payload.records)) {
    throw new Error(payload.error || '数据库笔记读取失败');
  }
  return payload.records
    .map(parseStudentWorkflowMemory)
    .filter((record): record is StudentWorkflowMemory => record !== null);
}

export async function persistStudentWorkflowMemory(
  memory: StudentWorkflowMemory,
): Promise<StudentWorkflowMemory> {
  const response = await fetch('/api/student/notes', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(memory),
  });
  const payload = await readPayload(response);
  const record = parseStudentWorkflowMemory(payload.record);
  if (!response.ok || !payload.success || !record) {
    throw new Error(payload.error || '数据库笔记保存失败');
  }
  return record;
}

export async function hydrateStudentWorkflowMemories(
  localRecords: StudentWorkflowMemory[],
): Promise<{ records: StudentWorkflowMemory[]; databaseConnected: boolean }> {
  try {
    const remoteRecords = await fetchStudentWorkflowMemories();
    const remoteById = new Map(remoteRecords.map((record) => [record.workflow.id, record]));
    const pendingMigration = localRecords.filter((local) => {
      const remote = remoteById.get(local.workflow.id);
      return !remote || local.updatedAt > remote.updatedAt;
    });
    if (pendingMigration.length > 0) {
      await Promise.allSettled(pendingMigration.map(persistStudentWorkflowMemory));
    }
    return {
      records: mergeStudentWorkflowMemories(localRecords, remoteRecords),
      databaseConnected: true,
    };
  } catch {
    return { records: localRecords, databaseConnected: false };
  }
}
