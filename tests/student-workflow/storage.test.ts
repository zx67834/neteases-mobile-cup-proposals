import { beforeEach, describe, expect, it } from 'vitest';

import {
  ANONYMOUS_STUDENT_ID,
  mergeStudentWorkflowMemories,
  readStudentWorkflowMemories,
  saveStudentWorkflowMemory,
  STUDENT_WORKFLOW_STORAGE_KEY,
  type StudentWorkflowMemory,
} from '@/lib/student-workflow/storage';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  };
}

function record(overrides: Partial<StudentWorkflowMemory> = {}): StudentWorkflowMemory {
  return {
    courseId: 'course-1',
    workflow: {
      id: 'workflow-1',
      intent: 'question',
      title: '边界问题',
      summary: '课程学习记录',
      prompt: '为什么会越界？',
      nodes: [],
      sources: [],
      suggestedPrompts: [],
    },
    nodePositions: { goal: { x: 80, y: 120 } },
    createdAt: 100,
    updatedAt: 200,
    ...overrides,
  };
}

describe('student workflow browser memory', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it('stores workflow content and node positions under the anonymous student', () => {
    saveStudentWorkflowMemory(record(), storage);

    expect(readStudentWorkflowMemories(storage)).toEqual([record()]);
    expect(JSON.parse(storage.getItem(STUDENT_WORKFLOW_STORAGE_KEY)!)).toMatchObject({
      version: 1,
      studentId: ANONYMOUS_STUDENT_ID,
    });
  });

  it('updates an existing workflow instead of creating a duplicate', () => {
    saveStudentWorkflowMemory(record(), storage);
    saveStudentWorkflowMemory(
      record({ updatedAt: 300, nodePositions: { goal: { x: 420, y: 360 } } }),
      storage,
    );

    const records = readStudentWorkflowMemories(storage);
    expect(records).toHaveLength(1);
    expect(records[0]?.nodePositions.goal).toEqual({ x: 420, y: 360 });
  });

  it('keeps a resized node layout across reloads', () => {
    saveStudentWorkflowMemory(
      record({ nodePositions: { goal: { x: 420, y: 360, width: 620, height: 560 } } }),
      storage,
    );

    expect(readStudentWorkflowMemories(storage)[0]?.nodePositions.goal).toEqual({
      x: 420,
      y: 360,
      width: 620,
      height: 560,
    });
  });

  it('ignores malformed cache data without breaking the student page', () => {
    storage.setItem(STUDENT_WORKFLOW_STORAGE_KEY, '{not-json');
    expect(readStudentWorkflowMemories(storage)).toEqual([]);
  });

  it('merges browser and database copies by workflow id using the newest update', () => {
    const merged = mergeStudentWorkflowMemories(
      [record({ updatedAt: 200 })],
      [record({ updatedAt: 400, nodePositions: { goal: { x: 700, y: 10 } } })],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.updatedAt).toBe(400);
    expect(merged[0]?.nodePositions.goal).toEqual({ x: 700, y: 10 });
  });
});
