import type { Queryable } from '@openmaic/storage/document/pg';

const CAMPUS_SCHEMA_STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public`,
  `CREATE TABLE IF NOT EXISTS campus_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    real_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL CHECK (role IN ('teacher', 'student', 'admin')),
    user_key TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
  )`,
  `ALTER TABLE campus_users ADD COLUMN IF NOT EXISTS real_name TEXT NOT NULL DEFAULT ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS campus_users_username_uidx
    ON campus_users (lower(username))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS campus_users_user_key_uidx
    ON campus_users (user_key)`,
  `CREATE INDEX IF NOT EXISTS campus_users_role_idx
    ON campus_users (role) WHERE is_active`,
  `CREATE TABLE IF NOT EXISTS campus_user_model_settings (
    user_id TEXT PRIMARY KEY REFERENCES campus_users(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL DEFAULT 'deepseek',
    model_id TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
    api_key_ciphertext TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE campus_user_model_settings
    DROP CONSTRAINT IF EXISTS campus_user_model_settings_provider_id_check`,
  `CREATE TABLE IF NOT EXISTS campus_user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES campus_users(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('teacher', 'student', 'admin')),
    user_key TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS campus_user_sessions_token_uidx
    ON campus_user_sessions (session_token)`,
  `CREATE INDEX IF NOT EXISTS campus_user_sessions_user_live_idx
    ON campus_user_sessions (user_id, expires_at) WHERE revoked_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS campus_auth_events (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT REFERENCES campus_users(id) ON DELETE SET NULL,
    username TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN ('register', 'login_success', 'login_failed', 'logout', 'revoke')),
    role TEXT CHECK (role IS NULL OR role IN ('teacher', 'student', 'admin')),
    ip TEXT,
    user_agent TEXT,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS campus_auth_events_user_idx
    ON campus_auth_events (user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS campus_auth_events_type_idx
    ON campus_auth_events (event_type, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS campus_classes (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES campus_users(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    term TEXT,
    invite_code TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS campus_classes_invite_code_uidx
    ON campus_classes (invite_code)`,
  `CREATE INDEX IF NOT EXISTS campus_classes_teacher_idx
    ON campus_classes (teacher_id) WHERE is_active`,
  `CREATE TABLE IF NOT EXISTS campus_class_members (
    class_id TEXT NOT NULL REFERENCES campus_classes(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES campus_users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (class_id, student_id)
  )`,
  `CREATE INDEX IF NOT EXISTS campus_class_members_student_idx
    ON campus_class_members (student_id) WHERE status = 'active'`,
  `CREATE TABLE IF NOT EXISTS campus_courses (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES campus_users(id) ON DELETE RESTRICT,
    class_id TEXT REFERENCES campus_classes(id) ON DELETE SET NULL,
    stage_id TEXT REFERENCES document_stages(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    content_rev BIGINT NOT NULL DEFAULT 0,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS campus_courses_teacher_idx
    ON campus_courses (teacher_id, status)`,
  `CREATE INDEX IF NOT EXISTS campus_courses_stage_idx
    ON campus_courses (stage_id) WHERE stage_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS campus_courses_teacher_stage_uidx
    ON campus_courses (teacher_id, stage_id) WHERE stage_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS campus_messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL REFERENCES campus_users(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES campus_users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (sender_id <> recipient_id)
  )`,
  `CREATE INDEX IF NOT EXISTS campus_messages_recipient_idx
    ON campus_messages (recipient_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS campus_messages_thread_idx
    ON campus_messages (sender_id, recipient_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS campus_course_enrollments (
    course_id TEXT NOT NULL REFERENCES campus_courses(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES campus_users(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('class_sync', 'teacher_add', 'self_join')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dropped')),
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (course_id, student_id)
  )`,
  `CREATE INDEX IF NOT EXISTS campus_course_enrollments_student_idx
    ON campus_course_enrollments (student_id) WHERE status = 'active'`,
  // Postgres CREATE OR REPLACE VIEW cannot rename/reorder columns; drop first.
  `DROP VIEW IF EXISTS v_campus_student_courses`,
  `CREATE VIEW v_campus_student_courses AS
    SELECT e.student_id, s.username AS student_username, s.display_name AS student_name,
      e.status AS enrollment_status, e.source AS enrollment_source, e.enrolled_at,
      c.id AS course_id, c.title, c.description, c.status AS course_status,
      c.stage_id, c.content_rev, c.teacher_id, t.username AS teacher_username,
      t.display_name AS teacher_name, c.class_id
    FROM campus_course_enrollments e
    JOIN campus_courses c ON c.id = e.course_id
    JOIN campus_users s ON s.id = e.student_id
    JOIN campus_users t ON t.id = c.teacher_id`,
  `DROP VIEW IF EXISTS v_campus_teacher_courses`,
  `CREATE VIEW v_campus_teacher_courses AS
    SELECT c.id AS course_id, c.title, c.description, c.status, c.stage_id, c.class_id,
      c.content_rev, c.teacher_id, u.username AS teacher_username,
      u.display_name AS teacher_name, c.published_at, c.created_at, c.updated_at,
      count(e.student_id) FILTER (WHERE e.status = 'active')::bigint AS active_students
    FROM campus_courses c
    JOIN campus_users u ON u.id = c.teacher_id
    LEFT JOIN campus_course_enrollments e ON e.course_id = c.id
    GROUP BY c.id, u.id`,
];

export async function ensureCampusSchema(queryable: Queryable): Promise<void> {
  for (const statement of CAMPUS_SCHEMA_STATEMENTS) {
    await queryable.query(statement);
  }
}
