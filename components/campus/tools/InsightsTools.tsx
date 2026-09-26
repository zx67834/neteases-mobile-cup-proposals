'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Mic2,
  Target,
  TrendingUp,
  Trophy,
  ClipboardList,
  Users,
  Filter,
  Loader2,
  CalendarCheck,
} from 'lucide-react';

import { ToolCard, ToolShell } from '@/components/campus/tools/ToolShell';

interface TeacherStudentRow {
  student_id: string;
  student_name: string;
  attempts: number;
  quiz_count: number;
  accuracy: number;
  avg_score: number;
  avg_max: number;
  sum_score: number;
  sum_max: number;
  last_submitted_at?: string;
  pending_count: number;
}

interface TeacherOverview {
  quiz_total: number;
  submission_total: number;
  student_total: number;
  avg_accuracy: number;
}

interface TeacherCheckinOverview {
  overview?: {
    student_total: number;
    checked_today: number;
    checkin_today_rate: number;
    task_total: number;
  };
  students?: Array<{
    student_id: string;
    student_name: string;
    checkin_days: number;
    checked_in_today: boolean;
    plan_completion: number;
    has_active_plan: boolean;
  }>;
}

interface TeacherQuizRow {
  id: string;
  title: string;
  submissions: number;
  avg_score: number;
  avg_max: number;
}

interface StudentDetail {
  studentId: string;
  studentName: string;
  quizzes: Array<{
    title: string;
    score: number;
    max_score: number;
    feedback: string;
    status: string;
    created_at?: string;
    difficulty?: string;
  }>;
  oral: Array<{ scene: string; score: number; feedback: string; created_at?: string }>;
  stats: {
    attemptCount: number;
    avgAccuracy: number;
    bestAccuracy: number;
    pendingCount: number;
    level: string;
    recentAccuracies: number[];
  };
}

function pct(n: number) {
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

function formatDay(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function levelFromAccuracy(accuracy: number, attempts: number) {
  if (!attempts) return '尚未练习';
  if (accuracy >= 0.9) return '优秀掌握';
  if (accuracy >= 0.75) return '良好巩固';
  if (accuracy >= 0.6) return '稳步提升';
  return '需要加练';
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) {
    return (
      <div className="flex h-16 items-center justify-center text-xs text-slate-400">
        完成练习后将显示趋势
      </div>
    );
  }
  const w = 280;
  const h = 64;
  const pad = 4;
  const points = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(values.length - 1, 1);
    const y = h - pad - Math.max(0, Math.min(1, v)) * (h - pad * 2);
    return `${x},${y}`;
  });
  const area = `M ${pad},${h - pad} L ${points.join(' L ')} L ${w - pad},${h - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="insightFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(124,58,237,0.35)" />
          <stop offset="100%" stopColor="rgba(124,58,237,0.02)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#insightFill)" />
      <polyline
        fill="none"
        stroke="#7c3aed"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.join(' ')}
      />
      {values.map((v, i) => {
        const x = pad + (i * (w - pad * 2)) / Math.max(values.length - 1, 1);
        const y = h - pad - Math.max(0, Math.min(1, v)) * (h - pad * 2);
        return <circle key={i} cx={x} cy={y} r="3" fill="#7c3aed" />;
      })}
    </svg>
  );
}

export function TeacherInsightsTool() {
  const [students, setStudents] = useState<TeacherStudentRow[]>([]);
  const [quizzes, setQuizzes] = useState<TeacherQuizRow[]>([]);
  const [overview, setOverview] = useState<TeacherOverview | null>(null);
  const [checkin, setCheckin] = useState<TeacherCheckinOverview | null>(null);
  const [filterId, setFilterId] = useState('');
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/campus/tools/insights', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setStudents(data.students ?? []);
      setQuizzes(data.quizzes ?? []);
      setOverview(data.overview ?? null);
      setCheckin(data.checkin ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!filterId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    void fetch(
      `/api/campus/tools/insights?view=student&studentId=${encodeURIComponent(filterId)}`,
      { cache: 'no-store' },
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.detail) setDetail(d.detail);
        else setDetail(null);
      })
      .finally(() => setLoadingDetail(false));
  }, [filterId]);

  const filteredStudents = useMemo(() => {
    if (!filterId) return students;
    return students.filter((s) => s.student_id === filterId);
  }, [students, filterId]);

  const fieldClass =
    'w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-500/15 dark:border-white/10 dark:bg-slate-950';

  return (
    <ToolShell
      title="学情看板"
      description="按学生汇总练习正确率与完成情况，可筛选查看单个学生详情。"
      eyebrow="学情 · Insights"
    >
      {loading ? (
        <ToolCard>
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            正在汇总学情…
          </p>
        </ToolCard>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-violet-50/60 p-4 dark:border-white/10 dark:from-slate-900 dark:to-violet-950/30">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <Users className="h-4 w-4 text-violet-600" />
            练习学生
          </p>
          <p className="mt-3 text-2xl font-bold">{overview?.student_total ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-violet-50/60 p-4 dark:border-white/10 dark:from-slate-900 dark:to-violet-950/30">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <ClipboardList className="h-4 w-4 text-violet-600" />
            提交次数
          </p>
          <p className="mt-3 text-2xl font-bold">{overview?.submission_total ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-violet-50/60 p-4 dark:border-white/10 dark:from-slate-900 dark:to-violet-950/30">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <BookOpen className="h-4 w-4 text-violet-600" />
            练习卷
          </p>
          <p className="mt-3 text-2xl font-bold">{overview?.quiz_total ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-violet-50/60 p-4 dark:border-white/10 dark:from-slate-900 dark:to-violet-950/30">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <Target className="h-4 w-4 text-violet-600" />
            班级均正确率
          </p>
          <p className="mt-3 text-2xl font-bold text-violet-700">
            {pct(Number(overview?.avg_accuracy || 0))}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-violet-50/60 p-4 dark:border-white/10 dark:from-slate-900 dark:to-violet-950/30">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <CalendarCheck className="h-4 w-4 text-violet-600" />
            今日打卡率
          </p>
          <p className="mt-3 text-2xl font-bold text-violet-700">
            {pct(Number(checkin?.overview?.checkin_today_rate || 0))}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {checkin?.overview?.checked_today ?? 0}/{checkin?.overview?.student_total ?? 0} 人
          </p>
        </div>
      </div>

      <ToolCard>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Filter className="h-4 w-4 text-violet-600" />
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            筛选学生
          </label>
          <select
            className={`${fieldClass} max-w-md`}
            value={filterId}
            onChange={(e) => setFilterId(e.target.value)}
          >
            <option value="">全部学生汇总</option>
            {students.map((s) => (
              <option key={s.student_id} value={s.student_id}>
                {s.student_name} · {pct(Number(s.accuracy))} · {s.attempts} 次
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400 dark:border-white/10">
                <th className="pb-3 pr-3 font-semibold">学生</th>
                <th className="pb-3 pr-3 font-semibold">正确率</th>
                <th className="pb-3 pr-3 font-semibold">练习次数</th>
                <th className="pb-3 pr-3 font-semibold">卷数</th>
                <th className="pb-3 pr-3 font-semibold">均分</th>
                <th className="pb-3 pr-3 font-semibold">打卡天</th>
                <th className="pb-3 pr-3 font-semibold">状态</th>
                <th className="pb-3 font-semibold">最近交卷</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((s) => {
                const accuracy = Number(s.accuracy) || 0;
                const active = filterId === s.student_id;
                const ck = checkin?.students?.find((c) => c.student_id === s.student_id);
                return (
                  <tr
                    key={s.student_id}
                    className={`cursor-pointer border-b border-slate-50 transition last:border-0 dark:border-white/5 ${
                      active
                        ? 'bg-violet-50/80 dark:bg-violet-500/10'
                        : 'hover:bg-slate-50/80 dark:hover:bg-white/5'
                    }`}
                    onClick={() => setFilterId((id) => (id === s.student_id ? '' : s.student_id))}
                  >
                    <td className="py-3 pr-3 font-medium text-slate-900 dark:text-slate-50">
                      {s.student_name}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                          <div
                            className="h-full rounded-full bg-violet-500"
                            style={{ width: pct(accuracy) }}
                          />
                        </div>
                        <span className="font-semibold text-violet-700">{pct(accuracy)}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-slate-600">{s.attempts}</td>
                    <td className="py-3 pr-3 text-slate-600">{s.quiz_count}</td>
                    <td className="py-3 pr-3 text-slate-600">
                      {Number(s.avg_score).toFixed(1)}/{Number(s.avg_max).toFixed(1)}
                    </td>
                    <td className="py-3 pr-3 text-slate-600">
                      {ck?.checkin_days ?? 0}
                      {ck?.checked_in_today ? (
                        <span className="ml-1 text-xs text-emerald-600">今</span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          accuracy < 0.6
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {levelFromAccuracy(accuracy, s.attempts)}
                        {s.pending_count > 0 ? ` · 待批 ${s.pending_count}` : ''}
                      </span>
                    </td>
                    <td className="py-3 text-slate-500">{formatDay(s.last_submitted_at)}</td>
                  </tr>
                );
              })}
              {!filteredStudents.length ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    暂无学生练习数据
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ToolCard>

      {filterId ? (
        <ToolCard>
          {loadingDetail ? (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
              加载该学生详情…
            </p>
          ) : detail ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                    {detail.studentName} · 个人学情
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {detail.stats.level} · 平均正确率 {pct(detail.stats.avgAccuracy)} · 最高{' '}
                    {pct(detail.stats.bestAccuracy)} · 共 {detail.stats.attemptCount} 次
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFilterId('')}
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-white/10"
                >
                  返回全部
                </button>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold text-slate-400">近期正确率走势</p>
                <Sparkline values={detail.stats.recentAccuracies} />
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-violet-600" />
                  <h3 className="font-semibold">练习明细</h3>
                </div>
                <ul className="space-y-3 text-sm">
                  {detail.quizzes.map((q, i) => {
                    const rate =
                      Number(q.max_score) > 0 ? Number(q.score) / Number(q.max_score) : 0;
                    return (
                      <li
                        key={i}
                        className="rounded-2xl border border-slate-100 px-4 py-3 dark:border-white/10"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{q.title}</p>
                            <p className="mt-0.5 text-xs text-slate-400">
                              {formatDay(q.created_at)}
                              {q.difficulty ? ` · ${q.difficulty}` : ''}
                              {q.status === 'pending_review' ? ' · 待批开放题' : ''}
                            </p>
                          </div>
                          <span className="font-semibold text-violet-700">
                            {q.score}/{q.max_score}
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                          <div
                            className="h-full rounded-full bg-violet-500"
                            style={{ width: pct(rate) }}
                          />
                        </div>
                        {q.feedback ? (
                          <p className="mt-2 text-xs leading-5 text-slate-500">{q.feedback}</p>
                        ) : null}
                      </li>
                    );
                  })}
                  {!detail.quizzes.length ? (
                    <li className="text-slate-400">该学生暂无练习记录</li>
                  ) : null}
                </ul>
              </div>

              {detail.oral.length ? (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Mic2 className="h-4 w-4 text-violet-600" />
                    <h3 className="font-semibold">口语记录</h3>
                  </div>
                  <ul className="space-y-2 text-sm">
                    {detail.oral.map((o, i) => (
                      <li
                        key={i}
                        className="flex justify-between rounded-2xl border border-slate-100 px-4 py-3 dark:border-white/10"
                      >
                        <span>
                          {o.scene}
                          <span className="mt-0.5 block text-xs text-slate-400">
                            {formatDay(o.created_at)}
                          </span>
                        </span>
                        <span className="font-semibold text-violet-700">{o.score} 分</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-400">未找到该学生详情</p>
          )}
        </ToolCard>
      ) : (
        <ToolCard>
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-violet-600" />
            <h2 className="font-semibold">各练习卷概览</h2>
          </div>
          <ul className="space-y-3 text-sm">
            {quizzes.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-slate-100 px-3 py-3 dark:border-white/10"
              >
                <p className="font-medium">{r.title}</p>
                <p className="mt-1 text-slate-500">
                  提交 {r.submissions} · 平均分 {Number(r.avg_score).toFixed(1)}/
                  {Number(r.avg_max).toFixed(1)}
                </p>
              </li>
            ))}
            {!quizzes.length ? <li className="text-slate-400">暂无练习卷</li> : null}
          </ul>
          <p className="mt-4 text-xs text-slate-400">
            提示：在上方表格点学生名，或用筛选框查看单人学情。也可去
            <Link href="/tools/grading" className="mx-1 text-violet-600 underline">
              作业批改
            </Link>
            处理待批卷。
          </p>
        </ToolCard>
      )}
    </ToolShell>
  );
}

interface StudentStats {
  attemptCount: number;
  availableTotal: number;
  completed: number;
  pending: number;
  avgAccuracy: number;
  bestAccuracy: number;
  recentAccuracies: number[];
  oralCount: number;
  oralAvg: number;
  lessonShared: number;
  level: string;
  streakDays?: number;
  checkedInToday?: boolean;
  planCompletion?: number;
}

interface CheckinInsight {
  streakDays: number;
  checkedInToday: boolean;
  todayDone: number;
  todayTotal: number;
  planCompletion: number;
  hasActivePlan?: boolean;
  planTitle?: string;
  recentLogs?: Array<{ checkin_date: string; source_kind: string; note: string }>;
}

interface QuizInsight {
  title: string;
  score: number;
  max_score: number;
  feedback: string;
  created_at?: string;
  difficulty?: string;
}

interface OralInsight {
  scene: string;
  score: number;
  feedback: string;
  created_at?: string;
}

function StatTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-violet-50/60 p-4 dark:border-white/10 dark:from-slate-900 dark:to-violet-950/30">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function StudentInsightsTool() {
  const [quizzes, setQuizzes] = useState<QuizInsight[]>([]);
  const [oral, setOral] = useState<OralInsight[]>([]);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [checkin, setCheckin] = useState<CheckinInsight | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch('/api/campus/tools/insights', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        setQuizzes(d.quizzes ?? []);
        setOral(d.oral ?? []);
        setStats(d.stats ?? null);
        setCheckin(d.checkin ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  const ringStyle = useMemo(() => {
    const a = stats?.avgAccuracy ?? 0;
    const deg = Math.round(a * 360);
    return {
      background: `conic-gradient(#7c3aed ${deg}deg, #e2e8f0 ${deg}deg)`,
    };
  }, [stats?.avgAccuracy]);

  return (
    <ToolShell
      title="我的学情"
      description="练习正确率、完成进度与口语表现一览，方便直观了解当前学习状态。"
      eyebrow="学情 · My Insights"
    >
      {loading ? (
        <ToolCard>
          <p className="text-sm text-slate-400">正在汇总学情…</p>
        </ToolCard>
      ) : null}

      <ToolCard>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="mx-auto flex shrink-0 flex-col items-center sm:mx-0">
            <div
              className="relative flex h-32 w-32 items-center justify-center rounded-full"
              style={ringStyle}
            >
              <div className="flex h-[6.5rem] w-[6.5rem] flex-col items-center justify-center rounded-full bg-white dark:bg-slate-900">
                <span className="text-xs text-slate-400">平均正确率</span>
                <span className="text-2xl font-bold text-violet-700">
                  {pct(stats?.avgAccuracy ?? 0)}
                </span>
              </div>
            </div>
            <p className="mt-3 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
              {stats?.level || '尚未练习'}
            </p>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-slate-50">近期正确率走势</h2>
              <span className="text-xs text-slate-400">
                最近 {stats?.recentAccuracies?.length || 0} 次
              </span>
            </div>
            <Sparkline values={stats?.recentAccuracies ?? []} />
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Link
                href="/tools/practice"
                className="rounded-full bg-violet-600 px-3 py-1.5 font-semibold text-white"
              >
                去练习
              </Link>
              <Link
                href="/tools/check-in"
                className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10"
              >
                去打卡
              </Link>
              <Link
                href="/tools/oral"
                className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10"
              >
                去口语
              </Link>
              <Link
                href="/tools/lessons"
                className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10"
              >
                看教案
              </Link>
            </div>
          </div>
        </div>
      </ToolCard>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<ClipboardList className="h-4 w-4" />}
          label="已交练习"
          value={`${stats?.completed ?? 0}`}
          hint={
            stats?.availableTotal
              ? `可做 ${stats.availableTotal} 份 · 待完成 ${stats.pending}`
              : '完成练习后更新'
          }
        />
        <StatTile
          icon={<Trophy className="h-4 w-4" />}
          label="最高正确率"
          value={pct(stats?.bestAccuracy ?? 0)}
          hint="单次练习最好成绩"
        />
        <StatTile
          icon={<CalendarCheck className="h-4 w-4" />}
          label="连续打卡"
          value={`${checkin?.streakDays ?? stats?.streakDays ?? 0} 天`}
          hint={
            checkin?.checkedInToday || stats?.checkedInToday
              ? `今日 ${checkin?.todayDone ?? 0}/${checkin?.todayTotal ?? 0}`
              : '今日尚未打卡'
          }
        />
        <StatTile
          icon={<Target className="h-4 w-4" />}
          label="计划完成"
          value={pct(checkin?.planCompletion ?? stats?.planCompletion ?? 0)}
          hint={
            checkin?.hasActivePlan ? checkin.planTitle || '进行中的学习计划' : '去打卡页制定计划'
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
        <StatTile
          icon={<Mic2 className="h-4 w-4" />}
          label="口语均分"
          value={stats?.oralCount ? `${Math.round(stats.oralAvg)}` : '—'}
          hint={stats?.oralCount ? `共 ${stats.oralCount} 次练习` : '还没有口语记录'}
        />
        <Link
          href="/tools/lessons"
          className="block rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-violet-50/60 p-4 transition hover:border-violet-200 dark:border-white/10 dark:from-slate-900 dark:to-violet-950/20"
        >
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <BookOpen className="h-4 w-4 text-violet-600" />
            共享教案
          </p>
          <p className="mt-2 text-2xl font-bold text-violet-700">{stats?.lessonShared ?? 0}</p>
          <p className="mt-1 text-xs text-violet-600">点击查看老师共享的教案 →</p>
        </Link>
      </div>

      <ToolCard>
        <div className="mb-4 flex items-center gap-2">
          <Target className="h-4 w-4 text-violet-600" />
          <h2 className="font-semibold">练习完成进度</h2>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all"
            style={{
              width: stats?.availableTotal
                ? `${Math.min(100, ((stats.completed || 0) / stats.availableTotal) * 100)}%`
                : stats?.completed
                  ? '100%'
                  : '0%',
            }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {stats?.availableTotal
            ? `已完成 ${stats.completed}/${stats.availableTotal} 份已发布练习`
            : stats?.completed
              ? `已完成 ${stats.completed} 次交卷`
              : '暂无已发布练习'}
        </p>
      </ToolCard>

      <ToolCard>
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-violet-600" />
          <h2 className="font-semibold">练习明细</h2>
        </div>
        <ul className="space-y-3 text-sm">
          {quizzes.map((q, i) => {
            const rate = Number(q.max_score) > 0 ? Number(q.score) / Number(q.max_score) : 0;
            return (
              <li
                key={i}
                className="rounded-2xl border border-slate-100 px-4 py-3 dark:border-white/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-50">{q.title}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {formatDay(q.created_at)}
                      {q.difficulty ? ` · ${q.difficulty}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-violet-700">
                    {q.score}/{q.max_score}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <div className="h-full rounded-full bg-violet-500" style={{ width: pct(rate) }} />
                </div>
                {q.feedback ? (
                  <p className="mt-2 text-xs leading-5 text-slate-500">{q.feedback}</p>
                ) : null}
              </li>
            );
          })}
          {!quizzes.length ? (
            <li className="text-slate-400">暂无练习记录，去「我的练习」做一套吧</li>
          ) : null}
        </ul>
      </ToolCard>

      <ToolCard>
        <div className="mb-3 flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-violet-600" />
          <h2 className="font-semibold">近期打卡</h2>
        </div>
        <ul className="space-y-2 text-sm">
          {(checkin?.recentLogs ?? []).slice(0, 8).map((log, i) => (
            <li
              key={`${log.checkin_date}-${log.source_kind}-${i}`}
              className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 dark:border-white/10"
            >
              <span>
                <span className="font-medium">
                  {log.source_kind === 'teacher_task' ? '教师任务' : '计划目标'}
                </span>
                <span className="mt-0.5 block text-xs text-slate-400">
                  {formatDay(log.checkin_date)}
                  {log.note ? ` · ${log.note}` : ''}
                </span>
              </span>
              <span className="text-xs font-semibold text-emerald-600">已打卡</span>
            </li>
          ))}
          {!checkin?.recentLogs?.length ? (
            <li className="text-slate-400">暂无打卡记录，去「每日打卡」完成今日目标吧</li>
          ) : null}
        </ul>
      </ToolCard>

      <ToolCard>
        <div className="mb-3 flex items-center gap-2">
          <Mic2 className="h-4 w-4 text-violet-600" />
          <h2 className="font-semibold">口语记录</h2>
        </div>
        <ul className="space-y-2 text-sm">
          {oral.map((o, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 dark:border-white/10"
            >
              <span>
                <span className="font-medium">{o.scene}</span>
                <span className="mt-0.5 block text-xs text-slate-400">
                  {formatDay(o.created_at)}
                  {o.feedback ? ` · ${o.feedback}` : ''}
                </span>
              </span>
              <span className="font-semibold text-violet-700">{o.score} 分</span>
            </li>
          ))}
          {!oral.length ? <li className="text-slate-400">暂无口语记录</li> : null}
        </ul>
      </ToolCard>
    </ToolShell>
  );
}

export function AdminOverviewTool() {
  const [overview, setOverview] = useState<Record<string, number> | null>(null);
  const [alerts, setAlerts] = useState<
    Array<{ display_name: string; accuracy: number; attempts: number; reason: string }>
  >([]);

  useEffect(() => {
    void fetch('/api/campus/tools/insights')
      .then((r) => r.json())
      .then((d) => {
        setOverview(d.overview ?? null);
        setAlerts(d.alerts ?? []);
      });
  }, []);

  return (
    <ToolShell
      title="学情总览"
      description="跨班练习与口语汇总（行政视角）。"
      eyebrow="行政 · Overview"
    >
      <ToolCard>
        {overview ? (
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5">
              练习卷 {overview.quizzes}
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5">
              提交 {overview.submissions}
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5">
              均分 {Number(overview.avg_score).toFixed(1)}
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5">
              口语 {overview.oral_sessions}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">加载中…</p>
        )}
      </ToolCard>
      <ToolCard>
        <h2 className="mb-3 font-semibold">预警摘录</h2>
        <ul className="space-y-2 text-sm">
          {alerts.slice(0, 10).map((a, i) => (
            <li key={i}>
              {a.display_name} · 正确率 {(Number(a.accuracy || 0) * 100).toFixed(0)}% · {a.reason}
            </li>
          ))}
          {!alerts.length ? <li className="text-slate-400">暂无预警</li> : null}
        </ul>
      </ToolCard>
    </ToolShell>
  );
}

export function AlertsTool() {
  const [records, setRecords] = useState<
    Array<{ display_name: string; accuracy: number; attempts: number; reason: string }>
  >([]);

  useEffect(() => {
    void fetch('/api/campus/tools/insights?view=alerts')
      .then((r) => r.json())
      .then((d) => setRecords(d.records ?? []));
  }, []);

  return (
    <ToolShell
      title="学业预警"
      description="按练习正确率规则标红，供行政与教师关注。"
      eyebrow="预警 · Alerts"
    >
      <ToolCard>
        <ul className="space-y-2 text-sm">
          {records.map((a, i) => (
            <li
              key={i}
              className="rounded-xl border border-red-100 bg-red-50/60 px-3 py-2 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"
            >
              {a.display_name} · 尝试 {a.attempts} · 正确率{' '}
              {(Number(a.accuracy || 0) * 100).toFixed(0)}% · {a.reason}
            </li>
          ))}
          {!records.length ? <li className="text-slate-400">暂无预警学生</li> : null}
        </ul>
      </ToolCard>
    </ToolShell>
  );
}
