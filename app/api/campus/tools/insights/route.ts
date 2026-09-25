import { getCampusSessionFromRequest } from '@/lib/auth/campus-auth';
import {
  batchGradeOpenSubmissions,
  getSubmissionDetailForTeacher,
  gradeSubmissionManual,
  insightsForStudent,
  insightsForTeacher,
  insightsOverview,
  insightsTeacherStudentDetail,
  listAlerts,
  listOralSessions,
  listSubmissionsForTeacher,
  recallSubmissionForTeacher,
  requestRedoForStudent,
  reviewRedoRequest,
  saveOralSession,
} from '@/lib/campus-tools/store';
import { campusToolsChat, extractJsonObject } from '@/lib/campus-tools/llm';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const session = await getCampusSessionFromRequest(request);
    if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
    const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
    const url = new URL(request.url);
    const view = url.searchParams.get('view') || 'insights';
    const quizId = url.searchParams.get('quizId') || undefined;
    const submissionId = url.searchParams.get('submissionId') || undefined;
    const studentId = url.searchParams.get('studentId') || undefined;

    if (view === 'alerts') {
      if (session.role === 'student') return apiError('FORBIDDEN', 403, '无权限');
      return apiSuccess({ records: await listAlerts(pool) });
    }
    if (view === 'submission') {
      if (session.role !== 'teacher') return apiError('FORBIDDEN', 403, '仅教师可查看提交');
      if (!submissionId) return apiError('INVALID_REQUEST', 400, '缺少 submissionId');
      const detail = await getSubmissionDetailForTeacher(pool, session.id, submissionId);
      if (!detail) return apiError('NOT_FOUND', 404, '提交不存在');
      return apiSuccess({ submission: detail });
    }
    if (view === 'submissions') {
      if (session.role !== 'teacher') return apiError('FORBIDDEN', 403, '仅教师可查看提交');
      return apiSuccess({
        records: await listSubmissionsForTeacher(pool, session.id, quizId),
      });
    }
    if (view === 'student') {
      if (session.role !== 'teacher') return apiError('FORBIDDEN', 403, '仅教师可查看');
      if (!studentId) return apiError('INVALID_REQUEST', 400, '缺少 studentId');
      const detail = await insightsTeacherStudentDetail(pool, session.id, studentId);
      if (!detail) return apiError('NOT_FOUND', 404, '学生不存在');
      return apiSuccess({ detail });
    }
    if (view === 'oral') {
      return apiSuccess({ records: await listOralSessions(pool, session) });
    }
    if (session.role === 'teacher') {
      return apiSuccess(await insightsForTeacher(pool, session.id));
    }
    if (session.role === 'student') {
      return apiSuccess(await insightsForStudent(pool, session.id));
    }
    return apiSuccess({ overview: await insightsOverview(pool), alerts: await listAlerts(pool) });
  } catch (error) {
    console.error('[campus/tools/insights GET]', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : '学情数据加载失败',
    );
  }
}

export async function POST(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    submissionId?: string;
    submissionIds?: string[];
    quizId?: string;
    score?: number;
    feedback?: string;
    approve?: boolean;
    note?: string;
    scene?: string;
    transcript?: unknown[];
    oralScore?: number;
    oralFeedback?: string;
  } | null;

  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');

  if (body?.action === 'grade_submission') {
    if (session.role !== 'teacher') return apiError('FORBIDDEN', 403, '仅教师可批改');
    const ok = await gradeSubmissionManual(
      pool,
      session.id,
      String(body.submissionId || ''),
      Number(body.score) || 0,
      String(body.feedback || ''),
    );
    if (!ok) return apiError('NOT_FOUND', 404, '提交不存在');
    return apiSuccess({ updated: true });
  }

  if (body?.action === 'request_redo') {
    if (session.role !== 'student') return apiError('FORBIDDEN', 403, '仅学生可申请重做');
    const quizId = String(body.quizId || '').trim();
    if (!quizId) return apiError('INVALID_REQUEST', 400, '缺少 quizId');
    const ok = await requestRedoForStudent(pool, session.id, quizId);
    if (!ok) return apiError('INVALID_REQUEST', 400, '无法申请（可能已在审核中或尚未交卷）');
    return apiSuccess({ requested: true });
  }

  if (body?.action === 'review_redo') {
    if (session.role !== 'teacher') return apiError('FORBIDDEN', 403, '仅教师可审批');
    const ok = await reviewRedoRequest(
      pool,
      session.id,
      String(body.submissionId || ''),
      Boolean(body.approve),
      String(body.note || ''),
    );
    if (!ok) return apiError('NOT_FOUND', 404, '申请不存在或已处理');
    return apiSuccess({ reviewed: true, approved: Boolean(body.approve) });
  }

  if (body?.action === 'recall_submission') {
    if (session.role !== 'teacher') return apiError('FORBIDDEN', 403, '仅教师可退回提交');
    const ok = await recallSubmissionForTeacher(pool, session.id, String(body.submissionId || ''));
    if (!ok) return apiError('NOT_FOUND', 404, '提交不存在');
    return apiSuccess({ recalled: true });
  }

  if (body?.action === 'batch_grade') {
    if (session.role !== 'teacher') return apiError('FORBIDDEN', 403, '仅教师可批改');
    const quizId = String(body.quizId || '').trim();
    if (!quizId) return apiError('INVALID_REQUEST', 400, '缺少 quizId');
    const summary = await batchGradeOpenSubmissions(
      pool,
      session.id,
      quizId,
      Array.isArray(body.submissionIds) ? body.submissionIds.map(String) : undefined,
      async ({ studentAnswer, referenceAnswer }) => {
        const raw = await campusToolsChat(
          session.id,
          '你是开放性简答批改助手。只根据「参考要点/评分模板」评估学生作答（非唯一解题目）。返回 JSON：{"score":0-100,"feedback":"评语与改进建议"}。不要要求与参考原文逐字一致。',
          `评分要点模板：${referenceAnswer || '观点明确、论据充分、表达清晰'}\n学生作答：${studentAnswer}`,
          { json: true },
        );
        const parsed = extractJsonObject(raw) as { score?: number; feedback?: string };
        return {
          score: Number(parsed.score) || 0,
          feedback: String(parsed.feedback || ''),
        };
      },
    );
    return apiSuccess(summary);
  }

  if (body?.action === 'save_oral') {
    if (session.role !== 'student') return apiError('FORBIDDEN', 403, '仅学生可保存口语');
    const oralId = await saveOralSession(pool, session, {
      scene: body.scene || 'greeting',
      transcript: body.transcript || [],
      score: Number(body.oralScore) || 0,
      feedback: body.oralFeedback || '',
    });
    return apiSuccess({ oralId }, 201);
  }

  return apiError('INVALID_REQUEST', 400, '未知操作');
}
