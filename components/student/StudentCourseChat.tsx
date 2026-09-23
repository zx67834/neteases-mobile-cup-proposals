'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BookOpenCheck,
  Loader2,
  MessageCircleQuestion,
  RotateCcw,
  Send,
  Sparkles,
  Square,
} from 'lucide-react';
import { toast } from 'sonner';

import { MessageResponse } from '@/components/ai-elements/message';
import {
  streamStudentQa,
  StudentQaInterruptedError,
  type StudentQaSource,
} from '@/lib/student-qa/client';
import type { StageListItem } from '@/lib/utils/stage-storage';

interface StudentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: StudentQaSource[];
  interrupted?: boolean;
}

interface StudentCourseChatProps {
  courses: StageListItem[];
  loadingCourses: boolean;
}

function makeMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function StudentCourseChat({ courses, loadingCourses }: StudentCourseChatProps) {
  const router = useRouter();
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<StudentChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (courses.length === 0) {
      setSelectedCourseId('');
      return;
    }
    setSelectedCourseId((current) =>
      current && courses.some((course) => course.id === current) ? current : courses[0]!.id,
    );
  }, [courses]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);

  function resetConversation(nextCourseId?: string) {
    abortRef.current?.abort();
    setStreaming(false);
    setMessages([]);
    setPrompt('');
    if (nextCourseId) setSelectedCourseId(nextCourseId);
  }

  async function submitQuestion(questionOverride?: string) {
    const question = questionOverride?.trim() || prompt.trim();
    if (!question || !selectedCourse || streaming) return;

    const userMessage: StudentChatMessage = {
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
    setPrompt('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamStudentQa({
        courseId: selectedCourse.id,
        mode: 'study',
        messages: nextMessages.slice(-12).map(({ role, content }) => ({ role, content })),
        signal: controller.signal,
        onSources: (sources) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, sources } : message,
            ),
          );
        },
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
      const message = error instanceof Error ? error.message : 'AI 答疑暂时失败，请稍后重试。';
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

  return (
    <div className="w-full max-w-[920px] rounded-[26px] border border-white/80 bg-white/80 p-5 text-left shadow-2xl shadow-slate-900/[0.06] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/75 dark:shadow-black/20 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold">课程 AI 答疑</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              回答会引用教师已经生成的课件与讲义
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-white/5">
            <BookOpenCheck className="h-4 w-4 text-violet-500" />
            <select
              aria-label="选择答疑课程"
              value={selectedCourseId}
              disabled={loadingCourses || courses.length === 0 || streaming}
              onChange={(event) => resetConversation(event.target.value)}
              className="max-w-52 bg-transparent pr-1 text-sm outline-none disabled:opacity-50 dark:text-slate-100"
            >
              {courses.length === 0 ? <option value="">暂无课程</option> : null}
              {courses.map((course) => (
                <option key={course.id} value={course.id} className="dark:bg-slate-900">
                  {course.name}
                </option>
              ))}
            </select>
          </label>
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={() => resetConversation()}
              aria-label="新建对话"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:text-violet-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {messages.length > 0 ? (
        <div ref={scrollRef} className="mb-4 max-h-[350px] space-y-4 overflow-y-auto pr-1">
          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === 'user'
                  ? 'ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-violet-600 px-4 py-3 text-sm leading-6 text-white'
                  : 'max-w-[92%] rounded-2xl rounded-bl-md bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-700 dark:bg-white/[0.06] dark:text-slate-200'
              }
            >
              {message.content ? (
                message.role === 'assistant' ? (
                  <MessageResponse className="text-sm leading-7">{message.content}</MessageResponse>
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )
              ) : (
                <span className="inline-flex items-center gap-2 text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在结合课程内容思考…
                </span>
              )}
              {message.role === 'assistant' && message.sources?.length ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200/70 pt-3 dark:border-white/10">
                  {message.sources.map((source) => (
                    <button
                      key={source.sceneId}
                      type="button"
                      title={source.excerpt}
                      onClick={() =>
                        router.push(
                          `/student/classroom/${selectedCourseId}?scene=${encodeURIComponent(source.sceneId)}`,
                        )
                      }
                      className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100 dark:border-violet-400/20 dark:bg-violet-500/10 dark:text-violet-200"
                    >
                      第 {source.sceneOrder} 页 · {source.title}
                    </button>
                  ))}
                </div>
              ) : null}
              {message.role === 'assistant' && message.interrupted ? (
                <button
                  type="button"
                  onClick={() =>
                    void submitQuestion('请从刚才中断的位置继续，只补充尚未完成的内容。')
                  }
                  className="mt-3 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                >
                  回答中断，继续补全
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-4 rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-500 dark:bg-white/[0.04] dark:text-slate-400">
          {selectedCourse ? (
            <>
              当前正在学习{' '}
              <strong className="text-slate-800 dark:text-slate-100">{selectedCourse.name}</strong>
              。你可以问概念、代码、课件内容，也可以让我出一道巩固题。
            </>
          ) : (
            '教师端生成课程后，就可以在这里选择课程并开始答疑。'
          )}
        </div>
      )}

      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void submitQuestion();
          }
        }}
        disabled={!selectedCourse || streaming}
        placeholder="例如：为什么二分查找容易出现边界错误？（Enter 发送，Shift+Enter 换行）"
        className="min-h-24 w-full resize-none bg-transparent text-[15px] leading-7 text-slate-800 outline-none placeholder:text-slate-300 disabled:opacity-60 dark:text-slate-100 dark:placeholder:text-slate-600"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-white/10">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <MessageCircleQuestion className="h-4 w-4" />
          <span>当前对话仅保留在本页面，账号系统接入后再同步学习记录</span>
        </div>
        {streaming ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            停止回答
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submitQuestion()}
            disabled={!prompt.trim() || !selectedCourse}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-blue-500 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
          >
            发送问题
            <Send className="h-4 w-4" />
          </button>
        )}
      </div>
      {selectedCourse ? (
        <button
          type="button"
          onClick={() => router.push(`/student/classroom/${selectedCourse.id}`)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-300"
        >
          打开这门课
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
