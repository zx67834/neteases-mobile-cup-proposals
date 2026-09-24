import type { StudentLearningWorkflow } from './types';
import { ANONYMOUS_STUDENT_ID } from './identity';
export { ANONYMOUS_STUDENT_ID } from './identity';

export const STUDENT_WORKFLOW_STORAGE_KEY = 'openmaic:student-workflows:v1:anonymous-student';

const STORAGE_VERSION = 1;
const MAX_SAVED_WORKFLOWS = 30;

export interface StudentWorkflowPosition {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface StudentWorkflowMemory {
  courseId: string;
  workflow: StudentLearningWorkflow;
  nodePositions: Record<string, StudentWorkflowPosition>;
  createdAt: number;
  updatedAt: number;
}

interface StudentWorkflowMemoryEnvelope {
  version: 1;
  studentId: typeof ANONYMOUS_STUDENT_ID;
  records: StudentWorkflowMemory[];
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isWorkflow(value: unknown): value is StudentLearningWorkflow {
  if (!value || typeof value !== 'object') return false;
  const workflow = value as Partial<StudentLearningWorkflow>;
  return (
    typeof workflow.id === 'string' &&
    typeof workflow.title === 'string' &&
    typeof workflow.prompt === 'string' &&
    Array.isArray(workflow.nodes) &&
    (workflow.connections === undefined ||
      (Array.isArray(workflow.connections) &&
        workflow.connections.every(
          (connection) =>
            connection &&
            typeof connection.id === 'string' &&
            typeof connection.source === 'string' &&
            typeof connection.target === 'string',
        ))) &&
    Array.isArray(workflow.sources) &&
    Array.isArray(workflow.suggestedPrompts)
  );
}

function isPosition(value: unknown): value is StudentWorkflowPosition {
  if (!value || typeof value !== 'object') return false;
  const position = value as Partial<StudentWorkflowPosition>;
  return (
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    (position.width === undefined || Number.isFinite(position.width)) &&
    (position.height === undefined || Number.isFinite(position.height))
  );
}

export function parseStudentWorkflowMemory(value: unknown): StudentWorkflowMemory | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StudentWorkflowMemory>;
  if (
    typeof record.courseId !== 'string' ||
    !isWorkflow(record.workflow) ||
    typeof record.createdAt !== 'number' ||
    typeof record.updatedAt !== 'number'
  ) {
    return null;
  }

  const nodePositions = Object.fromEntries(
    Object.entries(record.nodePositions ?? {}).filter(
      (entry): entry is [string, StudentWorkflowPosition] => isPosition(entry[1]),
    ),
  );
  return { ...record, nodePositions } as StudentWorkflowMemory;
}

export function readStudentWorkflowMemories(
  storage: Storage | null = browserStorage(),
): StudentWorkflowMemory[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STUDENT_WORKFLOW_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StudentWorkflowMemoryEnvelope>;
    if (
      parsed.version !== STORAGE_VERSION ||
      parsed.studentId !== ANONYMOUS_STUDENT_ID ||
      !Array.isArray(parsed.records)
    ) {
      return [];
    }
    return parsed.records
      .map(parseStudentWorkflowMemory)
      .filter((record): record is StudentWorkflowMemory => record !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SAVED_WORKFLOWS);
  } catch {
    return [];
  }
}

export function mergeStudentWorkflowMemories(
  ...sources: StudentWorkflowMemory[][]
): StudentWorkflowMemory[] {
  const byId = new Map<string, StudentWorkflowMemory>();
  for (const memory of sources.flat()) {
    const existing = byId.get(memory.workflow.id);
    if (!existing || memory.updatedAt > existing.updatedAt) {
      byId.set(memory.workflow.id, memory);
    }
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SAVED_WORKFLOWS);
}

export function saveStudentWorkflowMemory(
  memory: StudentWorkflowMemory,
  storage: Storage | null = browserStorage(),
): StudentWorkflowMemory[] {
  if (!storage) return [];
  const records = readStudentWorkflowMemories(storage).filter(
    (record) => record.workflow.id !== memory.workflow.id,
  );
  const nextRecords = [memory, ...records]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SAVED_WORKFLOWS);
  const envelope: StudentWorkflowMemoryEnvelope = {
    version: STORAGE_VERSION,
    studentId: ANONYMOUS_STUDENT_ID,
    records: nextRecords,
  };
  try {
    storage.setItem(STUDENT_WORKFLOW_STORAGE_KEY, JSON.stringify(envelope));
    return nextRecords;
  } catch {
    return records;
  }
}
