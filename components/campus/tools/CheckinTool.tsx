'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Loader2,
  Paperclip,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { PrimaryButton, ToolCard, ToolShell } from '@/components/campus/tools/ToolShell';

const fieldClass =
  'w-full rounded-2xl border border-slate-200/90 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-500/15 dark:border-white/10 dark:bg-slate-950';

interface EvidenceFile {
  id: string;
  name: string;
  mime: string;
  size: number;
}

interface CheckinTarget {
  sourceKind: 'teacher_task' | 'plan_item';
  sourceId: string;
  title: string;
  body: string;
  meta: string;
  done: boolean;
  logId?: string | null;
  note?: string;
  evidence?: EvidenceFile[];
  short?: string;
}

interface ActivePlan {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  items: Array<{ id: string; title: string; ord: number; schedule_date?: string | null }>;
}

interface CalDay {
  date: string;
  day: number;
  total: number;
  done: number;
  complete: boolean;
  shorts: Array<{ kind: string; text: string; done: boolean }>;
  more: number;
}

interface TeacherTask {
  id: string;
  title: string;
  body: string;
  start_date: string;
  end_date: string;
  published: boolean;
  today_done_students?: number;
}

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function plusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthKeyFromDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(yearMonth: string, delta: number) {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKeyFromDate(d);
}

function looksGarbled(text: string) {
  return /^[\?\s·.]+$/.test(String(text || '').trim());
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return FileImage;
  if (mime.startsWith('audio/')) return FileAudio;
  if (mime.startsWith('video/')) return FileVideo;
  return FileText;
}

export function CheckinTool({ role }: { role: 'teacher' | 'student' }) {
  if (role === 'teacher') return <TeacherCheckinPanel />;
  return <StudentCheckinPanel />;
}

function StudentCheckinPanel() {
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [yearMonth, setYearMonth] = useState(monthKeyFromDate());
  const [calDays, setCalDays] = useState<CalDay[]>([]);
  const [streakDays, setStreakDays] = useState(0);
  const [planCompletion, setPlanCompletion] = useState(0);
  const [activePlan, setActivePlan] = useState<ActivePlan | null>(null);
  const [todayYmd, setTodayYmd] = useState(todayInputValue());

  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [dayModalDate, setDayModalDate] = useState<string | null>(null);
  const [dayTargets, setDayTargets] = useState<CheckinTarget[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [canCheckin, setCanCheckin] = useState(true);

  const [planTitle, setPlanTitle] = useState('我的一周学习计划');
  const [planStart, setPlanStart] = useState(todayInputValue());
  const [planEnd, setPlanEnd] = useState(plusDays(6));
  const [planItemsText, setPlanItemsText] = useState('');

  const loadMonth = useCallback(async () => {
    setLoading(true);
    try {
      const [monthRes, todayRes] = await Promise.all([
        fetch(`/api/campus/tools/checkin?month=${yearMonth}`, { cache: 'no-store' }),
        fetch('/api/campus/tools/checkin', { cache: 'no-store' }),
      ]);
      const monthData = await monthRes.json();
      const todayData = await todayRes.json();
      if (!monthRes.ok) throw new Error(monthData.error || '月历加载失败');
      if (!todayRes.ok) throw new Error(todayData.error || '加载失败');
      setCalDays(monthData.days ?? []);
      setActivePlan(monthData.activePlan ?? todayData.activePlan ?? null);
      setTodayYmd(monthData.today || todayData.today || todayInputValue());
      setStreakDays(Number(todayData.streakDays || 0));
      setPlanCompletion(Number(todayData.planCompletion || 0));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  const monthLabel = useMemo(() => {
    const [y, m] = yearMonth.split('-');
    return `${y}年${Number(m)}月`;
  }, [yearMonth]);

  const firstWeekday = useMemo(() => {
    const [y, m] = yearMonth.split('-').map(Number);
    return new Date(y, m - 1, 1).getDay(); // 0 Sun
  }, [yearMonth]);

  async function openDay(date: string) {
    setDayModalDate(date);
    setDayLoading(true);
    try {
      const res = await fetch(`/api/campus/tools/checkin?date=${date}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '当日任务加载失败');
      setDayTargets(data.targets ?? []);
      setCanCheckin(Boolean(data.canCheckin));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
      setDayModalDate(null);
    } finally {
      setDayLoading(false);
    }
  }

  function openPlanModal() {
    setPlanTitle(
      activePlan?.title && !looksGarbled(activePlan.title) ? activePlan.title : '我的一周学习计划',
    );
    setPlanStart(todayInputValue());
    setPlanEnd(plusDays(13));
    setPlanItemsText(
      '提示：可写「每日 背单词」贯穿整段时间；或「2026-09-26 做一套练习」指定某一天。\n',
    );
    setPlanModalOpen(true);
  }

  async function draftPlan() {
    setPending(true);
    try {
      const res = await fetch('/api/campus/tools/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          action: 'plan_draft',
          draftHint: planTitle || '一周学习计划',
          startDate: planStart,
          endDate: planEnd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '生成失败');
      setPlanItemsText(((data.items as string[]) || []).join('\n'));
      toast.success('已生成按日计划草稿');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败');
    } finally {
      setPending(false);
    }
  }

  async function savePlan() {
    const items = planItemsText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('提示：'));
    if (!items.length) {
      toast.error('请至少写一条计划目标');
      return;
    }
    setPending(true);
    try {
      const res = await fetch('/api/campus/tools/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          action: 'create_plan',
          title: planTitle,
          startDate: planStart,
          endDate: planEnd,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      toast.success('学习计划已启用');
      setPlanModalOpen(false);
      await loadMonth();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setPending(false);
    }
  }

  async function submitDayCheckin(
    target: CheckinTarget,
    note: string,
    files: File[],
  ) {
    if (!dayModalDate) return;
    if (!canCheckin) {
      toast.message('未来日期不可打卡');
      return;
    }
    setPending(true);
    try {
      const form = new FormData();
      form.set('action', 'checkin');
      form.set('sourceKind', target.sourceKind);
      form.set('sourceId', target.sourceId);
      form.set('note', note);
      form.set('checkinDate', dayModalDate);
      for (const f of files) form.append('files', f);
      const res = await fetch('/api/campus/tools/checkin', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '打卡失败');
      toast.success(files.length ? '已打卡并上传附件' : '已打卡');
      setDayTargets(data.day?.targets ?? []);
      await loadMonth();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '打卡失败');
    } finally {
      setPending(false);
    }
  }

  const blanks = Array.from({ length: firstWeekday }, (_, i) => i);

  return (
    <ToolShell title="每日打卡" description="月历安排长短期目标；点开当日完成打卡并可上传证明材料。">
      {loading ? (
        <ToolCard>
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
            加载月历…
          </p>
        </ToolCard>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-3">
          <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-violet-50/60 px-4 py-3 ">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              连续打卡
            </p>
            <p className="mt-1 text-2xl font-semibold text-violet-700">{streakDays} 天</p>
          </div>
          <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-violet-50/60 px-4 py-3 ">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              计划完成
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-800">
              {Math.round(planCompletion * 100)}%
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openPlanModal}
          className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-500"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {activePlan ? '调整计划' : '制定计划'}
        </button>
      </div>

      <section className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
          <button
            type="button"
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-white/10"
            onClick={() => setYearMonth((m) => shiftMonth(m, -1))}
            aria-label="上个月"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <h2 className="text-xl font-semibold tracking-wide text-slate-900 dark:text-slate-50">
              {monthLabel}
            </h2>
            {activePlan ? (
              <p className="mt-0.5 text-xs text-slate-500">
                {looksGarbled(activePlan.title) ? '进行中的学习计划' : activePlan.title}
                <span className="mx-1 text-slate-300">·</span>
                {String(activePlan.start_date).slice(0, 10)} ~{' '}
                {String(activePlan.end_date).slice(0, 10)}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-amber-700">还没有计划，点右上角制定</p>
            )}
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-white/10"
            onClick={() => setYearMonth((m) => shiftMonth(m, 1))}
            aria-label="下个月"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-px bg-slate-100 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:bg-white/10">
          {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
            <div key={w} className="bg-white py-2 dark:bg-slate-900">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-slate-100 dark:bg-white/10">
          {blanks.map((i) => (
            <div key={`b-${i}`} className="min-h-[92px] bg-slate-50/dark:bg-slate-950/40" />
          ))}
          {calDays.map((d) => {
            const isToday = d.date === todayYmd;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => void openDay(d.date)}
                className={`group min-h-[92px] bg-white p-1.5 text-left transition hover:bg-violet-50/80 dark:bg-slate-900 dark:hover:bg-violet-500/10 ${
                  isToday ? 'ring-2 ring-inset ring-violet-500/40' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      isToday
                        ? 'bg-violet-600 text-white'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {d.day}
                  </span>
                  {d.complete ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-violet-600" />
                  ) : d.total > 0 ? (
                    <span className="text-[10px] text-slate-400">
                      {d.done}/{d.total}
                    </span>
                  ) : null}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {d.shorts.map((s, idx) => (
                    <li
                      key={`${d.date}-${idx}`}
                      className={`truncate rounded px-1 py-[1px] text-[10px] leading-4 ${
                        s.kind === 'teacher_task'
                          ? 'bg-amber-100/80 text-amber-900'
                          : 'bg-violet-100/80 text-violet-800'
                      } ${s.done ? 'line-through opacity-60' : ''}`}
                    >
                      {s.text}
                    </li>
                  ))}
                  {d.more > 0 ? (
                    <li className="px-1 text-[10px] text-slate-400">+{d.more}</li>
                  ) : null}
                </ul>
              </button>
            );
          })}
        </div>
      </section>

      {dayModalDate ? (
        <DayCheckinModal
          date={dayModalDate}
          loading={dayLoading}
          targets={dayTargets}
          canCheckin={canCheckin}
          pending={pending}
          onClose={() => setDayModalDate(null)}
          onSubmit={(t, note, files) => void submitDayCheckin(t, note, files)}
        />
      ) : null}

      {planModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => setPlanModalOpen(false)}
        >
          <div
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-slate-200/90 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-600" />
                <h2 className="text-lg font-semibold">制定学习计划</h2>
              </div>
              <button
                type="button"
                aria-label="关闭"
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
                onClick={() => setPlanModalOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              className={fieldClass}
              placeholder="计划标题"
              value={planTitle}
              onChange={(e) => setPlanTitle(e.target.value)}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-500">
                开始日期
                <input
                  type="date"
                  className={`${fieldClass} mt-1`}
                  value={planStart}
                  onChange={(e) => setPlanStart(e.target.value)}
                />
              </label>
              <label className="text-xs text-slate-500">
                结束日期
                <input
                  type="date"
                  className={`${fieldClass} mt-1`}
                  value={planEnd}
                  onChange={(e) => setPlanEnd(e.target.value)}
                />
              </label>
            </div>
            <textarea
              className={`${fieldClass} mt-3 min-h-40 font-mono text-[13px]`}
              placeholder={'每日 背 20 个单词\n2026-09-26 完成一套练习\n2026-09-27 整理错题本'}
              value={planItemsText}
              onChange={(e) => setPlanItemsText(e.target.value)}
            />
            <p className="mt-2 text-xs leading-5 text-slate-500">
              「每日 …」会出现在计划期内每一天；「日期 + 事项」只出现在指定那天。
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <PrimaryButton pending={pending} onClick={() => void draftPlan()}>
                AI 生成周计划
              </PrimaryButton>
              <PrimaryButton pending={pending} onClick={() => void savePlan()}>
                保存并启用计划
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </ToolShell>
  );
}

function DayCheckinModal({
  date,
  loading,
  targets,
  canCheckin,
  pending,
  onClose,
  onSubmit,
}: {
  date: string;
  loading: boolean;
  targets: CheckinTarget[];
  canCheckin: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (t: CheckinTarget, note: string, files: File[]) => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File[]>>({});

  function keyOf(t: CheckinTarget) {
    return `${t.sourceKind}:${t.sourceId}`;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[28px] border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur dark:border-white/10 dark:bg-slate-900/95">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              当日打卡
            </p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-50">
              <CalendarCheck className="h-5 w-5 text-violet-600" />
              {date}
            </h2>
          </div>
          <button
            type="button"
            aria-label="关闭"
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载当日任务…
            </p>
          ) : null}

          {!loading && !targets.length ? (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
              这一天没有安排。可以调整计划，给当天加上具体事项。
            </p>
          ) : null}

          {targets.map((t) => {
            const k = keyOf(t);
            const title = looksGarbled(t.title)
              ? t.sourceKind === 'teacher_task'
                ? '教师打卡任务'
                : '计划目标'
              : t.title;
            const selected = files[k] || [];
            const Icon = Paperclip;
            return (
              <article
                key={k}
                className="rounded-2xl border border-slate-100 bg-white/80 p-4 dark:border-white/10 dark:bg-slate-950/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {t.sourceKind === 'teacher_task' ? '教师任务' : '计划事项'}
                    </p>
                    <h3 className="mt-1 font-medium text-slate-900 dark:text-slate-50">{title}</h3>
                    {t.body && !looksGarbled(t.body) ? (
                      <p className="mt-1 text-xs text-slate-500">{t.body}</p>
                    ) : null}
                  </div>
                  {t.done ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      已完成
                    </span>
                  ) : null}
                </div>

                <textarea
                  className={`${fieldClass} mt-3 min-h-16`}
                  placeholder="备注（可选）"
                  value={notes[k] ?? t.note ?? ''}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [k]: e.target.value }))}
                  disabled={!canCheckin}
                />

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-violet-300 hover:text-violet-700">
                    <Upload className="h-3.5 w-3.5" />
                    上传证明
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept="image/*,audio/*,video/*,.pdf,.txt,.doc,.docx,.ppt,.pptx,text/*"
                      disabled={!canCheckin || pending}
                      onChange={(e) => {
                        const list = Array.from(e.target.files || []).slice(0, 6);
                        setFiles((prev) => ({ ...prev, [k]: list }));
                      }}
                    />
                  </label>
                  {selected.map((f) => {
                    const FIcon = fileIcon(f.type);
                    return (
                      <span
                        key={f.name + f.size}
                        className="inline-flex max-w-[160px] items-center gap-1 truncate rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600"
                      >
                        <FIcon className="h-3 w-3 shrink-0" />
                        {f.name}
                      </span>
                    );
                  })}
                </div>

                {t.evidence?.length ? (
                  <ul className="mt-3 space-y-1">
                    {t.evidence.map((ev) => {
                      const FIcon = fileIcon(ev.mime);
                      return (
                        <li key={ev.id}>
                          <a
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 hover:underline"
                            href={`/api/campus/tools/checkin/file?logId=${encodeURIComponent(String(t.logId || ''))}&fileId=${encodeURIComponent(ev.id)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FIcon className="h-3.5 w-3.5" />
                            {ev.name}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                <div className="mt-3 flex justify-end">
                  <PrimaryButton
                    pending={pending}
                    disabled={!canCheckin}
                    onClick={() =>
                      onSubmit(t, notes[k] ?? t.note ?? '', selected)
                    }
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      {t.done ? '补充附件' : '完成打卡'}
                    </span>
                  </PrimaryButton>
                </div>
              </article>
            );
          })}

          {!canCheckin ? (
            <p className="text-center text-xs text-slate-400">未来日期仅可预览，不能打卡。</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TeacherCheckinPanel() {
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [tasks, setTasks] = useState<TeacherTask[]>([]);
  const [overview, setOverview] = useState<{
    student_total: number;
    checked_today: number;
    checkin_today_rate: number;
    task_total: number;
  } | null>(null);
  const [students, setStudents] = useState<
    Array<{
      student_id: string;
      student_name: string;
      checkin_days: number;
      checked_in_today: boolean;
      plan_completion: number;
      has_active_plan: boolean;
    }>
  >([]);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [startDate, setStartDate] = useState(todayInputValue());
  const [endDate, setEndDate] = useState(plusDays(14));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/campus/tools/checkin', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setTasks(data.tasks ?? []);
      setOverview(data.overview ?? null);
      setStudents(data.students ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish() {
    if (!title.trim()) {
      toast.error('请填写打卡标题');
      return;
    }
    setPending(true);
    try {
      const res = await fetch('/api/campus/tools/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          action: 'create_task',
          title,
          body,
          startDate,
          endDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '发布失败');
      toast.success('打卡任务已发布，学生可见');
      setTitle('');
      setBody('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发布失败');
    } finally {
      setPending(false);
    }
  }

  async function unpublish(taskId: string) {
    setPending(true);
    try {
      const res = await fetch('/api/campus/tools/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ action: 'unpublish_task', taskId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '退回失败');
      toast.success('已退回该打卡任务');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '退回失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <ToolShell
      title="每日打卡"
      description="发布打卡内容供学生完成；班级打卡率与计划完成情况会进入学情看板。"
    >
      {loading ? (
        <ToolCard>
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            加载中…
          </p>
        </ToolCard>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-violet-50/60 p-4 dark:border-white/10">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            今日打卡率
          </p>
          <p className="mt-2 text-2xl font-bold text-violet-700">
            {Math.round(Number(overview?.checkin_today_rate || 0) * 100)}%
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {overview?.checked_today ?? 0}/{overview?.student_total ?? 0} 人
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-violet-50/60 p-4 dark:border-white/10">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            进行中任务
          </p>
          <p className="mt-2 text-2xl font-bold">{overview?.task_total ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-violet-50/60 p-4 dark:border-white/10">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            关联学生
          </p>
          <p className="mt-2 text-2xl font-bold">{overview?.student_total ?? 0}</p>
        </div>
      </div>

      <ToolCard>
        <h2 className="mb-3 font-semibold">发布打卡任务</h2>
        <input
          className={fieldClass}
          placeholder="标题，如：每日背单词 20 个"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className={`${fieldClass} mt-3 min-h-24`}
          placeholder="说明（可选）"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500">
            开始日期
            <input
              type="date"
              className={`${fieldClass} mt-1`}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-500">
            结束日期
            <input
              type="date"
              className={`${fieldClass} mt-1`}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-3">
          <PrimaryButton pending={pending} onClick={() => void publish()}>
            发布打卡
          </PrimaryButton>
        </div>
      </ToolCard>

      <ToolCard>
        <h2 className="mb-3 font-semibold">我发布的任务</h2>
        <ul className="space-y-2 text-sm">
          {tasks.map((t) => {
            const taskTitle = looksGarbled(t.title) ? '打卡任务（请重新发布）' : t.title;
            const taskBody = looksGarbled(t.body || '') ? '' : t.body;
            return (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-3 dark:border-white/10"
              >
                <div>
                  <p className="font-medium">
                    {taskTitle}
                    {!t.published ? (
                      <span className="ml-2 text-xs text-slate-400">（已退回）</span>
                    ) : (
                      <span className="ml-2 text-xs text-emerald-600">
                        今日 {t.today_done_students ?? 0} 人
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {String(t.start_date).slice(0, 10)} ~ {String(t.end_date).slice(0, 10)}
                    {taskBody ? ` · ${taskBody.slice(0, 40)}` : ''}
                  </p>
                </div>
                {t.published ? (
                  <button
                    type="button"
                    className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600"
                    onClick={() => void unpublish(t.id)}
                  >
                    退回
                  </button>
                ) : null}
              </li>
            );
          })}
          {!tasks.length ? <li className="text-slate-400">暂无打卡任务</li> : null}
        </ul>
      </ToolCard>

      <ToolCard>
        <h2 className="mb-3 font-semibold">学生打卡概况</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400">
                <th className="pb-2 pr-3">学生</th>
                <th className="pb-2 pr-3">今日</th>
                <th className="pb-2 pr-3">累计天数</th>
                <th className="pb-2">计划完成</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.student_id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 pr-3 font-medium">{s.student_name}</td>
                  <td className="py-2 pr-3">
                    {s.checked_in_today ? (
                      <span className="text-emerald-600">已打</span>
                    ) : (
                      <span className="text-slate-400">未打</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{s.checkin_days}</td>
                  <td className="py-2">
                    {s.has_active_plan
                      ? `${Math.round(s.plan_completion * 100)}%`
                      : '无计划'}
                  </td>
                </tr>
              ))}
              {!students.length ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    暂无关联学生
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ToolCard>
    </ToolShell>
  );
}
