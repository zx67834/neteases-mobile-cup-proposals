import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import {
  listStudentLearningWorkflows,
  upsertStudentLearningWorkflow,
} from '@/lib/persistence/student-learning';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { ANONYMOUS_STUDENT_ID } from '@/lib/student-workflow/identity';
import { parseStudentWorkflowMemory } from '@/lib/student-workflow/storage';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 1_500_000;

function databaseUrl(): string | null {
  const value = process.env.DATABASE_URL?.trim();
  return value || null;
}
export async function GET(request: Request) {
  if (!isServerPersistenceConfigured()) return new Response('Not found', { status: 404 });
  const connectionString = databaseUrl();
  if (!connectionString) return new Response('Not found', { status: 404 });

  try {
    const courseId = new URL(request.url).searchParams.get('courseId')?.trim() || undefined;
    if (courseId && courseId.length > 200) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, '课程标识无效');
    }
    const { pool } = await getServerPersistenceProvider(connectionString);
    const records = await listStudentLearningWorkflows(
      pool,
      ANONYMOUS_STUDENT_ID,
      courseId,
    );
    return apiSuccess({ studentId: ANONYMOUS_STUDENT_ID, records });
  } catch (error) {
    console.error('[StudentNotes] Failed to list notes', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, '学习笔记读取失败');
  }
}

export async function PUT(request: Request) {
  if (!isServerPersistenceConfigured()) return new Response('Not found', { status: 404 });
  const connectionString = databaseUrl();
  if (!connectionString) return new Response('Not found', { status: 404 });

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 413, '学习笔记内容过大');
  }

  try {
    const rawText = await request.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 413, '学习笔记内容过大');
    }
    const memory = parseStudentWorkflowMemory(JSON.parse(rawText) as unknown);
    if (
      !memory ||
      memory.courseId.length > 200 ||
      memory.workflow.id.length > 200 ||
      memory.workflow.title.length > 300 ||
      memory.workflow.nodes.length > 200 ||
      Object.keys(memory.nodePositions).length > 300
    ) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, '学习笔记格式无效');
    }

    const { pool } = await getServerPersistenceProvider(connectionString);
    const record = await upsertStudentLearningWorkflow(pool, ANONYMOUS_STUDENT_ID, memory);
    return apiSuccess({ studentId: ANONYMOUS_STUDENT_ID, record });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, '学习笔记格式无效');
    }
    console.error('[StudentNotes] Failed to save note', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, '学习笔记保存失败');
  }
}
