import { getCampusSessionFromRequest } from '@/lib/auth/campus-auth';
import { createOpsRequest, listOpsRequests, reviewOpsRequest } from '@/lib/campus-tools/store';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  return apiSuccess({ records: await listOpsRequests(pool, session) });
}

export async function POST(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  if (session.role === 'student') return apiError('FORBIDDEN', 403, '学生不可提交运行事务');
  const body = (await request.json().catch(() => null)) as {
    kind?: string;
    title?: string;
    detail?: string;
  } | null;
  const kind = body?.kind === 'invigilation' || body?.kind === 'other' ? body.kind : 'reschedule';
  const title = body?.title?.trim() || '';
  if (!title) return apiError('INVALID_REQUEST', 400, '请填写标题');
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  const opsId = await createOpsRequest(pool, session, {
    kind,
    title,
    detail: body?.detail?.trim() || '',
  });
  return apiSuccess({ opsId }, 201);
}

export async function PATCH(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  if (session.role !== 'admin') return apiError('FORBIDDEN', 403, '仅行政可审批');
  const body = (await request.json().catch(() => null)) as {
    opsId?: string;
    status?: 'approved' | 'rejected';
    note?: string;
  } | null;
  if (!body?.opsId || (body.status !== 'approved' && body.status !== 'rejected')) {
    return apiError('INVALID_REQUEST', 400, '参数无效');
  }
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  const ok = await reviewOpsRequest(pool, session.id, body.opsId, body.status, body.note?.trim() || '');
  if (!ok) return apiError('NOT_FOUND', 404, '申请不存在或已处理');
  return apiSuccess({ updated: true });
}
