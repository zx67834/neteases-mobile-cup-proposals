'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, HelpCircle, MessageCircleQuestion, Send } from 'lucide-react';
import type { ClassroomAudience } from '@/lib/classroom/audience';
import { cn } from '@/lib/utils';

type ClassroomQuestion = {
  id: string;
  student: string;
  text: string;
  createdAt: number;
  answered: boolean;
};

const STORAGE_PREFIX = 'openmaic:classroom-questions:';

export function LiveQuestionBar({
  classroomId,
  audience,
  overlay = false,
}: {
  readonly classroomId?: string;
  readonly audience: ClassroomAudience;
  readonly overlay?: boolean;
}) {
  const roomId = classroomId ?? 'preview';
  const storageKey = `${STORAGE_PREFIX}${roomId}`;
  const channelName = `openmaic-classroom-${roomId}`;
  const [questions, setQuestions] = useState<ClassroomQuestion[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = window.localStorage.getItem(storageKey);
      return saved ? (JSON.parse(saved) as ClassroomQuestion[]).slice(-30) : [];
    } catch {
      return [];
    }
  });
  const [draft, setDraft] = useState('');

  const replaceQuestions = useCallback((next: ClassroomQuestion[]) => {
    setQuestions(next.slice(-30));
  }, []);

  useEffect(() => {
    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(channelName);
    const onChannelMessage = (event: MessageEvent<ClassroomQuestion[]>) => {
      if (Array.isArray(event.data)) replaceQuestions(event.data);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return;
      try {
        replaceQuestions(JSON.parse(event.newValue) as ClassroomQuestion[]);
      } catch {
        // Ignore malformed data from another tab.
      }
    };
    channel?.addEventListener('message', onChannelMessage);
    window.addEventListener('storage', onStorage);
    return () => {
      channel?.removeEventListener('message', onChannelMessage);
      channel?.close();
      window.removeEventListener('storage', onStorage);
    };
  }, [channelName, replaceQuestions, storageKey]);

  const publish = useCallback(
    (next: ClassroomQuestion[]) => {
      const bounded = next.slice(-30);
      setQuestions(bounded);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(bounded));
        const channel = new BroadcastChannel(channelName);
        channel.postMessage(bounded);
        channel.close();
      } catch {
        // Keep the current tab functional when storage or channels are unavailable.
      }
    },
    [channelName, storageKey],
  );

  const submitQuestion = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    publish([
      ...questions,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        student: '同学',
        text,
        createdAt: Date.now(),
        answered: false,
      },
    ]);
    setDraft('');
  }, [draft, publish, questions]);

  const pendingCount = useMemo(
    () => questions.filter((question) => !question.answered).length,
    [questions],
  );

  const toggleAnswered = useCallback(
    (id: string) => {
      if (audience !== 'teacher') return;
      publish(
        questions.map((question) =>
          question.id === id ? { ...question, answered: !question.answered } : question,
        ),
      );
    },
    [audience, publish, questions],
  );

  return (
    <section
      className={cn(
        'border-t border-slate-200/80 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.04)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95',
        overlay && 'bg-white/90 dark:bg-slate-950/90',
      )}
      aria-label="课堂实时提问"
    >
      <div className="flex h-[104px] min-w-0 items-stretch gap-3">
        <div className="flex w-36 shrink-0 flex-col justify-center rounded-2xl bg-violet-50 px-4 dark:bg-violet-950/40">
          <div className="flex items-center gap-2 font-semibold text-violet-700 dark:text-violet-300">
            <MessageCircleQuestion className="size-4" />
            课堂提问
          </div>
          <div className="mt-1 text-xs text-violet-500 dark:text-violet-400">
            {audience === 'teacher' ? `${pendingCount} 条待回复` : '匿名发送，轻松提问'}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {questions.length === 0 ? (
            <div className="flex w-full items-center justify-center gap-2 text-sm text-slate-400">
              <HelpCircle className="size-4" />
              {audience === 'teacher'
                ? '暂无学生提问，开课后问题会实时出现在这里'
                : '还没有同学提问，来提出第一个问题吧'}
            </div>
          ) : (
            questions
              .slice()
              .reverse()
              .map((question) => (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => toggleAnswered(question.id)}
                  className={cn(
                    'group flex h-[76px] w-64 shrink-0 flex-col justify-between rounded-2xl border px-3 py-2.5 text-left transition',
                    question.answered
                      ? 'border-emerald-200 bg-emerald-50/70 text-slate-500 dark:border-emerald-900 dark:bg-emerald-950/30'
                      : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:border-violet-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
                    audience !== 'teacher' && 'cursor-default',
                  )}
                >
                  <span className="line-clamp-2 text-sm leading-5">{question.text}</span>
                  <span className="flex items-center justify-between text-[11px] text-slate-400">
                    {question.student}
                    {question.answered && (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <Check className="size-3" /> 已回复
                      </span>
                    )}
                  </span>
                </button>
              ))
          )}
        </div>

        {audience === 'student' && (
          <div className="flex w-80 shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 dark:border-slate-700 dark:bg-slate-900">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitQuestion();
              }}
              placeholder="输入你的问题…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={submitQuestion}
              disabled={!draft.trim()}
              className="flex size-9 items-center justify-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="发送提问"
            >
              <Send className="size-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
