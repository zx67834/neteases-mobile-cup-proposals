import { getCampusSessionFromRequest } from '@/lib/auth/campus-auth';
import {
  createQuiz,
  getQuizWithQuestions,
  listPublishedQuizzesForStudent,
  listTeacherQuizzes,
  publishQuiz,
  submitQuizAnswers,
  unpublishQuiz,
} from '@/lib/campus-tools/store';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const session = await getCampusSessionFromRequest(request);
    if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
    const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
    const url = new URL(request.url);
    const quizId = url.searchParams.get('id');
    if (quizId) {
      const hide = session.role === 'student';
      const quiz = await getQuizWithQuestions(pool, quizId, hide);
      if (!quiz) return apiError('NOT_FOUND', 404, '练习不存在');
      return apiSuccess({ quiz });
    }
    if (session.role === 'teacher' || session.role === 'admin') {
      const records =
        session.role === 'teacher'
          ? await listTeacherQuizzes(pool, session.id)
          : await listTeacherQuizzes(pool, session.id);
      // admin: show all published for overview via student list path too
      if (session.role === 'admin') {
        const all = await pool.query(
          `SELECT q.*, u.display_name AS teacher_name,
                  (SELECT count(*)::int FROM campus_tool_questions qq WHERE qq.quiz_id = q.id) AS question_count
             FROM campus_tool_quizzes q
             JOIN campus_users u ON u.id = q.teacher_id
            ORDER BY q.updated_at DESC LIMIT 100`,
        );
        return apiSuccess({ records: all.rows });
      }
      return apiSuccess({ records });
    }
    const records = await listPublishedQuizzesForStudent(pool, session.id);
    return apiSuccess({ records });
  } catch (error) {
    console.error('[campus/tools/quizzes GET]', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : '练习列表加载失败',
    );
  }
}

export async function POST(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  if (session.role !== 'teacher') return apiError('FORBIDDEN', 403, '仅教师可创建练习');
  const body = (await request.json().catch(() => null)) as {
    title?: string;
    topic?: string;
    difficulty?: string;
    sourceText?: string;
    classId?: string;
    publish?: boolean;
    questions?: Array<{
      qtype?: string;
      prompt?: string;
      options?: string[];
      answer?: string;
      explanation?: string;
    }>;
  } | null;
  const title = body?.title?.trim() || '';
  const questions = (body?.questions ?? []).filter((q) => q.prompt?.trim());
  if (!title || !questions.length) return apiError('INVALID_REQUEST', 400, '标题或题目无效');
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  const quizId = await createQuiz(pool, session, {
    title,
    topic: body?.topic?.trim() || title,
    difficulty: body?.difficulty || 'medium',
    sourceText: body?.sourceText || '',
    classId: body?.classId || null,
    publish: Boolean(body?.publish),
    questions: questions.map((q) => {
      let qtype = q.qtype || 'short';
      if (!['choice', 'judge', 'short', 'open'].includes(qtype)) qtype = 'short';
      let options = q.options ?? [];
      let answer = String(q.answer ?? '');
      if (qtype === 'judge') {
        options = ['对', '错'];
        if (/^(对|正确|true|t|yes|√)/i.test(answer)) answer = '对';
        else if (/^(错|错误|false|f|no|×)/i.test(answer)) answer = '错';
        else if (answer !== '对' && answer !== '错') answer = '对';
      } else if (qtype === 'open' || qtype === 'short') {
        options = [];
      }
      return {
        qtype,
        prompt: String(q.prompt),
        options,
        answer,
        explanation: String(q.explanation ?? ''),
      };
    }),
  });
  return apiSuccess({ quizId }, 201);
}

export async function PATCH(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  const body = (await request.json().catch(() => null)) as {
    quizId?: string;
    action?: string;
    answers?: Record<string, string>;
  } | null;
  const quizId = body?.quizId?.trim();
  if (!quizId) return apiError('INVALID_REQUEST', 400, '缺少 quizId');
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');

  if (body?.action === 'publish') {
    if (session.role !== 'teacher') return apiError('FORBIDDEN', 403, '仅教师可发布');
    const ok = await publishQuiz(pool, session.id, quizId);
    if (!ok) return apiError('NOT_FOUND', 404, '练习不存在');
    return apiSuccess({ published: true });
  }

  if (body?.action === 'unpublish' || body?.action === 'recall') {
    if (session.role !== 'teacher') return apiError('FORBIDDEN', 403, '仅教师可收回');
    const ok = await unpublishQuiz(pool, session.id, quizId);
    if (!ok) return apiError('NOT_FOUND', 404, '练习不存在或未发布');
    return apiSuccess({ unpublished: true });
  }

  if (body?.action === 'submit') {
    if (session.role !== 'student') return apiError('FORBIDDEN', 403, '仅学生可交卷');
    const result = await submitQuizAnswers(pool, session, quizId, body.answers ?? {});
    if (!result) return apiError('NOT_FOUND', 404, '练习不可用');
    return apiSuccess(result);
  }

  return apiError('INVALID_REQUEST', 400, '未知操作');
}
