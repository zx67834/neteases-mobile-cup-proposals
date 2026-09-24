import { getCampusSessionFromRequest } from '@/lib/auth/campus-auth';
import { listCampusCourses } from '@/lib/persistence/campus-data';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  if (session.role === 'admin') return apiSuccess({ records: [] });
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  const records = await listCampusCourses(pool, session);
  return apiSuccess({ records });
}
