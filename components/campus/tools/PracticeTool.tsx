'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Grid3X3, X } from 'lucide-react';
import { toast } from 'sonner';

import {
  EmptyHint,
  PrimaryButton,
  SectionTitle,
  ToolCard,
  ToolShell,
} from '@/components/campus/tools/ToolShell';

interface QuizListItem {
  id: string;
  title: string;
  teacher_name?: string;
  question_count?: number;
  submission_id?: string;
  score?: number;
  max_score?: number;
  redo_status?: string;
  redo_note?: string;
}

export function PracticeTool() {
  const router = useRouter();
  const [records, setRecords] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const reload = useCallback(async () => {
    const res = await fetch('/api/campus/tools/quizzes', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '加载失败');
    setRecords(data.records ?? []);
  }, []);

  useEffect(() => {
    void reload()
      .catch((e) => toast.error(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [reload]);

  async function requestRedo(quizId: string) {
    setBusyId(quizId);
    try {
      const res = await fetch('/api/campus/tools/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_redo', quizId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '申请失败');
      toast.success('已申请重做，等待老师审批');
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '申请失败');
    } finally {
      setBusyId('');
    }
  }

  return (
    <ToolShell
      title="我的练习"
      description="点练习进入做题。已交卷若要重做，请点「申请重做」，经老师同意后方可再答。"
      eyebrow="练习 · Practice"
    >
      <ToolCard>
        <SectionTitle title="已发布练习" hint="未交卷可直接进入；已交卷需老师批准后重做。" />
        {loading ? <p className="text-sm text-slate-400">加载中…</p> : null}
        <ul className="space-y-2 text-sm">
          {records.map((r) => {
            const submitted = Boolean(r.submission_id);
            const redo = r.redo_status || 'none';
            return (
              <li key={r.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  disabled={busyId === r.id}
                  className="min-w-0 flex-1 rounded-2xl border border-slate-100 px-4 py-3.5 text-left transition hover:border-violet-200 hover:bg-violet-50/50 dark:border-white/10 dark:hover:bg-violet-500/10"
                  onClick={() => router.push(`/tools/practice/${encodeURIComponent(r.id)}`)}
                >
                  <span className="font-medium text-slate-900 dark:text-slate-50">{r.title}</span>
                  <span className="mt-1 block text-slate-500">
                    {r.teacher_name || '老师'} · {r.question_count ?? 0} 题
                    {submitted
                      ? ` · 已交 ${r.score ?? '-'}/${r.max_score ?? '-'}`
                      : ' · 未交 · 点击开始'}
                    {redo === 'pending' ? ' · 重做申请审核中' : ''}
                    {redo === 'rejected'
                      ? ` · 重做未通过${r.redo_note ? `（${r.redo_note}）` : ''}`
                      : ''}
                  </span>
                </button>
                {submitted && redo !== 'pending' ? (
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void requestRedo(r.id)}
                    className="shrink-0 rounded-2xl border border-violet-200 bg-violet-50 px-3 text-xs font-semibold text-violet-700 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300"
                  >
                    申请重做
                  </button>
                ) : null}
                {submitted && redo === 'pending' ? (
                  <span className="flex shrink-0 items-center rounded-2xl border border-slate-200 px-3 text-xs font-semibold text-slate-500 dark:border-white/10">
                    审核中
                  </span>
                ) : null}
              </li>
            );
          })}
          {!loading && !records.length ? <EmptyHint>暂无已发布练习</EmptyHint> : null}
        </ul>
      </ToolCard>
    </ToolShell>
  );
}

interface Question {
  id: string;
  prompt: string;
  qtype: string;
  options?: string[];
}

const JUDGE_OPTIONS = ['对', '错'] as const;

function typeLabel(qtype: string) {
  const t = String(qtype || '').toLowerCase();
  if (t === 'choice' || t.includes('choice') || t.includes('选')) return '选择题';
  if (t === 'judge' || t.includes('judge') || t.includes('判断')) return '判断题';
  if (t === 'open' || t.includes('open') || t.includes('开放')) return '开放简答';
  if (t === 'short' || t.includes('short') || t.includes('简') || t.includes('填'))
    return '唯一解简答';
  return '题目';
}

function optionList(q: Question): string[] {
  if (q.qtype === 'judge') return [...JUDGE_OPTIONS];
  if (q.qtype === 'open' || q.qtype === 'short') return [];
  return q.options?.length ? q.options : [];
}

export function PracticeSession({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [slideDir, setSlideDir] = useState<'next' | 'prev' | 'none'>('none');
  const [animKey, setAnimKey] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    maxScore: number;
    feedback: string[];
  } | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/campus/tools/quizzes?id=${encodeURIComponent(quizId)}`, {
          cache: 'no-store',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '练习加载失败');
        setTitle(data.quiz?.title || '练习');
        setQuestions(data.quiz?.questions ?? []);
        setIndex(0);
        setAnswers({});
        setResult(null);
        setFinished(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '练习加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [quizId]);

  const total = questions.length;
  const current = questions[index];
  const answeredCount = useMemo(
    () => questions.filter((q) => (answers[q.id] ?? '').trim()).length,
    [questions, answers],
  );

  const goTo = useCallback(
    (next: number, dir: 'next' | 'prev') => {
      if (next < 0 || next >= total) return;
      setSlideDir(dir);
      setAnimKey((k) => k + 1);
      setIndex(next);
      setSheetOpen(false);
    },
    [total],
  );

  const answerAndMaybeAdvance = useCallback(
    (qid: string, value: string, autoNext: boolean) => {
      setAnswers((a) => ({ ...a, [qid]: value }));
      if (!autoNext) return;
      window.setTimeout(() => {
        if (index < total - 1) {
          goTo(index + 1, 'next');
        } else {
          setFinished(true);
          setSlideDir('next');
          setAnimKey((k) => k + 1);
        }
      }, 280);
    },
    [goTo, index, total],
  );

  async function submit() {
    const unanswered = questions.filter((q) => !(answers[q.id] ?? '').trim());
    if (unanswered.length) {
      toast.error(`还有 ${unanswered.length} 题未作答，可打开答题卡补答`);
      setSheetOpen(true);
      return;
    }
    setPending(true);
    try {
      const res = await fetch('/api/campus/tools/quizzes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId, action: 'submit', answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '交卷失败');
      setResult({ score: data.score, maxScore: data.maxScore, feedback: data.feedback || [] });
      setFinished(true);
      toast.success(`得分 ${data.score}/${data.maxScore}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '交卷失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f7fb] text-slate-950 dark:bg-[#071023] dark:text-slate-50">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,_rgba(139,92,246,0.14),_transparent_60%)]"
      />

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-7">
        {/* Top bar */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push('/tools/practice')}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-600 shadow-sm transition hover:border-violet-200 hover:text-violet-600 dark:border-white/10 dark:bg-slate-900/80"
          >
            <ArrowLeft className="h-4 w-4" />
            练习列表
          </button>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3.5 py-2 text-sm font-semibold text-violet-700 shadow-sm transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300"
          >
            <Grid3X3 className="h-4 w-4" />
            答题卡
            <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] text-white">
              {answeredCount}/{total || 0}
            </span>
          </button>
        </div>

        <header className="mb-5 rounded-[24px] border border-violet-200/50 bg-gradient-to-br from-violet-600 to-indigo-600 px-5 py-4 text-white shadow-lg shadow-violet-600/20">
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">{title || '做题中'}</h1>
          <p className="mt-1 text-xs text-violet-100/90">
            {loading
              ? '加载题目…'
              : finished
                ? result
                  ? `已交卷 · ${result.score}/${result.maxScore}`
                  : '已答完，请交卷'
                : `第 ${Math.min(index + 1, total)} / ${total} 题 · 答完自动进入下一题`}
          </p>
          {!loading && total > 0 ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-all duration-300"
                style={{
                  width: `${(Math.min(answeredCount, total) / total) * 100}%`,
                }}
              />
            </div>
          ) : null}
        </header>

        <div className="relative flex-1 overflow-hidden">
          {loading ? (
            <ToolCard>
              <p className="text-sm text-slate-400">正在进入做题页…</p>
            </ToolCard>
          ) : finished ? (
            <div
              key={`done-${animKey}`}
              className="animate-[practice-slide-in_0.32s_ease-out]"
            >
              <ToolCard>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                  {result ? '交卷结果' : '全部题目已答完'}
                </h2>
                {result ? (
                  <p className="mt-3 text-sm leading-7 text-violet-700">
                    得分 {result.score}/{result.maxScore}
                    {result.feedback?.length
                      ? ` · ${result.feedback.join('；')}`
                      : ' · 全部正确'}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    已完成 {answeredCount}/{total} 题。可打开答题卡检查后交卷。
                  </p>
                )}
                <div className="mt-6 flex flex-wrap gap-3">
                  {!result ? (
                    <PrimaryButton pending={pending} onClick={() => void submit()}>
                      交卷
                    </PrimaryButton>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setFinished(false);
                      goTo(0, 'prev');
                    }}
                    className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:border-white/10"
                  >
                    回到第 1 题
                  </button>
                  <button
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10"
                  >
                    打开答题卡
                  </button>
                  {result ? (
                    <button
                      type="button"
                      onClick={() => router.push('/tools/practice')}
                      className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:border-white/10"
                    >
                      返回列表
                    </button>
                  ) : null}
                </div>
              </ToolCard>
            </div>
          ) : current ? (
            <div
              key={`${current.id}-${animKey}`}
              className={
                slideDir === 'next'
                  ? 'animate-[practice-slide-in_0.32s_ease-out]'
                  : slideDir === 'prev'
                    ? 'animate-[practice-slide-in-left_0.32s_ease-out]'
                    : undefined
              }
            >
              <ToolCard>
                <p className="text-sm font-medium leading-7 text-slate-800 dark:text-slate-100">
                  <span className="mr-2 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                    {typeLabel(current.qtype)}
                  </span>
                  {index + 1}. {current.prompt}
                </p>

                {current.qtype === 'judge' ? (
                  <div className="mt-5 flex gap-3">
                    {JUDGE_OPTIONS.map((o) => {
                      const selected = answers[current.id] === o;
                      return (
                        <button
                          key={o}
                          type="button"
                          onClick={() => answerAndMaybeAdvance(current.id, o, true)}
                          className={`min-w-24 flex-1 rounded-2xl border px-4 py-4 text-base font-semibold transition ${
                            selected
                              ? o === '对'
                                ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                                : 'border-rose-400 bg-rose-50 text-rose-700'
                              : 'border-slate-200 text-slate-600 hover:border-violet-200'
                          }`}
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
                ) : optionList(current).length ? (
                  <div className="mt-5 space-y-2.5">
                    {optionList(current).map((o) => {
                      const selected = answers[current.id] === o;
                      return (
                        <button
                          key={o}
                          type="button"
                          onClick={() => answerAndMaybeAdvance(current.id, o, true)}
                          className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${
                            selected
                              ? 'border-violet-300 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/10'
                              : 'border-slate-100 hover:border-violet-200 dark:border-white/10'
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              selected
                                ? 'border-violet-600 bg-violet-600 text-[10px] text-white'
                                : 'border-slate-300'
                            }`}
                          >
                            {selected ? '✓' : ''}
                          </span>
                          <span>{o}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-5">
                    <textarea
                      className="min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-500/15 dark:border-white/10 dark:bg-slate-950"
                      placeholder={
                        current.qtype === 'open'
                          ? '请结合题意作答（开放性简答，无唯一原文答案）…'
                          : '请填写唯一标准答案…'
                      }
                      value={answers[current.id] || ''}
                      onChange={(e) =>
                        setAnswers((a) => ({ ...a, [current.id]: e.target.value }))
                      }
                    />
                    <div className="mt-4 flex justify-end">
                      <PrimaryButton
                        onClick={() => {
                          if (!(answers[current.id] ?? '').trim()) {
                            toast.error('请先填写答案');
                            return;
                          }
                          if (index < total - 1) goTo(index + 1, 'next');
                          else {
                            setFinished(true);
                            setSlideDir('next');
                            setAnimKey((k) => k + 1);
                          }
                        }}
                      >
                        {index < total - 1 ? '下一题' : '完成作答'}
                      </PrimaryButton>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex items-center justify-between text-xs text-slate-400">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => goTo(index - 1, 'prev')}
                    className="disabled:opacity-30"
                  >
                    ← 上一题
                  </button>
                  <span>
                    {index + 1} / {total}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (index < total - 1) goTo(index + 1, 'next');
                      else {
                        setFinished(true);
                        setSlideDir('next');
                        setAnimKey((k) => k + 1);
                      }
                    }}
                  >
                    {index < total - 1 ? '跳过 →' : '完成 →'}
                  </button>
                </div>
              </ToolCard>
            </div>
          ) : (
            <ToolCard>
              <p className="text-sm text-slate-400">没有题目</p>
            </ToolCard>
          )}
        </div>
      </div>

      {/* Answer sheet */}
      {sheetOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="关闭"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={() => setSheetOpen(false)}
          />
          <div className="relative z-10 m-4 w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">答题卡</h3>
                <p className="text-xs text-slate-500">
                  已答 {answeredCount}/{total} · 点击题号跳转
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="rounded-full border border-slate-200 p-2 text-slate-500 dark:border-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2.5">
              {questions.map((q, i) => {
                const done = Boolean((answers[q.id] ?? '').trim());
                const active = !finished && i === index;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setFinished(false);
                      goTo(i, i > index ? 'next' : 'prev');
                    }}
                    className={`flex h-11 items-center justify-center rounded-2xl text-sm font-semibold transition ${
                      active
                        ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                        : done
                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-white/5'
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-5 flex gap-3">
              <PrimaryButton
                className="flex-1"
                pending={pending}
                onClick={() => {
                  setSheetOpen(false);
                  void submit();
                }}
              >
                交卷
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold dark:border-white/10"
              >
                继续做题
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`
        @keyframes practice-slide-in {
          from { opacity: 0.35; transform: translateX(28%); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes practice-slide-in-left {
          from { opacity: 0.35; transform: translateX(-28%); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </main>
  );
}
