import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Queryable } from '@openmaic/storage/document/pg';

import {
  ensureStudentLearningSchema,
  listStudentLearningWorkflows,
  upsertStudentLearningWorkflow,
} from '@/lib/persistence/student-learning';
import { ANONYMOUS_STUDENT_ID } from '@/lib/student-workflow/identity';
import type { StudentWorkflowMemory } from '@/lib/student-workflow/storage';

function record(updatedAt = 200): StudentWorkflowMemory {
  return {
    courseId: 'course-1',
    workflow: {
      id: 'workflow-1',
      intent: 'note',
      title: '二分查找笔记',
      summary: '课程重点',
      prompt: '整理边界处理',
      nodes: [
        {
          id: 'note-1',
          kind: 'note',
          title: '边界条件',
          content: '循环不变量',
          sourceSceneIds: ['scene-1'],
        },
      ],
      sources: [],
      suggestedPrompts: [],
    },
    nodePositions: { 'note-1': { x: 120, y: 240 } },
    createdAt: 100,
    updatedAt,
  };
}

describe('student learning persistence', () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await db.waitReady;
    await ensureStudentLearningSchema(db as unknown as Queryable);
  });

  afterEach(async () => {
    await db.close();
  });

  it('stores and lists the anonymous student workflow by course', async () => {
    await upsertStudentLearningWorkflow(db as unknown as Queryable, ANONYMOUS_STUDENT_ID, record());

    await expect(
      listStudentLearningWorkflows(db as unknown as Queryable, ANONYMOUS_STUDENT_ID, 'course-1'),
    ).resolves.toEqual([record()]);
  });

  it('does not overwrite a newer database copy with stale browser data', async () => {
    await upsertStudentLearningWorkflow(
      db as unknown as Queryable,
      ANONYMOUS_STUDENT_ID,
      record(300),
    );
    await upsertStudentLearningWorkflow(
      db as unknown as Queryable,
      ANONYMOUS_STUDENT_ID,
      record(200),
    );

    const records = await listStudentLearningWorkflows(
      db as unknown as Queryable,
      ANONYMOUS_STUDENT_ID,
    );
    expect(records[0]?.updatedAt).toBe(300);
  });
});
