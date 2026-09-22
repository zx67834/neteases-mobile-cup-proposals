'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  PlusCircle,
  Send,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { startConversationWithFirstMessage } from '@/lib/workbench/first-message-session';
import { postWorkbenchMessage, useWorkbenchStore } from '@/lib/workbench/session-store';
import { useStageFreshnessSync, useWorkbenchStream } from '@/lib/workbench/use-workbench-session';
import { useStageStore } from '@/lib/store/stage';
import { createBlankQuizScene, insertSceneAtIndex } from '@/lib/edit/scene-defaults';
import type { QuizContent } from '@/lib/types/stage';
import type { SceneOutline } from '@/lib/types/generation';
import { fetchSceneActions, fetchSceneContent } from '@/lib/hooks/use-scene-generator';
import { cn } from '@/lib/utils';

const QUICK_REQUESTS = ['精简当前页', '补充一个校园案例', '调整当前页版式', '补充课堂小结'];
const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

type LocalMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

export function TeacherAiEditPanel({ stageId }: { readonly stageId?: string }) {
  const storageKey = stageId ? `openmaic:teacher-edit-session:${stageId}` : null;
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined' || !storageKey) return null;
    return window.localStorage.getItem(storageKey);
  });
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState<(typeof OPTION_KEYS)[number]>('A');
  const [analysis, setAnalysis] = useState('');
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const chat = useWorkbenchStore((state) => state.chat);
  const status = useWorkbenchStore((state) => state.status);
  const attach = useWorkbenchStore((state) => state.attach);
  const stage = useStageStore((state) => state.stage);
  const scenes = useStageStore((state) => state.scenes);
  const outlines = useStageStore((state) => state.outlines);
  const currentSceneId = useStageStore((state) => state.currentSceneId);
  const setScenes = useStageStore((state) => state.setScenes);
  const setCurrentSceneId = useStageStore((state) => state.setCurrentSceneId);
  const updateScene = useStageStore((state) => state.updateScene);

  useEffect(() => {
    if (!sessionId || !stageId) return;
    attach(sessionId, stageId);
  }, [attach, sessionId, stageId]);

  useWorkbenchStream(sessionId);
  useStageFreshnessSync(sessionId ? (stageId ?? null) : null);

  const visibleMessages = useMemo(
    () =>
      chat.filter(
        (node) =>
          node.kind === 'user' ||
          node.kind === 'assistant' ||
          node.kind === 'system' ||
          node.kind === 'question' ||
          node.kind === 'tool',
      ),
    [chat],
  );
  const busy = sending || status === 'connecting' || status === 'queued' || status === 'running';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [visibleMessages.length, localMessages.length, busy]);

  const regenerateCurrentScene = useCallback(
    async (instruction: string) => {
      if (!stage || !stageId) throw new Error('课程尚未加载完成');
      const current = scenes.find((scene) => scene.id === currentSceneId);
      if (!current) throw new Error('没有找到当前课件页');

      const sourceOutline =
        outlines.find((outline) => outline.id === current.outlineId) ??
        outlines.find((outline) => outline.order === current.order);
      const fallbackOutline: SceneOutline = {
        id: current.outlineId || current.id,
        type: current.content.type,
        title: current.title,
        description: `重新设计这一页，并严格执行教师要求：${instruction}`,
        keyPoints: [],
        order: current.order,
      };
      const outline: SceneOutline = {
        ...(sourceOutline ?? fallbackOutline),
        title: current.title,
        type: current.content.type,
        description: `${sourceOutline?.description ?? fallbackOutline.description}\n教师本次修改要求：${instruction}`,
      };
      const allOutlines =
        outlines.length > 0
          ? outlines.map((item) => (item.id === outline.id ? outline : item))
          : scenes.map((scene) => ({
              id: scene.outlineId || scene.id,
              type: scene.content.type,
              title: scene.title,
              description: scene.title,
              keyPoints: [],
              order: scene.order,
            }));

      const contentResult = await fetchSceneContent({
        outline,
        allOutlines,
        stageId,
        stageInfo: {
          name: stage.name,
          description: stage.description,
          style: stage.style,
        },
      });
      if (!contentResult.success || !contentResult.content) {
        throw new Error(contentResult.error || 'AI 没有生成可用的页面内容');
      }

      const actionResult = await fetchSceneActions({
        outline: contentResult.effectiveOutline || outline,
        allOutlines,
        content: contentResult.content,
        stageId,
      });
      if (!actionResult.success || !actionResult.scene) {
        throw new Error(actionResult.error || 'AI 没有生成可用的课堂动作');
      }

      updateScene(current.id, {
        title: actionResult.scene.title,
        content: actionResult.scene.content,
        actions: actionResult.scene.actions,
        updatedAt: Date.now(),
      });
    },
    [currentSceneId, outlines, scenes, stage, stageId, updateScene],
  );

  const sendRequest = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || !stageId || busy) return;
      const current = scenes.find((scene) => scene.id === currentSceneId);
      const scopedText = current
        ? `请修改当前课程的第 ${current.order} 页《${current.title}》。教师要求：${text}`
        : `请修改当前课程。教师要求：${text}`;

      setSending(true);
      setError(null);
      try {
        if (sessionId) {
          await postWorkbenchMessage(sessionId, scopedText);
        } else {
          const result = await startConversationWithFirstMessage({ stageId, text: scopedText });
          setSessionId(result.sessionId);
          window.localStorage.setItem(`openmaic:teacher-edit-session:${stageId}`, result.sessionId);
          attach(result.sessionId, stageId);
        }
        setDraft('');
      } catch {
        if (sessionId && storageKey) {
          window.localStorage.removeItem(storageKey);
          setSessionId(null);
        }
        const userMessage: LocalMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          text,
        };
        setLocalMessages((messages) => [...messages, userMessage]);
        try {
          await regenerateCurrentScene(text);
          setLocalMessages((messages) => [
            ...messages,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              text: '已按要求重新生成当前页，并同步到课件。你可以继续提出修改。',
            },
          ]);
          setDraft('');
        } catch (fallbackCause) {
          setError(fallbackCause instanceof Error ? fallbackCause.message : 'AI 修改请求发送失败');
        }
      } finally {
        setSending(false);
      }
    },
    [attach, busy, currentSceneId, regenerateCurrentScene, scenes, sessionId, stageId, storageKey],
  );

  const insertQuiz = useCallback(() => {
    if (!stage || !question.trim() || options.some((option) => !option.trim())) return;
    const currentIndex = Math.max(
      0,
      scenes.findIndex((scene) => scene.id === currentSceneId),
    );
    const insertIndex = currentIndex + 1;
    const quiz = createBlankQuizScene(stage.id, '课堂测试', insertIndex + 1);
    const content: QuizContent = {
      type: 'quiz',
      questions: [
        {
          id: crypto.randomUUID(),
          type: 'single',
          question: question.trim(),
          options: options.map((label, index) => ({
            label: label.trim(),
            value: OPTION_KEYS[index],
          })),
          answer: [correct],
          analysis: analysis.trim() || undefined,
          points: 1,
        },
      ],
    };
    quiz.content = content;
    setScenes(insertSceneAtIndex(scenes, quiz, insertIndex));
    setCurrentSceneId(quiz.id);
    setQuestion('');
    setOptions(['', '', '', '']);
    setCorrect('A');
    setAnalysis('');
    setQuizOpen(false);
  }, [
    analysis,
    correct,
    currentSceneId,
    options,
    question,
    scenes,
    setCurrentSceneId,
    setScenes,
    stage,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50/70 dark:bg-slate-950/40">
      <div className="border-b border-slate-200/80 px-3 py-3 dark:border-slate-800">
        <div className="flex items-start gap-2 rounded-xl bg-violet-50 p-3 dark:bg-violet-950/30">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-600 dark:text-violet-300" />
          <div>
            <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
              AI 课件助手
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-violet-600/80 dark:text-violet-300/70">
              默认重新生成当前页；修改完成后会自动同步到 PPT。
            </p>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {QUICK_REQUESTS.map((request) => (
            <button
              key={request}
              type="button"
              onClick={() => void sendRequest(request)}
              disabled={!stageId || busy}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-[11px] text-slate-600 transition hover:border-violet-300 hover:text-violet-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              {request}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 scrollbar-hide">
        {visibleMessages.length === 0 && localMessages.length === 0 && !busy ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-slate-400">
            <Bot className="mb-2 size-8 stroke-1" />
            <p className="text-xs leading-5">
              告诉 AI 你对当前 PPT 哪些地方不满意，它会直接修改课程。
            </p>
          </div>
        ) : (
          visibleMessages.map((message) => {
            if (message.kind === 'tool') {
              return (
                <div
                  key={message.key}
                  className="flex items-center gap-2 px-1 text-[11px] text-slate-400"
                >
                  {message.toolState === 'running' ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Wrench className="size-3" />
                  )}
                  {message.toolState === 'running' ? '正在修改课件…' : '课件操作已完成'}
                </div>
              );
            }
            const mine = message.kind === 'user';
            return (
              <div
                key={message.key}
                className={cn(
                  'max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-5',
                  mine
                    ? 'ml-auto bg-violet-600 text-white'
                    : message.kind === 'system'
                      ? 'mx-auto bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                      : 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700',
                )}
              >
                {message.text}
              </div>
            );
          })
        )}
        {localMessages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-5',
              message.role === 'user'
                ? 'ml-auto bg-violet-600 text-white'
                : 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700',
            )}
          >
            {message.text}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-violet-600 dark:text-violet-300">
            <Loader2 className="size-3.5 animate-spin" /> AI 正在读取并修改课程…
          </div>
        )}
        {error && <div className="rounded-xl bg-red-50 p-2 text-xs text-red-600">{error}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
        <button
          type="button"
          onClick={() => setQuizOpen((open) => !open)}
          className="mb-2 flex w-full items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-200"
        >
          <span className="flex items-center gap-2">
            <PlusCircle className="size-4" /> 教师插入题目
          </span>
          {quizOpen ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>

        {quizOpen && (
          <div className="mb-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="题目内容"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950"
            />
            {options.map((option, index) => (
              <div key={OPTION_KEYS[index]} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCorrect(OPTION_KEYS[index])}
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    correct === OPTION_KEYS[index]
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 text-slate-500 dark:bg-slate-700',
                  )}
                  title="设为正确答案"
                >
                  {correct === OPTION_KEYS[index] ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : (
                    OPTION_KEYS[index]
                  )}
                </button>
                <input
                  value={option}
                  onChange={(event) =>
                    setOptions((current) =>
                      current.map((value, itemIndex) =>
                        itemIndex === index ? event.target.value : value,
                      ),
                    )
                  }
                  placeholder={`选项 ${OPTION_KEYS[index]}`}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            ))}
            <input
              value={analysis}
              onChange={(event) => setAnalysis(event.target.value)}
              placeholder="答案解析（可选）"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="button"
              onClick={insertQuiz}
              disabled={!question.trim() || options.some((option) => !option.trim())}
              className="w-full rounded-lg bg-violet-600 py-2 text-xs font-medium text-white transition hover:bg-violet-700 disabled:opacity-40"
            >
              插入到当前页之后
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 focus-within:border-violet-400 dark:border-slate-700 dark:bg-slate-900">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendRequest(draft);
              }
            }}
            placeholder="例如：把这一页改成案例导入…"
            rows={2}
            className="min-h-10 min-w-0 flex-1 resize-none bg-transparent text-xs leading-5 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => void sendRequest(draft)}
            disabled={!draft.trim() || !stageId || busy}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white transition hover:bg-violet-700 disabled:opacity-40"
            aria-label="发送修改要求"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
