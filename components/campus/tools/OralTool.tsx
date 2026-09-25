'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic2, SendHorizonal, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { ToolCard, ToolShell } from '@/components/campus/tools/ToolShell';

const SCENES = [
  { id: 'greeting', label: '问候自我介绍' },
  { id: 'shopping', label: '购物' },
  { id: 'restaurant', label: '餐厅点餐' },
  { id: 'campus', label: '校园交流' },
];

export function OralTool() {
  const [scene, setScene] = useState('greeting');
  const [line, setLine] = useState('');
  const [history, setHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [pending, setPending] = useState(false);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, pending]);

  async function send() {
    if (!line.trim()) return;
    setPending(true);
    try {
      const res = await fetch('/api/campus/tools/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'oral_reply',
          scene,
          studentLine: line,
          history,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '对话失败');
      const next = [
        ...history,
        { role: 'student', content: line },
        {
          role: 'teacher',
          content: `${data.reply}${data.translation ? `（${data.translation}）` : ''}`,
        },
      ];
      setHistory(next);
      setLastScore(data.score);
      setLine('');
      toast.success(data.feedback || `评分 ${data.score}`);

      if (next.length >= 6) {
        await fetch('/api/campus/tools/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_oral',
            scene,
            transcript: next,
            oralScore: data.score,
            oralFeedback: data.feedback || '',
          }),
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '对话失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <ToolShell title="口语练习" description="情景英语对话（精简版），成绩进入学情汇总。" eyebrow="口语 · Oral">
      <ToolCard className="!p-0 overflow-hidden">
        <div className="border-b border-slate-100 bg-gradient-to-r from-violet-50 to-indigo-50 px-5 py-4 dark:border-white/10 dark:from-violet-500/10 dark:to-indigo-500/10">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-500">
            <Mic2 className="h-3.5 w-3.5" />
            选择情景
          </div>
          <div className="flex flex-wrap gap-2">
            {SCENES.map((s) => {
              const active = scene === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setScene(s.id);
                    setHistory([]);
                    setLastScore(null);
                  }}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    active
                      ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex min-h-[340px] flex-col bg-[linear-gradient(180deg,#fff_0%,#f8f7ff_100%)] dark:bg-none">
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5 text-sm">
            {!history.length && !pending ? (
              <div className="flex h-56 flex-col items-center justify-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-500/20">
                  <Sparkles className="h-6 w-6" />
                </span>
                <p className="mt-4 font-semibold text-slate-800 dark:text-slate-100">开始一段口语对话</p>
                <p className="mt-2 max-w-xs text-slate-500">
                  用英语打一句，例如 “Hello, my name is…” ，Lily 会接话并给分。
                </p>
              </div>
            ) : null}

            {history.map((m, i) => {
              const mine = m.role === 'student';
              return (
                <div key={i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                      mine
                        ? 'rounded-br-md bg-violet-600 text-white'
                        : 'rounded-bl-md border border-slate-100 bg-white text-slate-800 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${mine ? 'text-violet-200' : 'text-slate-400'}`}>
                      {mine ? '我' : 'Lily'}
                    </p>
                    <p className="leading-6">{m.content}</p>
                  </div>
                </div>
              );
            })}

            {pending ? (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md border border-slate-100 bg-white px-4 py-3 text-slate-400 dark:border-white/10 dark:bg-slate-800">
                  Lily 正在思考…
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-slate-100 bg-white/90 p-4 backdrop-blur dark:border-white/10 dark:bg-slate-900/90">
            {lastScore != null ? (
              <p className="mb-3 text-xs font-medium text-violet-600">最近一轮评分：{lastScore}/5</p>
            ) : null}
            <div className="flex items-center gap-2">
              <input
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-500/15 dark:border-white/10 dark:bg-slate-950"
                placeholder="用英语输入…"
                value={line}
                onChange={(e) => setLine(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void send();
                }}
              />
              <button
                type="button"
                disabled={pending || !line.trim()}
                onClick={() => void send()}
                className="inline-flex h-12 items-center gap-2 rounded-2xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-md shadow-violet-600/25 transition hover:bg-violet-500 disabled:opacity-50"
              >
                <SendHorizonal className="h-4 w-4" />
                发送
              </button>
            </div>
          </div>
        </div>
      </ToolCard>
    </ToolShell>
  );
}
