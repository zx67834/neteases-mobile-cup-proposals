import { getCampusSessionFromRequest } from '@/lib/auth/campus-auth';
import { readCheckinEvidenceFile } from '@/lib/campus-tools/checkin-files';
import { getCheckinLogForStudent } from '@/lib/campus-tools/store';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { apiError } from '@/lib/server/api-response';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const session = await getCampusSessionFromRequest(request);
    if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');

    const url = new URL(request.url);
    const logId = url.searchParams.get('logId') || '';
    const fileId = url.searchParams.get('fileId') || '';
    if (!logId || !fileId) return apiError('INVALID_REQUEST', 400, '缺少文件参数');

    const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
    const log = await getCheckinLogForStudent(pool, session.id, logId);
    if (!log && session.role === 'teacher') {
      // Teachers can still be blocked for now — evidence is student-scoped.
      return apiError('NOT_FOUND', 404, '文件不存在');
    }
    if (!log) return apiError('NOT_FOUND', 404, '文件不存在');

    const evidence = Array.isArray(log.evidence) ? log.evidence : [];
    const file = evidence.find((e) => e.id === fileId);
    if (!file?.stored) return apiError('NOT_FOUND', 404, '文件不存在');

    const bytes = await readCheckinEvidenceFile(file.stored);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': file.mime || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name || 'file')}`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[campus/tools/checkin/file GET]', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : '读取文件失败',
    );
  }
}
