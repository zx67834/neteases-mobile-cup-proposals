import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

import type { CampusSession } from '@/lib/auth/campus-auth';

function id(prefix: string) {
  return `${prefix}_${randomBytes(10).toString('base64url')}`;
}

export interface QuizQuestionInput {
  qtype: string;
  prompt: string;
  options?: string[];
  answer: string;
  explanation?: string;
}

export async function listTeacherQuizzes(pool: Pool, teacherId: string) {
  const result = await pool.query(
    `SELECT q.*,
            (SELECT count(*)::int FROM campus_tool_questions qq WHERE qq.quiz_id = q.id) AS question_count,
            (SELECT count(*)::int FROM campus_tool_submissions s WHERE s.quiz_id = q.id) AS submission_count
       FROM campus_tool_quizzes q
      WHERE q.teacher_id = $1
      ORDER BY q.updated_at DESC`,
    [teacherId],
  );
  return result.rows;
}

export async function listPublishedQuizzesForStudent(pool: Pool, studentId: string) {
  const result = await pool.query(
    `SELECT q.*, u.display_name AS teacher_name,
            (SELECT count(*)::int FROM campus_tool_questions qq WHERE qq.quiz_id = q.id) AS question_count,
            s.id AS submission_id, s.score, s.max_score, s.status AS submission_status,
            coalesce(s.redo_status, 'none') AS redo_status, s.redo_note
       FROM campus_tool_quizzes q
       JOIN campus_users u ON u.id = q.teacher_id
       LEFT JOIN campus_tool_submissions s ON s.quiz_id = q.id AND s.student_id = $1
      WHERE q.status = 'published'
        AND (
          q.class_id IS NULL
          OR EXISTS (
            SELECT 1 FROM campus_class_members m
             WHERE m.class_id = q.class_id AND m.student_id = $1 AND m.status = 'active'
          )
          OR EXISTS (
            SELECT 1 FROM campus_course_enrollments e
            JOIN campus_courses c ON c.id = e.course_id
             WHERE e.student_id = $1 AND e.status = 'active' AND c.teacher_id = q.teacher_id
          )
        )
      ORDER BY q.published_at DESC NULLS LAST, q.updated_at DESC`,
    [studentId],
  );
  return result.rows;
}

export async function createQuiz(
  pool: Pool,
  teacher: CampusSession,
  input: {
    title: string;
    topic: string;
    difficulty: string;
    sourceText: string;
    classId?: string | null;
    questions: QuizQuestionInput[];
    publish?: boolean;
  },
) {
  const quizId = id('quiz');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO campus_tool_quizzes
         (id, teacher_id, class_id, title, topic, difficulty, status, source_text, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        quizId,
        teacher.id,
        input.classId ?? null,
        input.title,
        input.topic,
        input.difficulty,
        input.publish ? 'published' : 'draft',
        input.sourceText,
        input.publish ? new Date() : null,
      ],
    );
    for (let i = 0; i < input.questions.length; i++) {
      const q = input.questions[i];
      await client.query(
        `INSERT INTO campus_tool_questions
           (id, quiz_id, ord, qtype, prompt, options, answer, explanation)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
        [
          id('q'),
          quizId,
          i,
          q.qtype || 'short',
          q.prompt,
          JSON.stringify(q.options ?? []),
          q.answer,
          q.explanation ?? '',
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return quizId;
}

export async function publishQuiz(pool: Pool, teacherId: string, quizId: string) {
  const result = await pool.query(
    `UPDATE campus_tool_quizzes
        SET status = 'published', published_at = now(), updated_at = now()
      WHERE id = $1 AND teacher_id = $2
      RETURNING id`,
    [quizId, teacherId],
  );
  return result.rowCount > 0;
}

/** Recall a published quiz so students no longer see it in 我的练习. */
export async function unpublishQuiz(pool: Pool, teacherId: string, quizId: string) {
  const result = await pool.query(
    `UPDATE campus_tool_quizzes
        SET status = 'draft', published_at = null, updated_at = now()
      WHERE id = $1 AND teacher_id = $2
      RETURNING id, status`,
    [quizId, teacherId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getQuizWithQuestions(pool: Pool, quizId: string, hideAnswers = false) {
  const quiz = await pool.query(`SELECT * FROM campus_tool_quizzes WHERE id = $1`, [quizId]);
  if (!quiz.rows[0]) return null;
  const questions = await pool.query(
    `SELECT id, quiz_id, ord, qtype, prompt, options, answer, explanation
       FROM campus_tool_questions WHERE quiz_id = $1 ORDER BY ord`,
    [quizId],
  );
  return {
    ...quiz.rows[0],
    questions: questions.rows.map((row) =>
      hideAnswers
        ? { id: row.id, ord: row.ord, qtype: row.qtype, prompt: row.prompt, options: row.options }
        : row,
    ),
  };
}

export async function submitQuizAnswers(
  pool: Pool,
  student: CampusSession,
  quizId: string,
  answers: Record<string, string>,
) {
  const quiz = await getQuizWithQuestions(pool, quizId, false);
  if (!quiz || quiz.status !== 'published') return null;

  let score = 0;
  const maxScore = quiz.questions.length;
  const feedbackParts: string[] = [];
  let openCount = 0;

  const normalizeJudge = (v: string) => {
    if (/^(对|正确|true|t|yes|√)$/i.test(v)) return '对';
    if (/^(错|错误|false|f|no|×)$/i.test(v)) return '错';
    return v;
  };
  const normalizeShort = (v: string) =>
    v
      .trim()
      .replace(/\s+/g, '')
      .replace(/[。．.！!？?，,、]/g, '')
      .toLowerCase();

  for (const q of quiz.questions as Array<{
    id: string;
    prompt: string;
    answer: string;
    qtype?: string;
  }>) {
    const qtype = q.qtype || 'short';
    const given = (answers[q.id] ?? '').trim();
    const expected = (q.answer ?? '').trim();

    if (qtype === 'open') {
      openCount += 1;
      feedbackParts.push(`「${q.prompt.slice(0, 40)}」开放题待老师批改`);
      continue;
    }

    let ok = false;
    if (qtype === 'judge') {
      ok = normalizeJudge(given) === normalizeJudge(expected);
    } else if (qtype === 'choice') {
      ok =
        given.localeCompare(expected, 'zh', { sensitivity: 'accent' }) === 0 ||
        given.toLowerCase() === expected.toLowerCase();
    } else {
      // short unique answer
      ok =
        normalizeShort(given) === normalizeShort(expected) ||
        given.localeCompare(expected, 'zh', { sensitivity: 'accent' }) === 0;
    }

    if (ok) score += 1;
    else feedbackParts.push(`「${q.prompt.slice(0, 40)}」参考：${expected || '见解析'}`);
  }

  const status = openCount > 0 ? 'pending_review' : 'graded';
  const feedback =
    openCount > 0
      ? [
          `客观题得分 ${score}/${maxScore - openCount}（开放题 ${openCount} 道待批改）`,
          ...feedbackParts,
        ].join('；')
      : feedbackParts.length
        ? feedbackParts.join('；')
        : '全部正确，继续保持！';

  const submissionId = id('sub');
  await pool.query(
    `INSERT INTO campus_tool_submissions
       (id, quiz_id, student_id, answers, score, max_score, feedback, status, graded_at)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8, now())
     ON CONFLICT (quiz_id, student_id) DO UPDATE SET
       answers = EXCLUDED.answers,
       score = EXCLUDED.score,
       max_score = EXCLUDED.max_score,
       feedback = EXCLUDED.feedback,
       status = EXCLUDED.status,
       graded_at = now()`,
    [
      submissionId,
      quizId,
      student.id,
      JSON.stringify(answers),
      score,
      maxScore,
      feedback,
      status,
    ],
  );
  return { score, maxScore, feedback: feedbackParts, status, openCount };
}

export async function listSubmissionsForTeacher(pool: Pool, teacherId: string, quizId?: string) {
  const result = await pool.query(
    `SELECT s.id, s.quiz_id, s.student_id, s.score, s.max_score, s.feedback, s.status,
            coalesce(s.redo_status, 'none') AS redo_status, s.redo_note,
            s.graded_at, s.created_at, q.title AS quiz_title, u.display_name AS student_name
       FROM campus_tool_submissions s
       JOIN campus_tool_quizzes q ON q.id = s.quiz_id
       JOIN campus_users u ON u.id = s.student_id
      WHERE q.teacher_id = $1
        AND ($2::text IS NULL OR s.quiz_id = $2)
      ORDER BY
        CASE WHEN coalesce(s.redo_status, 'none') = 'pending' THEN 0 ELSE 1 END,
        s.created_at DESC
      LIMIT 100`,
    [teacherId, quizId || null],
  );
  return result.rows;
}

export async function getSubmissionDetailForTeacher(
  pool: Pool,
  teacherId: string,
  submissionId: string,
) {
  const result = await pool.query(
    `SELECT s.*, q.title AS quiz_title, q.topic AS quiz_topic, q.teacher_id,
            u.display_name AS student_name
       FROM campus_tool_submissions s
       JOIN campus_tool_quizzes q ON q.id = s.quiz_id
       JOIN campus_users u ON u.id = s.student_id
      WHERE s.id = $1 AND q.teacher_id = $2`,
    [submissionId, teacherId],
  );
  const row = result.rows[0] as
    | {
        id: string;
        quiz_id: string;
        answers: Record<string, string> | string;
        score: number;
        max_score: number;
        feedback: string;
        status: string;
        quiz_title: string;
        quiz_topic: string;
        student_name: string;
      }
    | undefined;
  if (!row) return null;

  const questions = await pool.query(
    `SELECT id, ord, qtype, prompt, options, answer, explanation
       FROM campus_tool_questions WHERE quiz_id = $1 ORDER BY ord`,
    [row.quiz_id],
  );

  const answersRaw = row.answers;
  const answers =
    typeof answersRaw === 'string'
      ? (JSON.parse(answersRaw || '{}') as Record<string, string>)
      : ((answersRaw ?? {}) as Record<string, string>);

  return {
    id: row.id,
    quizId: row.quiz_id,
    quizTitle: row.quiz_title,
    quizTopic: row.quiz_topic,
    studentName: row.student_name,
    score: Number(row.score),
    maxScore: Number(row.max_score),
    feedback: row.feedback || '',
    status: row.status,
    items: questions.rows.map((q) => ({
      id: q.id as string,
      ord: Number(q.ord),
      qtype: String(q.qtype),
      prompt: String(q.prompt),
      options: (q.options as string[]) ?? [],
      referenceAnswer: String(q.answer ?? ''),
      explanation: String(q.explanation ?? ''),
      studentAnswer: String(answers[q.id as string] ?? ''),
    })),
  };
}

export async function gradeSubmissionManual(
  pool: Pool,
  teacherId: string,
  submissionId: string,
  score: number,
  feedback: string,
) {
  const result = await pool.query(
    `UPDATE campus_tool_submissions s
        SET score = $3, feedback = $4, status = 'graded', graded_by = $2, graded_at = now()
       FROM campus_tool_quizzes q
      WHERE s.id = $1 AND s.quiz_id = q.id AND q.teacher_id = $2
      RETURNING s.id`,
    [submissionId, teacherId, score, feedback],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Teacher force-returns (deletes) a student submission. */
export async function recallSubmissionForTeacher(
  pool: Pool,
  teacherId: string,
  submissionId: string,
) {
  const result = await pool.query(
    `DELETE FROM campus_tool_submissions s
      USING campus_tool_quizzes q
      WHERE s.id = $1 AND s.quiz_id = q.id AND q.teacher_id = $2
      RETURNING s.id`,
    [submissionId, teacherId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Student applies to redo — waits for teacher approval. */
export async function requestRedoForStudent(pool: Pool, studentId: string, quizId: string) {
  const result = await pool.query(
    `UPDATE campus_tool_submissions
        SET redo_status = 'pending',
            redo_note = '',
            redo_requested_at = now(),
            redo_reviewed_at = null
      WHERE quiz_id = $1 AND student_id = $2
        AND coalesce(redo_status, 'none') <> 'pending'
      RETURNING id`,
    [quizId, studentId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Teacher reviews redo request.
 * approve=true → delete submission so student can retake.
 * approve=false → mark rejected, keep score.
 */
export async function reviewRedoRequest(
  pool: Pool,
  teacherId: string,
  submissionId: string,
  approve: boolean,
  note = '',
) {
  const owned = await pool.query(
    `SELECT s.id, s.quiz_id, s.student_id
       FROM campus_tool_submissions s
       JOIN campus_tool_quizzes q ON q.id = s.quiz_id
      WHERE s.id = $1 AND q.teacher_id = $2 AND coalesce(s.redo_status, 'none') = 'pending'`,
    [submissionId, teacherId],
  );
  if (!owned.rows[0]) return false;

  if (approve) {
    const del = await pool.query(
      `DELETE FROM campus_tool_submissions WHERE id = $1 RETURNING id`,
      [submissionId],
    );
    return (del.rowCount ?? 0) > 0;
  }

  const result = await pool.query(
    `UPDATE campus_tool_submissions
        SET redo_status = 'rejected',
            redo_note = $2,
            redo_reviewed_at = now()
      WHERE id = $1
      RETURNING id`,
    [submissionId, note || '老师未同意重做'],
  );
  return (result.rowCount ?? 0) > 0;
}

function normalizeJudgeAns(v: string) {
  if (/^(对|正确|true|t|yes|√)$/i.test(v.trim())) return '对';
  if (/^(错|错误|false|f|no|×)$/i.test(v.trim())) return '错';
  return v.trim();
}

function normalizeShortAns(v: string) {
  return v
    .trim()
    .replace(/\s+/g, '')
    .replace(/[。．.！!？?，,、]/g, '')
    .toLowerCase();
}

/** Batch AI-grade open questions for pending submissions of one quiz (or given ids). */
export async function batchGradeOpenSubmissions(
  pool: Pool,
  teacherId: string,
  quizId: string,
  submissionIds: string[] | undefined,
  gradeOpenText: (input: {
    studentAnswer: string;
    referenceAnswer: string;
  }) => Promise<{ score: number; feedback: string }>,
) {
  const list = await listSubmissionsForTeacher(pool, teacherId, quizId);
  const targets = list.filter((row) => {
    const id = String(row.id);
    if (submissionIds?.length) return submissionIds.includes(id);
    return row.status === 'pending_review';
  });

  const results: Array<{
    submissionId: string;
    studentName: string;
    ok: boolean;
    score?: number;
    error?: string;
  }> = [];

  for (const row of targets) {
    const submissionId = String(row.id);
    const detail = await getSubmissionDetailForTeacher(pool, teacherId, submissionId);
    if (!detail) {
      results.push({
        submissionId,
        studentName: String(row.student_name),
        ok: false,
        error: '详情不存在',
      });
      continue;
    }

    const opens = detail.items.filter((it) => it.qtype === 'open');
    let openPts = 0;
    let openFeedback = '';

    if (opens.length) {
      try {
        const studentAnswer = opens
          .map(
            (it, i) =>
              `开放题${i + 1}：${it.prompt}\n学生作答：${it.studentAnswer || '（空白）'}`,
          )
          .join('\n\n');
        const referenceAnswer = opens
          .map(
            (it, i) =>
              `开放题${i + 1}参考要点模板：${it.referenceAnswer || '（无）'}${
                it.explanation ? `；说明：${it.explanation}` : ''
              }`,
          )
          .join('\n');
        const ai = await gradeOpenText({ studentAnswer, referenceAnswer });
        const pct = Math.max(0, Math.min(100, Number(ai.score) || 0));
        openPts = Math.round((pct / 100) * opens.length);
        openFeedback = String(ai.feedback || '');
      } catch (error) {
        results.push({
          submissionId,
          studentName: detail.studentName,
          ok: false,
          error: error instanceof Error ? error.message : 'AI 批改失败',
        });
        continue;
      }
    }

    let objScore = 0;
    for (const it of detail.items) {
      if (it.qtype === 'open') continue;
      const given = (it.studentAnswer || '').trim();
      const expected = (it.referenceAnswer || '').trim();
      if (!given || !expected) continue;
      let ok = false;
      if (it.qtype === 'judge') ok = normalizeJudgeAns(given) === normalizeJudgeAns(expected);
      else if (it.qtype === 'short') {
        ok =
          normalizeShortAns(given) === normalizeShortAns(expected) ||
          given.localeCompare(expected, 'zh', { sensitivity: 'accent' }) === 0;
      } else {
        ok =
          given.localeCompare(expected, 'zh', { sensitivity: 'accent' }) === 0 ||
          given.toLowerCase() === expected.toLowerCase();
      }
      if (ok) objScore += 1;
    }

    const total = Math.min(detail.maxScore, objScore + openPts);
    const feedback = [
      `客观题 ${objScore}/${detail.items.length - opens.length}`,
      opens.length ? `开放题 AI ${openPts}/${opens.length}` : null,
      openFeedback || (opens.length ? null : '全部为唯一解，已自动确认'),
    ]
      .filter(Boolean)
      .join('；');

    const saved = await gradeSubmissionManual(pool, teacherId, submissionId, total, feedback);
    results.push({
      submissionId,
      studentName: detail.studentName,
      ok: saved,
      score: total,
      error: saved ? undefined : '保存失败',
    });
  }

  return {
    total: targets.length,
    graded: results.filter((r) => r.ok).length,
    results,
  };
}

async function ensureLessonStatusColumn(pool: Pool) {
  await pool.query(
    `ALTER TABLE campus_tool_lessons
       ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'saved'`,
  );
}

function isMissingStatusColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /column ["']?status["']? of relation ["']?campus_tool_lessons["']? does not exist/i.test(
    message,
  );
}

export async function saveLesson(
  pool: Pool,
  teacher: CampusSession,
  input: {
    id?: string;
    title: string;
    subject: string;
    grade: string;
    duration: string;
    content: string;
    shared?: boolean;
    status?: 'draft' | 'saved';
    classId?: string | null;
  },
) {
  const status = input.status === 'draft' ? 'draft' : 'saved';
  const shared = status === 'draft' ? false : Boolean(input.shared);

  // Hot-reload / already-running servers may have skipped the schema migration.
  try {
    await ensureLessonStatusColumn(pool);
  } catch (e) {
    console.warn('[lessons] ensure status column failed:', e);
  }

  if (input.id) {
    try {
      const result = await pool.query(
        `UPDATE campus_tool_lessons
            SET title = $3,
                subject = $4,
                grade = $5,
                duration = $6,
                content = $7,
                shared = $8,
                status = $9,
                class_id = COALESCE($10, class_id),
                updated_at = now()
          WHERE id = $1 AND teacher_id = $2
          RETURNING id`,
        [
          input.id,
          teacher.id,
          input.title,
          input.subject,
          input.grade,
          input.duration,
          input.content,
          shared,
          status,
          input.classId ?? null,
        ],
      );
      if (!result.rowCount) return null;
      return input.id;
    } catch (e) {
      if (!isMissingStatusColumnError(e)) throw e;
      const result = await pool.query(
        `UPDATE campus_tool_lessons
            SET title = $3,
                subject = $4,
                grade = $5,
                duration = $6,
                content = $7,
                shared = $8,
                class_id = COALESCE($9, class_id),
                updated_at = now()
          WHERE id = $1 AND teacher_id = $2
          RETURNING id`,
        [
          input.id,
          teacher.id,
          input.title,
          input.subject,
          input.grade,
          input.duration,
          input.content,
          shared,
          input.classId ?? null,
        ],
      );
      if (!result.rowCount) return null;
      return input.id;
    }
  }

  const lessonId = id('lesson');
  const values = [
    lessonId,
    teacher.id,
    input.classId ?? null,
    input.title,
    input.subject,
    input.grade,
    input.duration,
    input.content,
    shared,
    status,
  ] as const;

  try {
    await pool.query(
      `INSERT INTO campus_tool_lessons
         (id, teacher_id, class_id, title, subject, grade, duration, content, shared, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [...values],
    );
  } catch (e) {
    if (!isMissingStatusColumnError(e)) throw e;
    await pool.query(
      `INSERT INTO campus_tool_lessons
         (id, teacher_id, class_id, title, subject, grade, duration, content, shared)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      values.slice(0, 9),
    );
  }
  return lessonId;
}

export async function listLessons(pool: Pool, session: CampusSession) {
  if (session.role === 'teacher') {
    const result = await pool.query(
      `SELECT * FROM campus_tool_lessons WHERE teacher_id = $1 ORDER BY updated_at DESC`,
      [session.id],
    );
    return result.rows;
  }
  if (session.role === 'student') {
    try {
      const result = await pool.query(
        `SELECT l.*, u.display_name AS teacher_name
           FROM campus_tool_lessons l
           JOIN campus_users u ON u.id = l.teacher_id
          WHERE l.shared = TRUE
            AND coalesce(l.status, 'saved') = 'saved'
          ORDER BY l.updated_at DESC
          LIMIT 50`,
      );
      return result.rows;
    } catch (e) {
      if (!isMissingStatusColumnError(e)) throw e;
      const result = await pool.query(
        `SELECT l.*, u.display_name AS teacher_name
           FROM campus_tool_lessons l
           JOIN campus_users u ON u.id = l.teacher_id
          WHERE l.shared = TRUE
          ORDER BY l.updated_at DESC
          LIMIT 50`,
      );
      return result.rows;
    }
  }
  try {
    const result = await pool.query(
      `SELECT l.*, u.display_name AS teacher_name
         FROM campus_tool_lessons l
         JOIN campus_users u ON u.id = l.teacher_id
        WHERE coalesce(l.status, 'saved') = 'saved'
        ORDER BY l.updated_at DESC LIMIT 100`,
    );
    return result.rows;
  } catch (e) {
    if (!isMissingStatusColumnError(e)) throw e;
    const result = await pool.query(
      `SELECT l.*, u.display_name AS teacher_name
         FROM campus_tool_lessons l
         JOIN campus_users u ON u.id = l.teacher_id
        ORDER BY l.updated_at DESC LIMIT 100`,
    );
    return result.rows;
  }
}

export async function createNotice(
  pool: Pool,
  author: CampusSession,
  input: {
    title: string;
    body: string;
    kind: 'notice' | 'minutes';
    audience: string;
    classId?: string | null;
  },
) {
  const noticeId = id('notice');
  await pool.query(
    `INSERT INTO campus_tool_notices
       (id, author_id, audience, class_id, kind, title, body, published)
     VALUES ($1,$2,$3,$4,$5,$6,$7, TRUE)`,
    [
      noticeId,
      author.id,
      input.audience,
      input.classId ?? null,
      input.kind,
      input.title,
      input.body,
    ],
  );
  return noticeId;
}

export async function listNotices(pool: Pool, session: CampusSession) {
  const result = await pool.query(
    `SELECT n.*, u.display_name AS author_name
       FROM campus_tool_notices n
       JOIN campus_users u ON u.id = n.author_id
      WHERE n.published = TRUE
        AND (
          n.audience = 'all'
          OR (n.audience = 'teachers' AND $2 = 'teacher')
          OR (n.audience = 'students' AND $2 = 'student')
          OR $2 = 'admin'
          OR n.author_id = $1
        )
      ORDER BY n.created_at DESC
      LIMIT 80`,
    [session.id, session.role],
  );
  return result.rows;
}

export async function createOpsRequest(
  pool: Pool,
  requester: CampusSession,
  input: { kind: string; title: string; detail: string },
) {
  const opsId = id('ops');
  await pool.query(
    `INSERT INTO campus_tool_ops_requests (id, requester_id, kind, title, detail)
     VALUES ($1,$2,$3,$4,$5)`,
    [opsId, requester.id, input.kind, input.title, input.detail],
  );
  return opsId;
}

export async function listOpsRequests(pool: Pool, session: CampusSession) {
  if (session.role === 'admin') {
    const result = await pool.query(
      `SELECT o.*, u.display_name AS requester_name
         FROM campus_tool_ops_requests o
         JOIN campus_users u ON u.id = o.requester_id
        ORDER BY o.created_at DESC LIMIT 100`,
    );
    return result.rows;
  }
  const result = await pool.query(
    `SELECT * FROM campus_tool_ops_requests WHERE requester_id = $1 ORDER BY created_at DESC`,
    [session.id],
  );
  return result.rows;
}

export async function reviewOpsRequest(
  pool: Pool,
  adminId: string,
  opsId: string,
  status: 'approved' | 'rejected',
  note: string,
) {
  const result = await pool.query(
    `UPDATE campus_tool_ops_requests
        SET status = $2, reviewer_id = $3, review_note = $4, reviewed_at = now()
      WHERE id = $1 AND status = 'pending'
      RETURNING id`,
    [opsId, status, adminId, note],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function saveOralSession(
  pool: Pool,
  student: CampusSession,
  input: { scene: string; transcript: unknown[]; score: number; feedback: string },
) {
  const oralId = id('oral');
  await pool.query(
    `INSERT INTO campus_tool_oral_sessions (id, student_id, scene, transcript, score, feedback)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
    [
      oralId,
      student.id,
      input.scene,
      JSON.stringify(input.transcript),
      input.score,
      input.feedback,
    ],
  );
  return oralId;
}

export async function listOralSessions(pool: Pool, session: CampusSession) {
  if (session.role === 'student') {
    const result = await pool.query(
      `SELECT * FROM campus_tool_oral_sessions WHERE student_id = $1 ORDER BY created_at DESC LIMIT 40`,
      [session.id],
    );
    return result.rows;
  }
  const result = await pool.query(
    `SELECT o.*, u.display_name AS student_name
       FROM campus_tool_oral_sessions o
       JOIN campus_users u ON u.id = o.student_id
      ORDER BY o.created_at DESC LIMIT 100`,
  );
  return result.rows;
}

export async function insightsForTeacher(pool: Pool, teacherId: string) {
  const quizzes = await pool.query(
    `SELECT q.id, q.title,
            count(s.id)::int AS submissions,
            coalesce(avg(s.score),0)::float AS avg_score,
            coalesce(avg(s.max_score),0)::float AS avg_max
       FROM campus_tool_quizzes q
       LEFT JOIN campus_tool_submissions s ON s.quiz_id = q.id
      WHERE q.teacher_id = $1
      GROUP BY q.id, q.title
      ORDER BY q.updated_at DESC`,
    [teacherId],
  );

  const students = await pool.query(
    `SELECT u.id AS student_id,
            u.display_name AS student_name,
            count(s.id)::int AS attempts,
            count(DISTINCT s.quiz_id)::int AS quiz_count,
            coalesce(avg(CASE WHEN s.max_score > 0 THEN s.score::float / s.max_score ELSE 0 END), 0)::float AS accuracy,
            coalesce(avg(s.score), 0)::float AS avg_score,
            coalesce(avg(s.max_score), 0)::float AS avg_max,
            coalesce(sum(s.score), 0)::float AS sum_score,
            coalesce(sum(s.max_score), 0)::float AS sum_max,
            max(s.created_at) AS last_submitted_at,
            count(*) FILTER (WHERE s.status = 'pending_review')::int AS pending_count
       FROM campus_tool_submissions s
       JOIN campus_tool_quizzes q ON q.id = s.quiz_id AND q.teacher_id = $1
       JOIN campus_users u ON u.id = s.student_id
      GROUP BY u.id, u.display_name
      ORDER BY accuracy ASC, attempts DESC`,
    [teacherId],
  );

  const overview = await pool.query(
    `SELECT count(DISTINCT q.id)::int AS quiz_total,
            count(s.id)::int AS submission_total,
            count(DISTINCT s.student_id)::int AS student_total,
            coalesce(avg(CASE WHEN s.max_score > 0 THEN s.score::float / s.max_score ELSE NULL END), 0)::float AS avg_accuracy
       FROM campus_tool_quizzes q
       LEFT JOIN campus_tool_submissions s ON s.quiz_id = q.id
      WHERE q.teacher_id = $1`,
    [teacherId],
  );

  return {
    quizzes: quizzes.rows,
    students: students.rows,
    overview: overview.rows[0] ?? {
      quiz_total: 0,
      submission_total: 0,
      student_total: 0,
      avg_accuracy: 0,
    },
    checkin: await teacherCheckinOverview(pool, teacherId),
  };
}

/** One student's learning detail under a teacher (for filter view). */
export async function insightsTeacherStudentDetail(
  pool: Pool,
  teacherId: string,
  studentId: string,
) {
  const profile = await pool.query(
    `SELECT id, display_name FROM campus_users WHERE id = $1`,
    [studentId],
  );
  if (!profile.rows[0]) return null;

  const quizzes = await pool.query(
    `SELECT s.id, s.score, s.max_score, s.feedback, s.status, s.created_at,
            q.id AS quiz_id, q.title, q.difficulty
       FROM campus_tool_submissions s
       JOIN campus_tool_quizzes q ON q.id = s.quiz_id
      WHERE s.student_id = $1 AND q.teacher_id = $2
      ORDER BY s.created_at DESC
      LIMIT 50`,
    [studentId, teacherId],
  );

  const oral = await pool.query(
    `SELECT score, scene, feedback, created_at
       FROM campus_tool_oral_sessions
      WHERE student_id = $1
      ORDER BY created_at DESC
      LIMIT 20`,
    [studentId],
  );

  const rows = quizzes.rows as Array<{ score: number; max_score: number }>;
  const accuracies = rows
    .map((r) => (Number(r.max_score) > 0 ? Number(r.score) / Number(r.max_score) : 0))
    .filter((n) => Number.isFinite(n));
  const avgAccuracy =
    accuracies.length > 0
      ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
      : 0;
  const bestAccuracy = accuracies.length ? Math.max(...accuracies) : 0;

  let level = '尚未练习';
  if (accuracies.length === 0) level = '尚未练习';
  else if (avgAccuracy >= 0.9) level = '优秀掌握';
  else if (avgAccuracy >= 0.75) level = '良好巩固';
  else if (avgAccuracy >= 0.6) level = '稳步提升';
  else level = '需要加练';

  return {
    studentId,
    studentName: String(profile.rows[0].display_name || '学生'),
    quizzes: quizzes.rows,
    oral: oral.rows,
    checkin: await listTodayCheckinTargets(pool, studentId),
    stats: {
      attemptCount: rows.length,
      avgAccuracy,
      bestAccuracy,
      pendingCount: quizzes.rows.filter((r) => r.status === 'pending_review').length,
      level,
      recentAccuracies: accuracies.slice(0, 8).reverse(),
    },
  };
}

export async function insightsForStudent(pool: Pool, studentId: string) {
  const quizzes = await pool.query(
    `SELECT s.id, s.score, s.max_score, s.feedback, s.status, s.created_at, q.title, q.difficulty
       FROM campus_tool_submissions s
       JOIN campus_tool_quizzes q ON q.id = s.quiz_id
      WHERE s.student_id = $1
      ORDER BY s.created_at DESC LIMIT 30`,
    [studentId],
  );
  const oral = await pool.query(
    `SELECT score, scene, feedback, created_at FROM campus_tool_oral_sessions
      WHERE student_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [studentId],
  );
  const available = await pool.query(
    `SELECT count(*)::int AS total
       FROM campus_tool_quizzes q
      WHERE q.status = 'published'
        AND (
          q.class_id IS NULL
          OR EXISTS (
            SELECT 1 FROM campus_class_members m
             WHERE m.class_id = q.class_id AND m.student_id = $1 AND m.status = 'active'
          )
          OR EXISTS (
            SELECT 1 FROM campus_course_enrollments e
            JOIN campus_courses c ON c.id = e.course_id
             WHERE e.student_id = $1 AND e.status = 'active' AND c.teacher_id = q.teacher_id
          )
        )`,
    [studentId],
  );
  const lessons = await pool.query(
    `SELECT count(*)::int AS total FROM campus_tool_lessons WHERE shared = true`,
  );

  const rows = quizzes.rows as Array<{
    score: number;
    max_score: number;
    created_at: string | Date;
  }>;
  const attemptCount = rows.length;
  const accuracies = rows
    .map((r) => (Number(r.max_score) > 0 ? Number(r.score) / Number(r.max_score) : 0))
    .filter((n) => Number.isFinite(n));
  const avgAccuracy =
    accuracies.length > 0
      ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
      : 0;
  const bestAccuracy = accuracies.length ? Math.max(...accuracies) : 0;
  const recent = accuracies.slice(0, 8).reverse(); // oldest→newest for sparkline among latest
  const oralRows = oral.rows as Array<{ score: number }>;
  const oralAvg =
    oralRows.length > 0
      ? oralRows.reduce((a, b) => a + Number(b.score || 0), 0) / oralRows.length
      : 0;

  let level = '起步学习';
  if (attemptCount === 0) level = '尚未练习';
  else if (avgAccuracy >= 0.9) level = '优秀掌握';
  else if (avgAccuracy >= 0.75) level = '良好巩固';
  else if (avgAccuracy >= 0.6) level = '稳步提升';
  else level = '需要加练';

  const availableTotal = Number(available.rows[0]?.total || 0);
  const completed = attemptCount;
  const pending = Math.max(0, availableTotal - completed);

  const checkin = await listTodayCheckinTargets(pool, studentId);

  return {
    quizzes: quizzes.rows,
    oral: oral.rows,
    checkin: {
      streakDays: checkin.streakDays,
      checkedInToday: checkin.checkedInToday,
      todayDone: checkin.todayDone,
      todayTotal: checkin.todayTotal,
      planCompletion: checkin.planCompletion,
      recentLogs: checkin.recentLogs,
      hasActivePlan: Boolean(checkin.activePlan),
      planTitle: checkin.activePlan ? String(checkin.activePlan.title || '') : '',
    },
    stats: {
      attemptCount,
      availableTotal,
      completed,
      pending,
      avgAccuracy,
      bestAccuracy,
      recentAccuracies: recent,
      oralCount: oralRows.length,
      oralAvg,
      lessonShared: Number(lessons.rows[0]?.total || 0),
      level,
      streakDays: checkin.streakDays,
      checkedInToday: checkin.checkedInToday,
      planCompletion: checkin.planCompletion,
    },
  };
}

export async function insightsOverview(pool: Pool) {
  const quiz = await pool.query(
    `SELECT count(*)::int AS quizzes,
            (SELECT count(*)::int FROM campus_tool_submissions) AS submissions,
            (SELECT coalesce(avg(score),0)::float FROM campus_tool_submissions) AS avg_score,
            (SELECT count(*)::int FROM campus_tool_oral_sessions) AS oral_sessions`,
  );
  return quiz.rows[0];
}

export async function listAlerts(pool: Pool) {
  const result = await pool.query(
    `WITH stats AS (
       SELECT s.student_id,
              u.display_name,
              count(*)::int AS attempts,
              avg(CASE WHEN s.max_score > 0 THEN s.score / s.max_score ELSE 0 END)::float AS accuracy
         FROM campus_tool_submissions s
         JOIN campus_users u ON u.id = s.student_id
        GROUP BY s.student_id, u.display_name
     )
     SELECT *,
            CASE
              WHEN accuracy < 0.5 THEN '正确率偏低'
              WHEN attempts = 0 THEN '尚未练习'
              ELSE '需关注'
            END AS reason
       FROM stats
      WHERE accuracy < 0.6 OR attempts < 1
      ORDER BY accuracy ASC NULLS FIRST
      LIMIT 50`,
  );
  return result.rows;
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function plusDaysYmd(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Normalize pg DATE / ISO / text to `YYYY-MM-DD` (local calendar for Date objects). */
function asYmd(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const raw = String(value ?? '').trim();
  const head = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (head) return head[1];
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return todayYmd();
}

function parseYmd(value?: string | null, fallbackDays = 0) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return fallbackDays === 0 ? todayYmd() : plusDaysYmd(fallbackDays);
}

async function computeCheckinStreak(pool: Pool, studentId: string) {
  const result = await pool.query(
    `SELECT DISTINCT checkin_date::text AS d
       FROM campus_tool_checkin_logs
      WHERE student_id = $1
      ORDER BY d DESC
      LIMIT 120`,
    [studentId],
  );
  const dates = new Set(result.rows.map((r) => String(r.d).slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 120; i += 1) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const day = String(cursor.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${day}`;
    if (!dates.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

async function studentPlanCompletion(pool: Pool, studentId: string) {
  const plan = await pool.query(
    `SELECT id, start_date::text AS start_date, end_date::text AS end_date
       FROM campus_tool_learning_plans
      WHERE student_id = $1 AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1`,
    [studentId],
  );
  const row = plan.rows[0] as
    | { id: string; start_date: string; end_date: string }
    | undefined;
  if (!row) return { planCompletion: 0, hasActivePlan: false, itemCount: 0 };

  const items = await pool.query(
    `SELECT count(*)::int AS total FROM campus_tool_learning_plan_items WHERE plan_id = $1`,
    [row.id],
  );
  const itemCount = Number(items.rows[0]?.total || 0);
  if (!itemCount) return { planCompletion: 0, hasActivePlan: true, itemCount: 0 };

  const start = new Date(asYmd(row.start_date));
  const end = new Date(asYmd(row.end_date));
  const today = new Date(todayYmd());
  const last = today < end ? today : end;
  const days = Math.max(
    1,
    Math.floor((last.getTime() - start.getTime()) / 86400000) + 1,
  );
  const expected = itemCount * days;
  const done = await pool.query(
    `SELECT count(*)::int AS total
       FROM campus_tool_checkin_logs l
       JOIN campus_tool_learning_plan_items i ON i.id = l.source_id
      WHERE l.student_id = $1
        AND l.source_kind = 'plan_item'
        AND i.plan_id = $2
        AND l.checkin_date >= $3::date
        AND l.checkin_date <= $4::date`,
    [studentId, row.id, asYmd(row.start_date), todayYmd()],
  );
  const totalDone = Number(done.rows[0]?.total || 0);
  return {
    planCompletion: Math.min(1, totalDone / expected),
    hasActivePlan: true,
    itemCount,
  };
}

export async function createCheckinTask(
  pool: Pool,
  teacher: CampusSession,
  input: {
    title: string;
    body?: string;
    classId?: string | null;
    startDate?: string;
    endDate?: string;
  },
) {
  const taskId = id('cktask');
  await pool.query(
    `INSERT INTO campus_tool_checkin_tasks
       (id, teacher_id, class_id, title, body, start_date, end_date, published)
     VALUES ($1,$2,$3,$4,$5,$6::date,$7::date, TRUE)`,
    [
      taskId,
      teacher.id,
      input.classId || null,
      input.title,
      input.body || '',
      parseYmd(input.startDate, 0),
      parseYmd(input.endDate, 30),
    ],
  );
  return taskId;
}

export async function listTeacherCheckinTasks(pool: Pool, teacherId: string) {
  const today = todayYmd();
  const result = await pool.query(
    `SELECT t.*,
            (SELECT count(DISTINCT l.student_id)::int
               FROM campus_tool_checkin_logs l
              WHERE l.source_kind = 'teacher_task'
                AND l.source_id = t.id
                AND l.checkin_date = $2::date) AS today_done_students
       FROM campus_tool_checkin_tasks t
      WHERE t.teacher_id = $1
      ORDER BY t.created_at DESC
      LIMIT 50`,
    [teacherId, today],
  );
  return result.rows;
}

export async function unpublishCheckinTask(pool: Pool, teacherId: string, taskId: string) {
  const result = await pool.query(
    `UPDATE campus_tool_checkin_tasks
        SET published = FALSE
      WHERE id = $1 AND teacher_id = $2
      RETURNING id`,
    [taskId, teacherId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function createLearningPlan(
  pool: Pool,
  studentId: string,
  input: {
    title: string;
    startDate?: string;
    endDate?: string;
    items: string[];
  },
) {
  const start = parseYmd(input.startDate, 0);
  const end = parseYmd(input.endDate, 6);
  const parsed = input.items
    .map((line) => parsePlanItemLine(line, start))
    .filter((x) => x.title);

  if (!parsed.length) return null;

  await pool.query(
    `UPDATE campus_tool_learning_plans
        SET status = 'archived'
      WHERE student_id = $1 AND status = 'active'`,
    [studentId],
  );

  const planId = id('plan');
  await pool.query(
    `INSERT INTO campus_tool_learning_plans
       (id, student_id, title, start_date, end_date, status)
     VALUES ($1,$2,$3,$4::date,$5::date,'active')`,
    [planId, studentId, input.title, start, end],
  );

  for (let i = 0; i < parsed.length; i += 1) {
    await pool.query(
      `INSERT INTO campus_tool_learning_plan_items (id, plan_id, title, ord, schedule_date)
       VALUES ($1,$2,$3,$4,$5::date)`,
      [id('pitem'), planId, parsed[i].title, i, parsed[i].scheduleDate],
    );
  }
  return planId;
}

/** Parse "2026-09-25 背单词" / "09-25 背单词" / "每日 背单词" / plain recurring title. */
function parsePlanItemLine(line: string, planStartYmd: string) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return { title: '', scheduleDate: null as string | null };

  const daily = trimmed.match(/^每日[:：\s]+(.+)$/);
  if (daily) return { scheduleDate: null, title: daily[1].trim() };

  const full = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
  if (full) return { scheduleDate: full[1], title: full[2].trim() };

  const short = trimmed.match(/^(\d{1,2})[-/.月](\d{1,2})日?\s+(.+)$/);
  if (short) {
    const y = planStartYmd.slice(0, 4);
    const mm = String(short[1]).padStart(2, '0');
    const dd = String(short[2]).padStart(2, '0');
    return { scheduleDate: `${y}-${mm}-${dd}`, title: short[3].trim() };
  }

  return { scheduleDate: null, title: trimmed };
}

export async function getActivePlan(pool: Pool, studentId: string) {
  const plan = await pool.query(
    `SELECT id, student_id, title, start_date::text AS start_date, end_date::text AS end_date,
            status, created_at
       FROM campus_tool_learning_plans
      WHERE student_id = $1 AND status = 'active'
      ORDER BY created_at DESC LIMIT 1`,
    [studentId],
  );
  const row = plan.rows[0];
  if (!row) return null;
  const items = await pool.query(
    `SELECT id, title, ord, schedule_date::text AS schedule_date
       FROM campus_tool_learning_plan_items
      WHERE plan_id = $1 ORDER BY ord ASC`,
    [row.id],
  );
  return {
    ...row,
    start_date: asYmd(row.start_date),
    end_date: asYmd(row.end_date),
    items: items.rows.map((it) => ({
      ...it,
      schedule_date: it.schedule_date ? asYmd(it.schedule_date) : null,
    })),
  };
}

export async function listStudentPlans(pool: Pool, studentId: string) {
  const result = await pool.query(
    `SELECT p.*,
            (SELECT count(*)::int FROM campus_tool_learning_plan_items i WHERE i.plan_id = p.id) AS item_count
       FROM campus_tool_learning_plans p
      WHERE p.student_id = $1
      ORDER BY p.created_at DESC
      LIMIT 20`,
    [studentId],
  );
  return result.rows;
}

/** Teacher tasks visible to a student today (published + in date range + class scope). */
async function listVisibleTeacherTasksForStudent(pool: Pool, studentId: string, today: string) {
  const result = await pool.query(
    `SELECT t.id, t.title, t.body, t.teacher_id, t.start_date, t.end_date,
            u.display_name AS teacher_name
       FROM campus_tool_checkin_tasks t
       JOIN campus_users u ON u.id = t.teacher_id
      WHERE t.published = TRUE
        AND t.start_date <= $2::date
        AND t.end_date >= $2::date
        AND (
          t.class_id IS NULL
          OR EXISTS (
            SELECT 1 FROM campus_class_members m
             WHERE m.class_id = t.class_id AND m.student_id = $1 AND m.status = 'active'
          )
          OR EXISTS (
            SELECT 1 FROM campus_course_enrollments e
            JOIN campus_courses c ON c.id = e.course_id
             WHERE e.student_id = $1 AND e.status = 'active' AND c.teacher_id = t.teacher_id
          )
        )
      ORDER BY t.created_at DESC
      LIMIT 40`,
    [studentId, today],
  );
  return result.rows;
}

export async function listTodayCheckinTargets(
  pool: Pool,
  studentId: string,
  dateYmd?: string,
) {
  const day = dateYmd && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd) ? dateYmd : todayYmd();
  const tasks = await listVisibleTeacherTasksForStudent(pool, studentId, day);
  const plan = await getActivePlan(pool, studentId);
  const logs = await pool.query(
    `SELECT id, source_kind, source_id, note, evidence
       FROM campus_tool_checkin_logs
      WHERE student_id = $1 AND checkin_date = $2::date`,
    [studentId, day],
  );
  const logByKey = new Map(
    logs.rows.map((r) => [
      `${r.source_kind}:${r.source_id}`,
      {
        logId: String(r.id),
        note: String(r.note || ''),
        evidence: Array.isArray(r.evidence) ? r.evidence : [],
      },
    ]),
  );

  const teacherTargets = tasks.map((t) => {
    const hit = logByKey.get(`teacher_task:${t.id}`);
    return {
      sourceKind: 'teacher_task' as const,
      sourceId: String(t.id),
      title: String(t.title),
      body: String(t.body || ''),
      meta: String(t.teacher_name || '老师'),
      done: Boolean(hit),
      logId: hit?.logId ?? null,
      note: hit?.note ?? '',
      evidence: hit?.evidence ?? [],
      short: abbreviateTitle(String(t.title)),
    };
  });

  const planTargets =
    plan && Array.isArray(plan.items)
      ? plan.items
          .filter((it: { schedule_date?: string | null }) => {
            if (asYmd(plan.start_date) > day || asYmd(plan.end_date) < day) return false;
            if (!it.schedule_date) return true;
            return asYmd(it.schedule_date) === day;
          })
          .map((it: { id: string; title: string }) => {
            const hit = logByKey.get(`plan_item:${it.id}`);
            return {
              sourceKind: 'plan_item' as const,
              sourceId: String(it.id),
              title: String(it.title),
              body: '',
              meta: String(plan.title || '我的计划'),
              done: Boolean(hit),
              logId: hit?.logId ?? null,
              note: hit?.note ?? '',
              evidence: hit?.evidence ?? [],
              short: abbreviateTitle(String(it.title)),
            };
          })
      : [];

  const targets = [...teacherTargets, ...planTargets];
  const todayDone = targets.filter((t) => t.done).length;
  const streakDays = await computeCheckinStreak(pool, studentId);
  const planStats = await studentPlanCompletion(pool, studentId);

  return {
    today: todayYmd(),
    date: day,
    targets,
    todayDone,
    todayTotal: targets.length,
    checkedInToday: day === todayYmd() && todayDone > 0,
    canCheckin: day <= todayYmd(),
    streakDays,
    activePlan: plan,
    planCompletion: planStats.planCompletion,
    recentLogs: (
      await pool.query(
        `SELECT checkin_date::text AS checkin_date, source_kind, source_id, note, created_at
           FROM campus_tool_checkin_logs
          WHERE student_id = $1
          ORDER BY checkin_date DESC, created_at DESC
          LIMIT 20`,
        [studentId],
      )
    ).rows,
  };
}

function abbreviateTitle(title: string, max = 5) {
  const t = String(title || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export async function listMonthCheckinCalendar(
  pool: Pool,
  studentId: string,
  yearMonth: string,
) {
  const m = yearMonth.match(/^(\d{4})-(\d{2})$/);
  if (!m) return { yearMonth, days: [] as Array<Record<string, unknown>> };

  const year = Number(m[1]);
  const month = Number(m[2]);
  const daysInMonth = new Date(year, month, 0).getDate();
  const plan = await getActivePlan(pool, studentId);
  const monthStart = `${m[1]}-${m[2]}-01`;
  const monthEnd = `${m[1]}-${m[2]}-${String(daysInMonth).padStart(2, '0')}`;

  const tasks = await pool.query(
    `SELECT t.id, t.title, t.start_date::text AS start_date, t.end_date::text AS end_date
       FROM campus_tool_checkin_tasks t
       JOIN campus_users u ON u.id = t.teacher_id
      WHERE t.published = TRUE
        AND t.start_date <= $2::date
        AND t.end_date >= $1::date
        AND (
          t.class_id IS NULL
          OR EXISTS (
            SELECT 1 FROM campus_class_members cm
             WHERE cm.class_id = t.class_id AND cm.student_id = $3 AND cm.status = 'active'
          )
          OR EXISTS (
            SELECT 1 FROM campus_course_enrollments e
            JOIN campus_courses c ON c.id = e.course_id
             WHERE e.student_id = $3 AND e.status = 'active' AND c.teacher_id = t.teacher_id
          )
        )`,
    [monthStart, monthEnd, studentId],
  );

  const logs = await pool.query(
    `SELECT checkin_date::text AS checkin_date, source_kind, source_id
       FROM campus_tool_checkin_logs
      WHERE student_id = $1
        AND checkin_date >= $2::date
        AND checkin_date <= $3::date`,
    [studentId, monthStart, monthEnd],
  );
  const doneKeys = new Set(
    logs.rows.map((r) => `${asYmd(r.checkin_date)}:${r.source_kind}:${r.source_id}`),
  );

  const days = [];
  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = `${m[1]}-${m[2]}-${String(d).padStart(2, '0')}`;
    const shorts: Array<{ kind: string; text: string; done: boolean }> = [];

    for (const t of tasks.rows) {
      if (asYmd(t.start_date) <= date && asYmd(t.end_date) >= date) {
        shorts.push({
          kind: 'teacher_task',
          text: abbreviateTitle(String(t.title), 4),
          done: doneKeys.has(`${date}:teacher_task:${t.id}`),
        });
      }
    }

    if (
      plan &&
      asYmd(plan.start_date) <= date &&
      asYmd(plan.end_date) >= date &&
      Array.isArray(plan.items)
    ) {
      for (const it of plan.items as Array<{
        id: string;
        title: string;
        schedule_date?: string | null;
      }>) {
        if (it.schedule_date && asYmd(it.schedule_date) !== date) continue;
        shorts.push({
          kind: 'plan_item',
          text: abbreviateTitle(String(it.title), 4),
          done: doneKeys.has(`${date}:plan_item:${it.id}`),
        });
      }
    }

    const doneCount = shorts.filter((s) => s.done).length;
    days.push({
      date,
      day: d,
      total: shorts.length,
      done: doneCount,
      complete: shorts.length > 0 && doneCount === shorts.length,
      shorts: shorts.slice(0, 3),
      more: Math.max(0, shorts.length - 3),
    });
  }

  return {
    yearMonth,
    today: todayYmd(),
    activePlan: plan,
    days,
  };
}

export async function submitCheckin(
  pool: Pool,
  studentId: string,
  input: {
    sourceKind: 'teacher_task' | 'plan_item';
    sourceId: string;
    note?: string;
    checkinDate?: string;
    evidence?: unknown[];
  },
) {
  const day =
    input.checkinDate && /^\d{4}-\d{2}-\d{2}$/.test(input.checkinDate)
      ? input.checkinDate
      : todayYmd();
  if (day > todayYmd()) return null;

  if (input.sourceKind === 'teacher_task') {
    const tasks = await listVisibleTeacherTasksForStudent(pool, studentId, day);
    if (!tasks.some((t) => String(t.id) === input.sourceId)) return null;
  } else {
    const plan = await getActivePlan(pool, studentId);
    if (!plan || !Array.isArray(plan.items)) return null;
    if (asYmd(plan.start_date) > day || asYmd(plan.end_date) < day) return null;
    const item = plan.items.find((it: { id: string; schedule_date?: string | null }) => {
      if (String(it.id) !== input.sourceId) return false;
      if (!it.schedule_date) return true;
      return asYmd(it.schedule_date) === day;
    });
    if (!item) return null;
  }

  const evidenceJson = JSON.stringify(input.evidence ?? []);
  const logId = id('cklog');
  try {
    const result = await pool.query(
      `INSERT INTO campus_tool_checkin_logs
         (id, student_id, checkin_date, source_kind, source_id, note, evidence)
       VALUES ($1,$2,$3::date,$4,$5,$6,$7::jsonb)
       ON CONFLICT (student_id, checkin_date, source_kind, source_id) DO UPDATE SET
         note = CASE
           WHEN EXCLUDED.note <> '' THEN EXCLUDED.note
           ELSE campus_tool_checkin_logs.note
         END,
         evidence = CASE
           WHEN jsonb_array_length(EXCLUDED.evidence) > 0
             THEN campus_tool_checkin_logs.evidence || EXCLUDED.evidence
           ELSE campus_tool_checkin_logs.evidence
         END
       RETURNING id, evidence`,
      [
        logId,
        studentId,
        day,
        input.sourceKind,
        input.sourceId,
        input.note || '',
        evidenceJson,
      ],
    );
    return result.rows[0] as { id: string; evidence: unknown };
  } catch {
    return null;
  }
}

export async function getCheckinLogForStudent(
  pool: Pool,
  studentId: string,
  logId: string,
) {
  const result = await pool.query(
    `SELECT id, student_id, evidence FROM campus_tool_checkin_logs
      WHERE id = $1 AND student_id = $2`,
    [logId, studentId],
  );
  return result.rows[0] as
    | { id: string; student_id: string; evidence: CheckinEvidenceRow[] }
    | undefined;
}

type CheckinEvidenceRow = {
  id: string;
  name: string;
  mime: string;
  size: number;
  stored: string;
};

export async function teacherCheckinOverview(pool: Pool, teacherId: string) {
  const today = todayYmd();
  const tasks = await listTeacherCheckinTasks(pool, teacherId);

  const students = await pool.query(
    `SELECT DISTINCT u.id AS student_id, u.display_name AS student_name
       FROM campus_users u
      WHERE u.role = 'student'
        AND (
          EXISTS (
            SELECT 1 FROM campus_class_members m
            JOIN campus_classes c ON c.id = m.class_id
             WHERE m.student_id = u.id AND m.status = 'active' AND c.teacher_id = $1
          )
          OR EXISTS (
            SELECT 1 FROM campus_course_enrollments e
            JOIN campus_courses c ON c.id = e.course_id
             WHERE e.student_id = u.id AND e.status = 'active' AND c.teacher_id = $1
          )
          OR EXISTS (
            SELECT 1 FROM campus_tool_submissions s
            JOIN campus_tool_quizzes q ON q.id = s.quiz_id
             WHERE s.student_id = u.id AND q.teacher_id = $1
          )
        )
      ORDER BY u.display_name
      LIMIT 200`,
    [teacherId],
  );

  const studentRows = [];
  for (const s of students.rows) {
    const sid = String(s.student_id);
    const days = await pool.query(
      `SELECT count(DISTINCT checkin_date)::int AS days
         FROM campus_tool_checkin_logs WHERE student_id = $1`,
      [sid],
    );
    const todayHit = await pool.query(
      `SELECT count(*)::int AS total
         FROM campus_tool_checkin_logs
        WHERE student_id = $1 AND checkin_date = $2::date`,
      [sid, today],
    );
    const planStats = await studentPlanCompletion(pool, sid);
    studentRows.push({
      student_id: sid,
      student_name: String(s.student_name),
      checkin_days: Number(days.rows[0]?.days || 0),
      checked_in_today: Number(todayHit.rows[0]?.total || 0) > 0,
      plan_completion: planStats.planCompletion,
      has_active_plan: planStats.hasActivePlan,
    });
  }

  const checkedToday = studentRows.filter((r) => r.checked_in_today).length;
  const totalStudents = studentRows.length;

  return {
    today,
    tasks,
    students: studentRows,
    overview: {
      student_total: totalStudents,
      checked_today: checkedToday,
      checkin_today_rate: totalStudents > 0 ? checkedToday / totalStudents : 0,
      task_total: tasks.filter((t) => t.published).length,
    },
  };
}

export { id as newToolId, randomUUID };
