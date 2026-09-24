import { getCampusSessionFromRequest } from '@/lib/auth/campus-auth';
import { joinCampusClass } from '@/lib/persistence/campus-data';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  if (session.role !== 'student') return apiError('FORBIDDEN', 403, '只有学生可以加入班级');
  const body = (await request.json().catch(() => null)) as { inviteCode?: unknown } | null;
  const inviteCode = typeof body?.inviteCode === 'string' ? body.inviteCode.trim() : '';
  if (!inviteCode || inviteCode.length > 32) return apiError('INVALID_REQUEST', 400, '课堂码无效');
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  const joined = await joinCampusClass(pool, session.id, inviteCode);
  if (!joined) return apiError('NOT_FOUND', 404, '没有找到这个班级，请检查课堂码');
  return apiSuccess(joined);
}
