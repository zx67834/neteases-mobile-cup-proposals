'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Loader2, User, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { PrimaryButton, SectionTitle, ToolCard, ToolShell } from '@/components/campus/tools/ToolShell';

interface QuizRow {
  id: string;
  title: string;
  status: string;
  question_count?: number;
  submission_count?: number;
}

interface SubmissionRow {
  id: string;
  quiz_id: string;
  quiz_title: string;
  student_name: string;
  score: number;
  max_score: number;
  feedback: string;
  status: string;
  redo_status?: string;
  redo_note?: string;
}

interface SubmissionItem {
  id: string;
  ord: number;
  qtype: string;
  prompt: string;
  options: string[];
  referenceAnswer: string;
  explanation: string;
  studentAnswer: string;
}

interface SubmissionDetail {
  id: string;
  quizId: string;
  quizTitle: string;
  studentName: string;
  score: number;
  maxScore: number;
  feedback: string;
  status: string;
  items: SubmissionItem[];
}

const fieldClass =
  'w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-500/15 dark:border-white/10 dark:bg-slate-950';

function typeLabel(qtype: string) {
  const t = String(qtype || '').toLowerCase();
  if (t === 'choice' || t.includes('choice') || t.includes('选')) return '选择题';
  if (t === 'judge' || t.includes('judge') || t.includes('判断')) return '判断题';
  if (t === 'open' || t.includes('open') || t.includes('开放')) return '开放简答';
  if (t === 'short' || t.includes('short') || t.includes('简') || t.includes('填'))
    return '唯一解简答';
  return '题目';
}

function isOpen(qtype: string) {
  return qtype === 'open';
}

function normalizeJudge(v: string) {
  if (/^(对|正确|true|t|yes|√)$/i.test(v.trim())) return '对';
  if (/^(错|错误|false|f|no|×)$/i.test(v.trim())) return '错';
  return v.trim();
}

async function readApiJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(`服务无响应（HTTP ${res.status}），请检查数据库迁移或重启服务`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(text.slice(0, 160) || `响应不是 JSON（HTTP ${res.status}）`);
  }
}

function normalizeShort(v: string) {
  return v
    .trim()
    .replace(/\s+/g, '')
    .replace(/[。．.！!？?，,、]/g, '')
    .toLowerCase();
}

function isObjectiveCorrect(it: SubmissionItem): boolean {
  if (isOpen(it.qtype)) return false;
  const given = (it.studentAnswer || '').trim();
  const expected = (it.referenceAnswer || '').trim();
  if (!given || !expected) return false;
  if (it.qtype === 'judge') return normalizeJudge(given) === normalizeJudge(expected);
  if (it.qtype === 'short') {
    return (
      normalizeShort(given) === normalizeShort(expected) ||
      given.localeCompare(expected, 'zh', { sensitivity: 'accent' }) === 0
    );
  }
  return (
    given.localeCompare(expected, 'zh', { sensitivity: 'accent' }) === 0 ||
    given.toLowerCase() === expected.toLowerCase()
  );
}

function objectiveScore(items: SubmissionItem[]) {
  return items.filter((it) => !isOpen(it.qtype) && isObjectiveCorrect(it)).length;
}

function statusLabel(status: string, hasOpen: boolean) {
  if (status === 'pending_review') return '待 AI 批开放题';
  if (status === 'graded' && hasOpen) return '已评分';
  if (status === 'graded') return '已自动判';
  return status || '待复核';
}

export function GradingTool() {
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [quizId, setQuizId] = useState('');
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [pending, setPending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchPending, setBatchPending] = useState(false);

  const openItems = useMemo(
    () => detail?.items.filter((it) => isOpen(it.qtype)) ?? [],
    [detail],
  );
  const hasOpen = openItems.length > 0;
  const objScore = useMemo(
    () => (detail ? objectiveScore(detail.items) : 0),
    [detail],
  );

  const loadQuizzes = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/campus/tools/quizzes', { cache: 'no-store' });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(String(data.error || '练习列表加载失败'));
      const rows = (data.records ?? []) as QuizRow[];
      const sorted = [...rows].sort((a, b) => {
        if (a.status === 'published' && b.status !== 'published') return -1;
        if (b.status === 'published' && a.status !== 'published') return 1;
        return 0;
      });
      setQuizzes(sorted);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '练习列表加载失败');
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadSubmissions = useCallback(async (id: string) => {
    if (!id) {
      setSubmissions([]);
      return;
    }
    setLoadingSubs(true);
    try {
      const res = await fetch(
        `/api/campus/tools/insights?view=submissions&quizId=${encodeURIComponent(id)}`,
        { cache: 'no-store' },
      );
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(String(data.error || '提交列表加载失败'));
      setSubmissions((data.records ?? []) as SubmissionRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交列表加载失败');
    } finally {
      setLoadingSubs(false);
    }
  }, []);

  useEffect(() => {
    void loadQuizzes();
  }, [loadQuizzes]);

  useEffect(() => {
    setDetail(null);
    setSelectedIds([]);
    void loadSubmissions(quizId);
  }, [quizId, loadSubmissions]);

  const pendingIds = useMemo(
    () =>
      submissions
        .filter((s) => s.status === 'pending_review')
        .map((s) => s.id),
    [submissions],
  );

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAllPending() {
    if (pendingIds.length && pendingIds.every((id) => selectedIds.includes(id))) {
      setSelectedIds((prev) => prev.filter((id) => !pendingIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pendingIds])));
    }
  }

  async function batchGrade() {
    if (!quizId) {
      toast.error('请先选择练习');
      return;
    }
    const ids = selectedIds.length ? selectedIds : pendingIds;
    if (!ids.length) {
      toast.message('没有待批改的提交（可勾选后批量，或先等学生交含开放题的卷）');
      return;
    }
    setBatchPending(true);
    try {
      const res = await fetch('/api/campus/tools/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch_grade',
          quizId,
          submissionIds: ids,
        }),
      });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(String(data.error || '批量批改失败'));
      toast.success(`批量完成：成功 ${data.graded ?? 0}/${data.total ?? ids.length}`);
      setSelectedIds([]);
      setDetail(null);
      await loadSubmissions(quizId);
      await loadQuizzes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '批量批改失败');
    } finally {
      setBatchPending(false);
    }
  }

  async function openSubmission(id: string) {
    setLoadingDetail(true);
    try {
      const res = await fetch(
        `/api/campus/tools/insights?view=submission&submissionId=${encodeURIComponent(id)}`,
        { cache: 'no-store' },
      );
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(String(data.error || '提交详情加载失败'));
      const sub = data.submission as SubmissionDetail;
      setDetail(sub);
      setScore(Number(sub.score) || 0);
      setFeedback(sub.feedback || '');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交详情加载失败');
    } finally {
      setLoadingDetail(false);
    }
  }

  async function gradeAi() {
    if (!detail?.items.length) {
      toast.error('请先打开一份学生提交');
      return;
    }
    const opens = detail.items.filter((it) => isOpen(it.qtype));
    if (!opens.length) {
      toast.message('本题均为唯一解，已自动判分，无需 AI 批改');
      return;
    }
    setPending(true);
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

      const res = await fetch('/api/campus/tools/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grade_text',
          studentAnswer,
          referenceAnswer,
          rubric: '对照参考要点：要点覆盖、论证完整、表达清晰',
        }),
      });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(String(data.error || '批改失败'));

      // AI 0-100 → 开放题满分份额，再与客观分合并
      const pct = Math.max(0, Math.min(100, Number(data.score) || 0));
      const openMax = opens.length;
      const openPts = Math.round((pct / 100) * openMax);
      const autoObj = objectiveScore(detail.items);
      const total = Math.min(detail.maxScore, autoObj + openPts);
      setScore(total);
      setFeedback(
        [
          `客观题 ${autoObj}/${detail.items.length - openMax}`,
          `开放题 AI ${openPts}/${openMax}`,
          String(data.feedback || ''),
        ]
          .filter(Boolean)
          .join('；'),
      );
      toast.success('开放题 AI 批改完成，请确认后保存');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '批改失败');
    } finally {
      setPending(false);
    }
  }

  async function saveGrade() {
    if (!detail) return;
    setPending(true);
    try {
      const res = await fetch('/api/campus/tools/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grade_submission',
          submissionId: detail.id,
          score,
          feedback,
        }),
      });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(String(data.error || '保存失败'));
      toast.success('批改已保存，学生可见成绩');
      setDetail({ ...detail, score, feedback, status: 'graded' });
      await loadSubmissions(quizId);
      await loadQuizzes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setPending(false);
    }
  }

  async function toggleQuizPublish(quiz: QuizRow) {
    const action = quiz.status === 'published' ? 'unpublish' : 'publish';
    setPending(true);
    try {
      const res = await fetch('/api/campus/tools/quizzes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: quiz.id, action }),
      });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(String(data.error || (action === 'publish' ? '下发失败' : '退回失败')));
      if (action === 'unpublish') {
        toast.success('已退回下发，学生端不再显示该练习');
        if (quizId === quiz.id) {
          setQuizId('');
          setDetail(null);
          setSubmissions([]);
        }
      } else {
        toast.success('已下发，学生可在「我的练习」看到');
      }
      await loadQuizzes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setPending(false);
    }
  }

  async function reviewRedo(submissionId: string, studentName: string, approve: boolean) {
    setPending(true);
    try {
      const res = await fetch('/api/campus/tools/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review_redo',
          submissionId,
          approve,
          note: approve ? '' : '老师未同意本次重做申请',
        }),
      });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(String(data.error || '审批失败'));
      toast.success(
        approve
          ? `已同意「${studentName}」重做，提交已清除`
          : `已拒绝「${studentName}」的重做申请`,
      );
      if (detail?.id === submissionId) setDetail(null);
      await loadSubmissions(quizId);
      await loadQuizzes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '审批失败');
    } finally {
      setPending(false);
    }
  }

  async function returnSubmission(submissionId: string, studentName: string) {
    setPending(true);
    try {
      const res = await fetch('/api/campus/tools/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recall_submission',
          submissionId,
        }),
      });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(String(data.error || '退回失败'));
      toast.success(`已退回「${studentName}」的提交`);
      if (detail?.id === submissionId) setDetail(null);
      setSelectedIds((prev) => prev.filter((id) => id !== submissionId));
      await loadSubmissions(quizId);
      await loadQuizzes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '退回失败');
    } finally {
      setPending(false);
    }
  }

  /** 点一次展开；再点一次只收起，不删除 */
  function onQuizCardClick(quiz: QuizRow) {
    if (quizId === quiz.id) {
      setQuizId('');
      setDetail(null);
      setSubmissions([]);
      return;
    }
    setQuizId(quiz.id);
  }

  return (
    <ToolShell
      title="作业批改"
      description="点练习展开学生列表，再点收起。退回下发/退回提交请用右侧「退回」按钮。唯一解自动判，开放题可 AI / 批量批改。"
      eyebrow="批改 · Grading"
    >
      <ToolCard>
        <SectionTitle
          icon={<ClipboardList className="h-4 w-4" />}
          title="我的练习"
          hint="点开展开学生列表，再点可收起。"
        />
        {loadingList ? (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            加载中…
          </p>
        ) : null}
        <ul className="space-y-2">
          {quizzes.map((q) => {
            const active = quizId === q.id;
            const published = q.status === 'published';
            return (
              <li key={q.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onQuizCardClick(q)}
                  className={`flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
                    active
                      ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-200 dark:border-violet-500/50 dark:bg-violet-500/15'
                      : 'border-slate-100 hover:border-violet-200 dark:border-white/10'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900 dark:text-slate-50">
                      {q.title}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {q.question_count ?? 0} 题 · {q.submission_count ?? 0} 份提交
                      {active
                        ? ' · 已展开 · 再点收起'
                        : published
                          ? ' · 已下发 · 点击展开'
                          : ' · 草稿 · 点击展开'}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      published
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-500 dark:bg-white/10'
                    }`}
                  >
                    {published ? '已下发' : '草稿'}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void toggleQuizPublish(q)}
                  className={`shrink-0 rounded-2xl px-3 text-xs font-semibold ${
                    published
                      ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10'
                      : 'bg-violet-600 text-white hover:bg-violet-500'
                  }`}
                >
                  {published ? '退回' : '下发'}
                </button>
              </li>
            );
          })}
          {!loadingList && !quizzes.length ? (
            <li className="text-sm text-slate-400">暂无练习，请先在「智能出题」创建并下发</li>
          ) : null}
        </ul>
      </ToolCard>

      {quizId ? (
        <ToolCard>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-violet-600" />
              <h2 className="font-semibold">学生提交</h2>
              {loadingSubs ? <Loader2 className="h-4 w-4 animate-spin text-violet-500" /> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAllPending}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-white/10"
              >
                {pendingIds.length && pendingIds.every((id) => selectedIds.includes(id))
                  ? '取消全选待批'
                  : `全选待批（${pendingIds.length}）`}
              </button>
              <PrimaryButton
                pending={batchPending}
                onClick={() => void batchGrade()}
                disabled={batchPending}
              >
                {selectedIds.length
                  ? `批量批改已选 ${selectedIds.length} 份`
                  : '批量批改待审卷'}
              </PrimaryButton>
            </div>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            点学生打开批改，再点收起。学生申请重做会出现「同意 / 拒绝」；老师也可直接「退回」清除提交。
          </p>
          <ul className="space-y-2 text-sm">
            {submissions.map((s) => {
              const active = detail?.id === s.id;
              const checked = selectedIds.includes(s.id);
              const redoPending = s.redo_status === 'pending';
              return (
                <li key={s.id} className="flex flex-wrap items-stretch gap-2">
                  <label className="flex items-center px-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(s.id)}
                      className="h-4 w-4 rounded border-slate-300 text-violet-600"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (active) {
                        setDetail(null);
                        return;
                      }
                      void openSubmission(s.id);
                    }}
                    className={`flex min-w-0 flex-1 items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                      redoPending
                        ? 'border-amber-300 bg-amber-50/80 dark:border-amber-500/40 dark:bg-amber-500/10'
                        : active
                          ? 'border-violet-300 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/10'
                          : 'border-slate-100 hover:border-violet-200 dark:border-white/10'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-400" />
                      <span>
                        <span className="font-medium">{s.student_name}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {redoPending
                            ? '申请重做中 · 请审批'
                            : active
                              ? '已展开 · 再点收起'
                              : `${statusLabel(s.status, s.status === 'pending_review')} · 点击打开批改`}
                        </span>
                      </span>
                    </span>
                    <span className="font-semibold text-violet-700">
                      {s.score}/{s.max_score}
                    </span>
                  </button>
                  {redoPending ? (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void reviewRedo(s.id, s.student_name, true)}
                        className="shrink-0 rounded-2xl bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500"
                      >
                        同意
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void reviewRedo(s.id, s.student_name, false)}
                        className="shrink-0 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950"
                      >
                        拒绝
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void returnSubmission(s.id, s.student_name)}
                      className="shrink-0 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10"
                    >
                      退回
                    </button>
                  )}
                </li>
              );
            })}
            {!loadingSubs && !submissions.length ? (
              <li className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-slate-400 dark:bg-white/5">
                还没有学生提交这份练习
              </li>
            ) : null}
          </ul>
        </ToolCard>
      ) : null}

      {loadingDetail ? (
        <ToolCard>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            正在打开学生作答…
          </div>
        </ToolCard>
      ) : null}

      {detail ? (
        <ToolCard>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/10">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                {detail.studentName} · {detail.quizTitle}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                满分 {detail.maxScore} · 客观已得 {objScore} · 开放题 {openItems.length} 道
                {hasOpen ? '（需 AI）' : '（均为唯一解）'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton
                pending={pending}
                disabled={!hasOpen}
                onClick={() => void gradeAi()}
                title={hasOpen ? undefined : '本题均为唯一解，已自动判分'}
              >
                {hasOpen ? 'AI 批开放题' : '无需 AI 批改'}
              </PrimaryButton>
              <PrimaryButton pending={pending} onClick={() => void saveGrade()}>
                保存成绩
              </PrimaryButton>
            </div>
          </div>

          {!hasOpen ? (
            <p className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
              本卷题目均为唯一解，已自动判分。可直接确认或微调总分后保存。
            </p>
          ) : null}

          <ol className="space-y-4">
            {detail.items.map((it, i) => {
              const open = isOpen(it.qtype);
              const matched = !open && isObjectiveCorrect(it);
              const wrong =
                !open &&
                Boolean(it.studentAnswer.trim()) &&
                Boolean(it.referenceAnswer.trim()) &&
                !matched;
              return (
                <li
                  key={it.id}
                  className={`rounded-2xl border p-4 ${
                    open
                      ? 'border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10'
                      : 'border-slate-100 bg-slate-50/80 dark:border-white/10 dark:bg-white/5'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    <span className="mr-2 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                      {typeLabel(it.qtype)}
                    </span>
                    <span
                      className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        open
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {open ? '需 AI 批' : '自动判'}
                    </span>
                    {i + 1}. {it.prompt}
                  </p>
                  {it.options?.length ? (
                    <ul className="mt-2 list-disc pl-5 text-xs text-slate-500">
                      {it.options.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-white px-3 py-2 text-sm dark:bg-slate-950">
                      <p className="text-xs font-medium text-slate-400">学生作答</p>
                      <p className="mt-1 text-slate-800 dark:text-slate-100">
                        {it.studentAnswer || '（空白）'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 text-sm dark:bg-slate-950">
                      <p className="text-xs font-medium text-slate-400">
                        {open ? '参考模板' : '标准答案'}
                      </p>
                      <p
                        className={`mt-1 ${
                          open
                            ? 'text-amber-800 dark:text-amber-300'
                            : 'text-violet-700 dark:text-violet-300'
                        }`}
                      >
                        {it.referenceAnswer || '（无）'}
                      </p>
                    </div>
                  </div>
                  {matched ? (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      自动判：正确
                    </p>
                  ) : null}
                  {wrong ? (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-rose-600">
                      <XCircle className="h-3.5 w-3.5" />
                      自动判：不正确
                    </p>
                  ) : null}
                  {open ? (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      开放性题目，请用「AI 批开放题」对照参考模板评分
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <div className="mt-5 grid gap-3 sm:grid-cols-[120px_1fr]">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400">得分</label>
              <input
                type="number"
                min={0}
                max={detail.maxScore || 100}
                className={fieldClass}
                value={score}
                onChange={(e) => setScore(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400">评语</label>
              <textarea
                className="min-h-[42px] w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-500/15 dark:border-white/10 dark:bg-slate-950"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="给学生的批改评语…"
              />
            </div>
          </div>
        </ToolCard>
      ) : null}
    </ToolShell>
  );
}
