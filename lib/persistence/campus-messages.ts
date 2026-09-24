import type { Queryable } from '@openmaic/storage/document/pg';

import type { CampusSession } from '@/lib/auth/campus-auth';

export interface CampusMessageContact {
  id: string;
  displayName: string;
  role: 'teacher' | 'student';
}

export interface CampusMessageItem {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  subject: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

interface ContactRow extends Record<string, unknown> {
  id: string;
  display_name: string;
  role: 'teacher' | 'student';
}

interface MessageRow extends Record<string, unknown> {
  id: string;
  sender_id: string;
  sender_name: string;
  recipient_id: string;
  recipient_name: string;
  subject: string;
  body: string;
  read_at: Date | string | null;
  created_at: Date | string;
}

function mapMessage(row: MessageRow): CampusMessageItem {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    recipientId: row.recipient_id,
    recipientName: row.recipient_name,
    subject: row.subject,
    body: row.body,
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listCampusMessageContacts(
  queryable: Queryable,
  session: CampusSession,
): Promise<CampusMessageContact[]> {
  if (session.role === 'admin') return [];
  const result = await queryable.query<ContactRow>(
    session.role === 'teacher'
      ? `SELECT DISTINCT u.id, u.display_name, u.role
           FROM campus_users u
           JOIN campus_class_members cm ON cm.student_id = u.id AND cm.status = 'active'
           JOIN campus_classes cl ON cl.id = cm.class_id
          WHERE cl.teacher_id = $1 AND u.is_active = TRUE
          ORDER BY u.display_name`
      : `SELECT DISTINCT u.id, u.display_name, u.role
           FROM campus_users u
          WHERE u.is_active = TRUE AND u.role = 'teacher' AND (
            EXISTS (
              SELECT 1 FROM campus_class_members cm
              JOIN campus_classes cl ON cl.id = cm.class_id
              WHERE cm.student_id = $1 AND cm.status = 'active' AND cl.teacher_id = u.id
            ) OR EXISTS (
              SELECT 1 FROM campus_course_enrollments e
              JOIN campus_courses c ON c.id = e.course_id
              WHERE e.student_id = $1 AND e.status = 'active' AND c.teacher_id = u.id
            )
          )
          ORDER BY u.display_name`,
    [session.id],
  );
  return result.rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    role: row.role,
  }));
}

export async function listCampusMessages(
  queryable: Queryable,
  session: CampusSession,
): Promise<CampusMessageItem[]> {
  const result = await queryable.query<MessageRow>(
    `SELECT m.id, m.sender_id, sender.display_name AS sender_name,
            m.recipient_id, recipient.display_name AS recipient_name,
            m.subject, m.body, m.read_at, m.created_at
       FROM campus_messages m
       JOIN campus_users sender ON sender.id = m.sender_id
       JOIN campus_users recipient ON recipient.id = m.recipient_id
      WHERE m.sender_id = $1 OR m.recipient_id = $1
      ORDER BY m.created_at ASC
      LIMIT 500`,
    [session.id],
  );
  return result.rows.map(mapMessage);
}

export async function sendCampusMessage(
  queryable: Queryable,
  session: CampusSession,
  recipientId: string,
  body: string,
  subject = '',
): Promise<CampusMessageItem | null> {
  const contacts = await listCampusMessageContacts(queryable, session);
  if (!contacts.some((contact) => contact.id === recipientId)) return null;
  const result = await queryable.query<MessageRow>(
    `WITH inserted AS (
       INSERT INTO campus_messages (id, sender_id, recipient_id, subject, body)
       VALUES ('msg_' || encode(gen_random_bytes(12), 'hex'), $1, $2, $3, $4)
       RETURNING *
     )
     SELECT m.id, m.sender_id, sender.display_name AS sender_name,
            m.recipient_id, recipient.display_name AS recipient_name,
            m.subject, m.body, m.read_at, m.created_at
       FROM inserted m
       JOIN campus_users sender ON sender.id = m.sender_id
       JOIN campus_users recipient ON recipient.id = m.recipient_id`,
    [session.id, recipientId, subject, body],
  );
  return result.rows[0] ? mapMessage(result.rows[0]) : null;
}

export async function markCampusMessagesRead(
  queryable: Queryable,
  session: CampusSession,
  messageId?: string,
): Promise<void> {
  await queryable.query(
    `UPDATE campus_messages SET read_at = COALESCE(read_at, now())
      WHERE recipient_id = $1 AND ($2::text IS NULL OR id = $2)`,
    [session.id, messageId ?? null],
  );
}
