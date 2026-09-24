import 'server-only';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import type { Pool, PoolClient } from 'pg';

import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';

export const CAMPUS_SESSION_COOKIE = 'openmaic_campus_session';
export const CAMPUS_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export type CampusRole = 'teacher' | 'student' | 'admin';

export interface CampusUser {
  id: string;
  username: string;
  displayName: string;
  role: CampusRole;
  userKey: string;
}

export interface CampusSession extends CampusUser {
  sessionId: string;
  expiresAt: Date;
}

interface CampusUserRow extends Record<string, unknown> {
  id: string;
  username: string;
  display_name: string;
  role: CampusRole;
  user_key: string;
}

interface CampusSessionRow extends CampusUserRow {
  session_id: string;
  expires_at: Date | string;
}

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required for campus authentication');
  return value;
}

async function authPool(): Promise<Pool> {
  return (await getServerPersistenceProvider(databaseUrl())).pool;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function mapUser(row: CampusUserRow): CampusUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    userKey: row.user_key,
  };
}

function readCookieHeader(request: Pick<Request, 'headers'>, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== '0',
    path: '/',
    maxAge: CAMPUS_SESSION_MAX_AGE_SECONDS,
  };
}

async function findSession(token: string | null): Promise<CampusSession | null> {
  if (!token) return null;
  const pool = await authPool();
  const result = await pool.query<CampusSessionRow>(
    `SELECT s.id AS session_id, s.expires_at,
            u.id, u.username, u.display_name, u.role, u.user_key
       FROM campus_user_sessions s
       JOIN campus_users u ON u.id = s.user_id
      WHERE s.session_token = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.is_active = TRUE
      LIMIT 1`,
    [tokenHash(token)],
  );
  const row = result.rows[0];
  return row
    ? { ...mapUser(row), sessionId: row.session_id, expiresAt: new Date(row.expires_at) }
    : null;
}

export async function getCampusSessionFromRequest(
  request: Pick<Request, 'headers'>,
): Promise<CampusSession | null> {
  return findSession(readCookieHeader(request, CAMPUS_SESSION_COOKIE));
}

export async function getCurrentCampusSession(): Promise<CampusSession | null> {
  const cookieStore = await cookies();
  return findSession(cookieStore.get(CAMPUS_SESSION_COOKIE)?.value ?? null);
}

export async function registerCampusUser(input: {
  username: string;
  password: string;
  displayName: string;
  role: Exclude<CampusRole, 'admin'>;
}): Promise<CampusUser> {
  const pool = await authPool();
  const id = `user_${randomBytes(12).toString('base64url')}`;
  const userKey = `campus:${input.role}:${randomBytes(18).toString('base64url')}`;
  const result = await pool.query<CampusUserRow>(
    `INSERT INTO campus_users (id, username, password_hash, display_name, role, user_key)
     VALUES ($1, $2, public.crypt($3, public.gen_salt('bf', 12)), $4, $5, $6)
     RETURNING id, username, display_name, role, user_key`,
    [id, input.username, input.password, input.displayName, input.role, userKey],
  );
  const user = mapUser(result.rows[0]);
  await pool.query(
    `INSERT INTO campus_auth_events (user_id, username, event_type, role, detail)
     VALUES ($1, $2, 'register', $3, '{"source":"web"}'::jsonb)`,
    [user.id, user.username, user.role],
  );
  return user;
}

export async function verifyCampusCredentials(
  username: string,
  password: string,
  metadata: { ip?: string | null; userAgent?: string | null } = {},
): Promise<CampusUser | null> {
  const pool = await authPool();
  const result = await pool.query<CampusUserRow>(
    `SELECT id, username, display_name, role, user_key
       FROM campus_users
      WHERE lower(username) = lower($1)
        AND is_active = TRUE
        AND password_hash = public.crypt($2, password_hash)
      LIMIT 1`,
    [username, password],
  );
  const row = result.rows[0];
  const user = row ? mapUser(row) : null;
  await pool.query(
    `INSERT INTO campus_auth_events (user_id, username, event_type, role, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      user?.id ?? null,
      username,
      user ? 'login_success' : 'login_failed',
      user?.role ?? null,
      metadata.ip ?? null,
      metadata.userAgent ?? null,
    ],
  );
  if (user) {
    await pool.query(
      `UPDATE campus_users SET last_login_at = now(), updated_at = now() WHERE id = $1`,
      [user.id],
    );
  }
  return user;
}

export async function createCampusSession(user: CampusUser): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const pool = await authPool();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + CAMPUS_SESSION_MAX_AGE_SECONDS * 1000);
  await pool.query(
    `INSERT INTO campus_user_sessions
       (id, user_id, session_token, role, user_key, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), user.id, tokenHash(token), user.role, user.userKey, expiresAt],
  );
  return { token, expiresAt };
}

export async function revokeCampusSession(token: string | null): Promise<void> {
  if (!token) return;
  const pool = await authPool();
  const result = await pool.query<{ user_id: string; username: string; role: CampusRole }>(
    `UPDATE campus_user_sessions s
        SET revoked_at = now()
       FROM campus_users u
      WHERE s.session_token = $1 AND s.user_id = u.id AND s.revoked_at IS NULL
      RETURNING s.user_id, u.username, u.role`,
    [tokenHash(token)],
  );
  const session = result.rows[0];
  if (session) {
    await pool.query(
      `INSERT INTO campus_auth_events (user_id, username, event_type, role)
       VALUES ($1, $2, 'logout', $3)`,
      [session.user_id, session.username, session.role],
    );
  }
}

async function migrateStudentNotes(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `INSERT INTO student_learning_workflows
       (student_id, workflow_id, course_id, title, intent, workflow, node_positions, created_at, updated_at)
     SELECT $1, workflow_id, course_id, title, intent, workflow, node_positions, created_at, updated_at
       FROM student_learning_workflows
      WHERE student_id = 'anonymous-student'
     ON CONFLICT (student_id, workflow_id) DO UPDATE SET
       course_id = EXCLUDED.course_id,
       title = EXCLUDED.title,
       intent = EXCLUDED.intent,
       workflow = CASE WHEN EXCLUDED.updated_at >= student_learning_workflows.updated_at THEN EXCLUDED.workflow ELSE student_learning_workflows.workflow END,
       node_positions = CASE WHEN EXCLUDED.updated_at >= student_learning_workflows.updated_at THEN EXCLUDED.node_positions ELSE student_learning_workflows.node_positions END,
       updated_at = GREATEST(student_learning_workflows.updated_at, EXCLUDED.updated_at)`,
    [userId],
  );
}

export async function migrateAnonymousDataForLogin(
  user: CampusUser,
  anonymousOwnerId?: string | null,
): Promise<void> {
  const pool = await authPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (user.role === 'teacher' && anonymousOwnerId) {
      await client.query(`UPDATE document_stages SET owner_id = $1 WHERE owner_id = $2`, [
        user.userKey,
        anonymousOwnerId,
      ]);
      await client.query(`UPDATE stage_meta SET owner_id = $1 WHERE owner_id = $2`, [
        user.userKey,
        anonymousOwnerId,
      ]);
    }
    if (user.role === 'teacher') {
      const classId = `class_${user.id}`;
      await client.query(
        `INSERT INTO campus_classes (id, teacher_id, name, invite_code)
         VALUES ($1, $2, $3, upper(substr(md5($2), 1, 8)))
         ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
        [classId, user.id, `${user.displayName || '教师'}的班级`],
      );
      await client.query(
        `INSERT INTO campus_courses
           (id, teacher_id, class_id, stage_id, title, description, status, content_rev, published_at, created_at, updated_at)
         SELECT 'course_' || d.id, $1, $3, d.id, d.name, COALESCE(d.description, ''),
                CASE WHEN COALESCE(m.is_public, FALSE) THEN 'published' ELSE 'draft' END,
                1,
                CASE WHEN m.published_at IS NULL THEN NULL ELSE to_timestamp(m.published_at / 1000.0) END,
                to_timestamp(d.created_at / 1000.0), to_timestamp(d.updated_at / 1000.0)
           FROM document_stages d
           LEFT JOIN stage_meta m ON m.stage_id = d.id
          WHERE d.owner_id = $2
         ON CONFLICT (teacher_id, stage_id) WHERE stage_id IS NOT NULL DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           updated_at = EXCLUDED.updated_at`,
        [user.id, user.userKey, classId],
      );
    }
    if (user.role === 'student') await migrateStudentNotes(client, user.id);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function campusHomeForRole(role: CampusRole): string {
  if (role === 'teacher') return '/teacher';
  if (role === 'student') return '/student';
  return '/admin';
}

export function anonymousOwnerFromRequest(request: Pick<Request, 'headers'>): string | null {
  const sharedOwner = process.env.OPENMAIC_SHARED_OWNER_ID?.trim();
  if (sharedOwner) return sharedOwner;
  const anonymousId = readCookieHeader(request, 'anonymous_id');
  return anonymousId ? `anon:${anonymousId}` : null;
}
