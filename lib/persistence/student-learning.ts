import type { Queryable } from '@openmaic/storage/document/pg';
import { encodeJson } from '@openmaic/storage/pg-json';

import type { StudentWorkflowMemory } from '@/lib/student-workflow/storage';

interface RawStudentLearningRow extends Record<string, unknown> {
  course_id: string;
  workflow: unknown;
  node_positions: unknown;
  created_at: number | string;
  updated_at: number | string;
}

export const STUDENT_LEARNING_SCHEMA = `
CREATE TABLE IF NOT EXISTS student_learning_workflows (
  student_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  intent TEXT NOT NULL,
  workflow JSONB NOT NULL,
  node_positions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at DOUBLE PRECISION NOT NULL,
  updated_at DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (student_id, workflow_id)
);

CREATE INDEX IF NOT EXISTS student_learning_student_updated_idx
  ON student_learning_workflows (student_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS student_learning_course_updated_idx
  ON student_learning_workflows (student_id, course_id, updated_at DESC);
`;

export async function ensureStudentLearningSchema(queryable: Queryable): Promise<void> {
  for (const sql of STUDENT_LEARNING_SCHEMA.split(';')) {
    const statement = sql.trim();
    if (statement !== '') await queryable.query(statement);
  }
}

function decodeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function mapRow(row: RawStudentLearningRow): StudentWorkflowMemory {
  return {
    courseId: row.course_id,
    workflow: decodeJson(row.workflow) as StudentWorkflowMemory['workflow'],
    nodePositions: decodeJson(row.node_positions) as StudentWorkflowMemory['nodePositions'],
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function listStudentLearningWorkflows(
  queryable: Queryable,
  studentId: string,
  courseId?: string,
): Promise<StudentWorkflowMemory[]> {
  const result = await queryable.query<RawStudentLearningRow>(
    `SELECT course_id, workflow, node_positions, created_at, updated_at
       FROM student_learning_workflows
      WHERE student_id = $1
        AND ($2::text IS NULL OR course_id = $2)
      ORDER BY updated_at DESC
      LIMIT 100`,
    [studentId, courseId ?? null],
  );
  return result.rows.map(mapRow);
}

export async function upsertStudentLearningWorkflow(
  queryable: Queryable,
  studentId: string,
  memory: StudentWorkflowMemory,
): Promise<StudentWorkflowMemory> {
  const result = await queryable.query<RawStudentLearningRow>(
    `INSERT INTO student_learning_workflows (
       student_id, workflow_id, course_id, title, intent, workflow,
       node_positions, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)
     ON CONFLICT (student_id, workflow_id) DO UPDATE SET
       course_id = EXCLUDED.course_id,
       title = EXCLUDED.title,
       intent = EXCLUDED.intent,
       workflow = EXCLUDED.workflow,
       node_positions = EXCLUDED.node_positions,
       created_at = LEAST(student_learning_workflows.created_at, EXCLUDED.created_at),
       updated_at = EXCLUDED.updated_at
     WHERE EXCLUDED.updated_at >= student_learning_workflows.updated_at
     RETURNING course_id, workflow, node_positions, created_at, updated_at`,
    [
      studentId,
      memory.workflow.id,
      memory.courseId,
      memory.workflow.title,
      memory.workflow.intent,
      encodeJson(memory.workflow, 'student learning workflow'),
      encodeJson(memory.nodePositions, 'student learning node positions'),
      memory.createdAt,
      memory.updatedAt,
    ],
  );

  const row = result.rows[0];
  if (row) return mapRow(row);
  const existing = await listStudentLearningWorkflows(queryable, studentId, memory.courseId);
  return existing.find((item) => item.workflow.id === memory.workflow.id) ?? memory;
}
