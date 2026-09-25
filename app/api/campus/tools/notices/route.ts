import { getCampusSessionFromRequest } from '@/lib/auth/campus-auth';
import { stripPlainMarkup } from '@/lib/campus-tools/plain-text';
import { createNotice, listNotices } from '@/lib/campus-tools/store';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  const records = await listNotices(pool, session);
  return apiSuccess({
    records: records.map((n) => ({
      ...n,
      title: stripPlainMarkup(String(n.title ?? '')),
      body: stripPlainMarkup(String(n.body ?? '')),
    })),
  });
}

export async function POST(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  if (session.role !== 'admin' && session.role !== 'teacher') {
    return apiError('FORBIDDEN', 403, '无权限发布');
  }
  const body = (await request.json().catch(() => null)) as {
    title?: string;
    body?: string;
    kind?: 'notice' | 'minutes';
    audience?: string;
  } | null;
  const title = stripPlainMarkup(body?.title?.trim() || '');
  const text = stripPlainMarkup(body?.body?.trim() || '');
  if (!title || !text) return apiError('INVALID_REQUEST', 400, '标题或正文无效');
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  const noticeId = await createNotice(pool, session, {
    title,
    body: text,
    kind: body?.kind === 'minutes' ? 'minutes' : 'notice',
    audience: body?.audience || 'all',
  });
  return apiSuccess({ noticeId }, 201);
}
