import { getCampusSessionFromRequest } from '@/lib/auth/campus-auth';
import { saveCheckinEvidenceFiles } from '@/lib/campus-tools/checkin-files';
import { campusToolsChat } from '@/lib/campus-tools/llm';
import { stripPlainMarkup } from '@/lib/campus-tools/plain-text';
import {
  createCheckinTask,
  createLearningPlan,
  getActivePlan,
  listMonthCheckinCalendar,
  listStudentPlans,
  listTeacherCheckinTasks,
  listTodayCheckinTargets,
  submitCheckin,
  teacherCheckinOverview,
  unpublishCheckinTask,
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
    const month = url.searchParams.get('month');
    const date = url.searchParams.get('date');

    if (session.role === 'teacher') {
      return apiSuccess(await teacherCheckinOverview(pool, session.id));
    }
    if (session.role === 'student') {
      if (month && /^\d{4}-\d{2}$/.test(month)) {
        return apiSuccess(await listMonthCheckinCalendar(pool, session.id, month));
      }
      const day = await listTodayCheckinTargets(pool, session.id, date || undefined);
      const plans = await listStudentPlans(pool, session.id);
      return apiSuccess({ ...day, plans });
    }
    return apiSuccess({ tasks: await listTeacherCheckinTasks(pool, session.id) });
  } catch (error) {
    console.error('[campus/tools/checkin GET]', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : '打卡数据加载失败',
    );
  }
}

async function parseCheckinPost(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const action = String(form.get('action') || '').trim();
    const files: Array<{ name: string; mime: string; bytes: Buffer }> = [];
    for (const [key, value] of form.entries()) {
      if (key !== 'file' && key !== 'files') continue;
      if (typeof value === 'string') continue;
      const blob = value as File;
      const bytes = Buffer.from(await blob.arrayBuffer());
      if (!bytes.length) continue;
      files.push({
        name: blob.name || 'file',
        mime: blob.type || 'application/octet-stream',
        bytes,
      });
    }
    return {
      action,
      title: String(form.get('title') || ''),
      body: String(form.get('body') || ''),
      classId: (form.get('classId') as string) || null,
      startDate: String(form.get('startDate') || '') || undefined,
      endDate: String(form.get('endDate') || '') || undefined,
      taskId: String(form.get('taskId') || ''),
      items: String(form.get('items') || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      sourceKind: String(form.get('sourceKind') || '') as 'teacher_task' | 'plan_item' | '',
      sourceId: String(form.get('sourceId') || ''),
      note: String(form.get('note') || ''),
      draftHint: String(form.get('draftHint') || ''),
      checkinDate: String(form.get('checkinDate') || '') || undefined,
      files,
    };
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  return {
    action: String(body?.action || '').trim(),
    title: String(body?.title || ''),
    body: String(body?.body || ''),
    classId: (body?.classId as string) || null,
    startDate: (body?.startDate as string) || undefined,
    endDate: (body?.endDate as string) || undefined,
    taskId: String(body?.taskId || ''),
    items: Array.isArray(body?.items) ? body!.items.map((t) => String(t)) : [],
    sourceKind: String(body?.sourceKind || '') as 'teacher_task' | 'plan_item' | '',
    sourceId: String(body?.sourceId || ''),
    note: String(body?.note || ''),
    draftHint: String(body?.draftHint || ''),
    checkinDate: (body?.checkinDate as string) || undefined,
    files: [] as Array<{ name: string; mime: string; bytes: Buffer }>,
  };
}

export async function POST(request: Request) {
  try {
    const session = await getCampusSessionFromRequest(request);
    if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');
    const payload = await parseCheckinPost(request);
    const action = payload.action;
    if (!action) return apiError('INVALID_REQUEST', 400, '缺少 action');
    const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');

    if (action === 'create_task') {
      if (session.role !== 'teacher') return apiError('FORBIDDEN', 403, '仅教师可发布打卡');
      const title = stripPlainMarkup(payload.title.trim());
      if (!title) return apiError('INVALID_REQUEST', 400, '请填写任务标题');
      const taskId = await createCheckinTask(pool, session, {
        title,
        body: stripPlainMarkup(payload.body),
        classId: payload.classId || null,
        startDate: payload.startDate,
        endDate: payload.endDate,
      });
      return apiSuccess({ taskId }, 201);
    }

    if (action === 'unpublish_task') {
      if (session.role !== 'teacher') return apiError('FORBIDDEN', 403, '仅教师可退回');
      const ok = await unpublishCheckinTask(pool, session.id, payload.taskId);
      if (!ok) return apiError('NOT_FOUND', 404, '任务不存在');
      return apiSuccess({ unpublished: true });
    }

    if (action === 'create_plan') {
      if (session.role !== 'student') return apiError('FORBIDDEN', 403, '仅学生可制定计划');
      const title = stripPlainMarkup(payload.title.trim() || '我的学习计划');
      const items = payload.items.map((t) => stripPlainMarkup(String(t)));
      const planId = await createLearningPlan(pool, session.id, {
        title,
        startDate: payload.startDate,
        endDate: payload.endDate,
        items,
      });
      if (!planId) return apiError('INVALID_REQUEST', 400, '请至少添加一条计划目标');
      return apiSuccess({ planId, plan: await getActivePlan(pool, session.id) }, 201);
    }

    if (action === 'checkin') {
      if (session.role !== 'student') return apiError('FORBIDDEN', 403, '仅学生可打卡');
      const sourceKind = payload.sourceKind;
      const sourceId = payload.sourceId.trim();
      if (sourceKind !== 'teacher_task' && sourceKind !== 'plan_item') {
        return apiError('INVALID_REQUEST', 400, '无效的打卡来源');
      }
      if (!sourceId) return apiError('INVALID_REQUEST', 400, '缺少打卡目标');

      let evidence: Awaited<ReturnType<typeof saveCheckinEvidenceFiles>> = [];
      if (payload.files.length) {
        try {
          evidence = await saveCheckinEvidenceFiles({
            studentId: session.id,
            checkinDate:
              payload.checkinDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.checkinDate)
                ? payload.checkinDate
                : new Date().toLocaleDateString('en-CA'),
            files: payload.files,
          });
        } catch (e) {
          return apiError('INVALID_REQUEST', 400, e instanceof Error ? e.message : '文件上传失败');
        }
      }

      const row = await submitCheckin(pool, session.id, {
        sourceKind,
        sourceId,
        note: stripPlainMarkup(payload.note),
        checkinDate: payload.checkinDate,
        evidence,
      });
      if (!row) return apiError('INVALID_REQUEST', 400, '无法打卡（可能不在范围内或未来日期）');
      return apiSuccess({
        checked: true,
        logId: row.id,
        evidence: row.evidence,
        day: await listTodayCheckinTargets(pool, session.id, payload.checkinDate),
      });
    }

    if (action === 'plan_draft') {
      if (session.role !== 'student') return apiError('FORBIDDEN', 403, '仅学生可用');
      const start = payload.startDate || new Date().toISOString().slice(0, 10);
      const raw = await campusToolsChat(
        session.id,
        `你是学习计划助手。输出按天拆分的学习目标，禁止 Markdown。
格式要求：每行一条，优先写成「YYYY-MM-DD 目标」；若是贯穿整段时间的长期目标，写成「每日 目标」。
共 5～10 条，中文，简短可执行。从 ${start} 起排。不要额外说明。`,
        payload.draftHint.trim() || '制定一份兼顾练习与复习的学习计划',
      );
      const text = stripPlainMarkup(raw);
      const items = text
        .split('\n')
        .map((l) => l.replace(/^\d+[\.\)、．]\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 12);
      return apiSuccess({ items, raw: text });
    }

    return apiError('INVALID_REQUEST', 400, '未知操作');
  } catch (error) {
    console.error('[campus/tools/checkin POST]', error);
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : '打卡操作失败');
  }
}
