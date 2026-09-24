import { getCampusSessionFromRequest } from '@/lib/auth/campus-auth';
import {
  listCampusMessageContacts,
  listCampusMessages,
  markCampusMessagesRead,
  sendCampusMessage,
} from '@/lib/persistence/campus-messages';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  const [records, contacts] = await Promise.all([
    listCampusMessages(pool, session),
    listCampusMessageContacts(pool, session),
  ]);
  return apiSuccess({
    records,
    contacts,
    currentUserId: session.id,
    unreadCount: records.filter((item) => item.recipientId === session.id && !item.readAt).length,
  });
}

export async function POST(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  if (session.role === 'admin') return apiError('FORBIDDEN', 403, '教务端消息功能暂未开放');
  const body = (await request.json().catch(() => null)) as {
    recipientId?: unknown;
    body?: unknown;
    subject?: unknown;
  } | null;
  const recipientId = typeof body?.recipientId === 'string' ? body.recipientId.trim() : '';
  const content = typeof body?.body === 'string' ? body.body.trim() : '';
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  if (!recipientId || !content || content.length > 4000 || subject.length > 120) {
    return apiError('INVALID_REQUEST', 400, '消息内容无效');
  }
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  const message = await sendCampusMessage(pool, session, recipientId, content, subject);
  if (!message) return apiError('FORBIDDEN', 403, '只能联系与你有课程关系的老师或学生');
  return apiSuccess({ message }, 201);
}

export async function PATCH(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  const body = (await request.json().catch(() => null)) as { messageId?: unknown } | null;
  const messageId = typeof body?.messageId === 'string' ? body.messageId.trim() : undefined;
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  await markCampusMessagesRead(pool, session, messageId);
  return apiSuccess({ updated: true });
}
