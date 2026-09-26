import { getCampusSessionFromRequest } from '@/lib/auth/campus-auth';
import { listLessons, saveLesson } from '@/lib/campus-tools/store';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  try {
    const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
    return apiSuccess({ records: await listLessons(pool, session) });
  } catch (e) {
    const message = e instanceof Error ? e.message : '教案列表加载失败';
    return apiError('INTERNAL_ERROR', 500, message);
  }
}

export async function POST(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  if (session.role !== 'teacher') return apiError('FORBIDDEN', 403, '仅教师可保存教案');
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    title?: string;
    subject?: string;
    grade?: string;
    duration?: string;
    content?: string;
    shared?: boolean;
    status?: 'draft' | 'saved';
  } | null;
  const title = body?.title?.trim() || '';
  const content = body?.content?.trim() || '';
  if (!title || !content) return apiError('INVALID_REQUEST', 400, '标题或内容无效');
  const status = body?.status === 'draft' ? 'draft' : 'saved';
  try {
    const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
    const lessonId = await saveLesson(pool, session, {
      id: body?.id?.trim() || undefined,
      title,
      subject: body?.subject?.trim() || '',
      grade: body?.grade?.trim() || '',
      duration: body?.duration?.trim() || '45分钟',
      content,
      shared: Boolean(body?.shared),
      status,
    });
    if (!lessonId) return apiError('NOT_FOUND', 404, '教案不存在或无权修改');
    return apiSuccess({ lessonId, status }, body?.id ? 200 : 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : '保存失败';
    console.error('[lessons] save failed:', e);
    return apiError('INTERNAL_ERROR', 500, message);
  }
}
