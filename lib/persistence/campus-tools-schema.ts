import type { Queryable } from '@openmaic/storage/document/pg';

const CAMPUS_TOOLS_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS campus_tool_quizzes (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES campus_users(id) ON DELETE CASCADE,
    class_id TEXT REFERENCES campus_classes(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT '',
    difficulty TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
    source_text TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS campus_tool_quizzes_teacher_idx
    ON campus_tool_quizzes (teacher_id, status)`,
  `CREATE INDEX IF NOT EXISTS campus_tool_quizzes_class_idx
    ON campus_tool_quizzes (class_id) WHERE class_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS campus_tool_questions (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL REFERENCES campus_tool_quizzes(id) ON DELETE CASCADE,
    ord INT NOT NULL DEFAULT 0,
    qtype TEXT NOT NULL DEFAULT 'short',
    prompt TEXT NOT NULL,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    answer TEXT NOT NULL DEFAULT '',
    explanation TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS campus_tool_questions_quiz_idx
    ON campus_tool_questions (quiz_id, ord)`,
  `CREATE TABLE IF NOT EXISTS campus_tool_submissions (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL REFERENCES campus_tool_quizzes(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES campus_users(id) ON DELETE CASCADE,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    score NUMERIC(5,2),
    max_score NUMERIC(5,2),
    feedback TEXT NOT NULL DEFAULT '',
    graded_by TEXT REFERENCES campus_users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'pending_review')),
    redo_status TEXT NOT NULL DEFAULT 'none',
    redo_note TEXT NOT NULL DEFAULT '',
    redo_requested_at TIMESTAMPTZ,
    redo_reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    graded_at TIMESTAMPTZ,
    UNIQUE (quiz_id, student_id)
  )`,
  `CREATE INDEX IF NOT EXISTS campus_tool_submissions_student_idx
    ON campus_tool_submissions (student_id, created_at DESC)`,
  `ALTER TABLE campus_tool_submissions
     ADD COLUMN IF NOT EXISTS redo_status TEXT NOT NULL DEFAULT 'none'`,
  `ALTER TABLE campus_tool_submissions
     ADD COLUMN IF NOT EXISTS redo_note TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE campus_tool_submissions
     ADD COLUMN IF NOT EXISTS redo_requested_at TIMESTAMPTZ`,
  `ALTER TABLE campus_tool_submissions
     ADD COLUMN IF NOT EXISTS redo_reviewed_at TIMESTAMPTZ`,
  `DO $$
   DECLARE r RECORD;
   BEGIN
     FOR r IN
       SELECT c.conname
         FROM pg_constraint c
         JOIN pg_class t ON c.conrelid = t.oid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE t.relname = 'campus_tool_submissions'
          AND n.nspname = current_schema()
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%status%'
     LOOP
       EXECUTE format('ALTER TABLE campus_tool_submissions DROP CONSTRAINT %I', r.conname);
     END LOOP;
     ALTER TABLE campus_tool_submissions
       ADD CONSTRAINT campus_tool_submissions_status_check
       CHECK (status IN ('submitted', 'graded', 'pending_review'));
   EXCEPTION
     WHEN duplicate_object THEN NULL;
   END $$`,
  `CREATE TABLE IF NOT EXISTS campus_tool_lessons (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES campus_users(id) ON DELETE CASCADE,
    class_id TEXT REFERENCES campus_classes(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    grade TEXT NOT NULL DEFAULT '',
    duration TEXT NOT NULL DEFAULT '45分钟',
    content TEXT NOT NULL DEFAULT '',
    shared BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS campus_tool_lessons_teacher_idx
    ON campus_tool_lessons (teacher_id, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS campus_tool_notices (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL REFERENCES campus_users(id) ON DELETE CASCADE,
    audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'teachers', 'students', 'class')),
    class_id TEXT REFERENCES campus_classes(id) ON DELETE SET NULL,
    kind TEXT NOT NULL DEFAULT 'notice' CHECK (kind IN ('notice', 'minutes')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS campus_tool_notices_created_idx
    ON campus_tool_notices (created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS campus_tool_ops_requests (
    id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL REFERENCES campus_users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('reschedule', 'invigilation', 'other')),
    title TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewer_id TEXT REFERENCES campus_users(id) ON DELETE SET NULL,
    review_note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS campus_tool_ops_status_idx
    ON campus_tool_ops_requests (status, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS campus_tool_oral_sessions (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES campus_users(id) ON DELETE CASCADE,
    scene TEXT NOT NULL DEFAULT 'greeting',
    transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
    score NUMERIC(5,2),
    feedback TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS campus_tool_oral_student_idx
    ON campus_tool_oral_sessions (student_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS campus_tool_checkin_tasks (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES campus_users(id) ON DELETE CASCADE,
    class_id TEXT REFERENCES campus_classes(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NOT NULL DEFAULT CURRENT_DATE,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS campus_tool_checkin_tasks_teacher_idx
    ON campus_tool_checkin_tasks (teacher_id, published)`,
  `CREATE TABLE IF NOT EXISTS campus_tool_learning_plans (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES campus_users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS campus_tool_learning_plans_student_idx
    ON campus_tool_learning_plans (student_id, status)`,
  `CREATE TABLE IF NOT EXISTS campus_tool_learning_plan_items (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES campus_tool_learning_plans(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    ord INT NOT NULL DEFAULT 0,
    schedule_date DATE
  )`,
  `CREATE INDEX IF NOT EXISTS campus_tool_learning_plan_items_plan_idx
    ON campus_tool_learning_plan_items (plan_id, ord)`,
  `CREATE TABLE IF NOT EXISTS campus_tool_checkin_logs (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES campus_users(id) ON DELETE CASCADE,
    checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('teacher_task', 'plan_item')),
    source_id TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, checkin_date, source_kind, source_id)
  )`,
  `CREATE INDEX IF NOT EXISTS campus_tool_checkin_logs_student_idx
    ON campus_tool_checkin_logs (student_id, checkin_date DESC)`,
  // Migrations for DBs created before schedule_date / evidence existed
  `ALTER TABLE campus_tool_learning_plan_items
     ADD COLUMN IF NOT EXISTS schedule_date DATE`,
  `ALTER TABLE campus_tool_checkin_logs
     ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '[]'::jsonb`,
];

export async function ensureCampusToolsSchema(queryable: Queryable): Promise<void> {
  for (const statement of CAMPUS_TOOLS_STATEMENTS) {
    await queryable.query(statement);
  }
}
