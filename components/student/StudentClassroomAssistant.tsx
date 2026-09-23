'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Lightbulb,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Send,
  Square,
} from 'lucide-react';
import { toast } from 'sonner';

import { MessageResponse } from '@/components/ai-elements/message';
import { streamStudentQa, StudentQaInterruptedError } from '@/lib/student-qa/client';

interface ClassroomAssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  interrupted?: boolean;
}

function makeMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function StudentClassroomAssistant({
  courseId,
  sceneId,
  sceneTitle,
  sceneOrder,
}: {
  readonly courseId: string;
  readonly sceneId?: string | null;
  readonly sceneTitle?: string;
  readonly sceneOrder?: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ClassroomAssistantMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, [sceneId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function resetConversation() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setDraft('');
    setMessages([]);
  }

  async function sendQuestion(questionOverride?: string) {
    const question = questionOverride?.trim() || draft.trim();
    if (!question || !sceneId || streaming) return;

    const userMessage: ClassroomAssistantMessage = {
      id: makeMessageId(),
      role: 'user',
      content: question,
    };
    const assistantId = makeMessageId();
    const nextMessages = [
      ...messages.map((message) => ({ ...message, interrupted: false })),
      userMessage,
    ];
    setMessages([...nextMessages, { id: assistantId, role: 'assistant', content: '' }]);
    setDraft('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamStudentQa({
        courseId,
        currentSceneId: sceneId,
        mode: 'classroom',
        messages: nextMessages.slice(-8).map(({ role, content }) => ({ role, content })),
        signal: controller.signal,
        onDelta: (delta) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + delta }
                : message,
            ),
          );
        },
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : '随堂答疑暂时失败，请稍后重试。';
      const interrupted = error instanceof StudentQaInterruptedError;
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                interrupted,
                content: item.content || `抱歉，${message}`,
              }
            : item,
        ),
      );
      toast.error(message);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStreaming(false);
    }
  }

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center border-l border-slate-200 bg-white py-3 dark:border-slate-800 dark:bg-slate-950">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex size-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 transition hover:bg-violet-200 dark:bg-violet-500/15 dark:text-violet-300"
          aria-label="展开 AI 随堂答疑"
          title="展开 AI 随堂答疑"
        >
          <PanelRightOpen className="size-4" />
        </button>
        <span className="mt-3 [writing-mode:vertical-rl] text-xs font-semibold tracking-widest text-slate-500 dark:text-slate-400">
          AI 随堂答疑
        </span>
      </aside>
    );
  }

  return (
    <aside
      className="flex w-[360px] shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
      aria-label="AI 随堂答疑"
    >
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-500 text-white shadow-sm">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              AI 随堂答疑
            </h2>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              快速模式
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {sceneOrder ? `第 ${sceneOrder} 页 · ` : ''}
            {sceneTitle || '当前课件'}
          </p>
        </div>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={resetConversation}
            className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-violet-600 dark:hover:bg-white/10"
            aria-label="清空随堂对话"
            title="清空随堂对话"
          >
            <RotateCcw className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-violet-600 dark:hover:bg-white/10"
          aria-label="收起 AI 随堂答疑"
          title="收起 AI 随堂答疑"
        >
          <PanelRightClose className="size-4" />
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
              <div className="mb-1 flex items-center gap-2 font-medium text-slate-800 dark:text-slate-100">
                <Lightbulb className="size-4 text-amber-500" />
                当前页没听懂？
              </div>
              我会结合正在展示的课件，用尽量短的回答帮你跟上课堂。
            </div>
            <div className="grid grid-cols-1 gap-2">
              {[
                ['解释当前页', '用两三句话解释当前页最重要的内容。'],
                ['举个例子', '针对当前页的知识点，举一个非常简短的例子。'],
                ['出一道题', '根据当前页出一道小题，先不要告诉我答案。'],
              ].map(([label, question]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => void sendQuestion(question)}
                  disabled={!sceneId}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-violet-500/40 dark:hover:bg-violet-500/10"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === 'user'
                  ? 'ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-violet-600 px-3.5 py-2.5 text-sm leading-6 text-white'
                  : 'max-w-[94%] rounded-2xl rounded-bl-md bg-slate-50 px-3.5 py-2.5 text-sm leading-6 text-slate-700 dark:bg-white/[0.05] dark:text-slate-200'
              }
            >
              {message.content ? (
                message.role === 'assistant' ? (
                  <MessageResponse className="text-sm leading-6">{message.content}</MessageResponse>
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )
              ) : (
                <span className="inline-flex items-center gap-2 text-slate-400">
                  <Loader2 className="size-3.5 animate-spin" />
                  快速查看当前页…
                </span>
              )}
              {message.role === 'assistant' && message.interrupted ? (
                <button
                  type="button"
                  onClick={() => void sendQuestion('请从刚才中断的位置继续，用最简短的方式补全。')}
                  className="mt-2 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                >
                  继续补全
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-violet-300 dark:border-slate-800 dark:bg-slate-900 dark:focus-within:border-violet-500/50">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendQuestion();
              }
            }}
            disabled={!sceneId || streaming}
            rows={2}
            placeholder="问一个当前页的问题…"
            className="min-h-10 flex-1 resize-none bg-transparent px-1 py-1 text-sm leading-5 text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-50 dark:text-slate-100"
          />
          {streaming ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-700 text-white hover:bg-slate-800"
              aria-label="停止回答"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void sendQuestion()}
              disabled={!draft.trim() || !sceneId}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="发送随堂问题"
            >
              <Send className="size-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          回答仅围绕当前课件页，默认简短输出
        </p>
      </div>
    </aside>
  );
}
