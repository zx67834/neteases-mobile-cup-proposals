import { getCampusSessionFromRequest } from '@/lib/auth/campus-auth';
import { listLessons, saveLesson } from '@/lib/campus-tools/store';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  return apiSuccess({ records: await listLessons(pool, session) });
}

export async function POST(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  if (session.role !== 'teacher') return apiError('FORBIDDEN', 403, '仅教师可保存教案');
  const body = (await request.json().catch(() => null)) as {
    title?: string;
    subject?: string;
    grade?: string;
    duration?: string;
    content?: string;
    shared?: boolean;
  } | null;
  const title = body?.title?.trim() || '';
  const content = body?.content?.trim() || '';
  if (!title || !content) return apiError('INVALID_REQUEST', 400, '标题或内容无效');
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  const lessonId = await saveLesson(pool, session, {
    title,
    subject: body?.subject?.trim() || '',
    grade: body?.grade?.trim() || '',
    duration: body?.duration?.trim() || '45分钟',
    content,
    shared: Boolean(body?.shared),
  });
  return apiSuccess({ lessonId }, 201);
}
