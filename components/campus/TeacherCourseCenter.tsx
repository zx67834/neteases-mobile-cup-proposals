'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Clipboard,
  ExternalLink,
  Loader2,
  Send,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';

interface CourseItem {
  id: string;
  courseId: string;
  name: string;
  description?: string;
  sceneCount: number;
  status: 'draft' | 'published' | 'archived';
  inviteCode?: string;
  className?: string;
}

export function TeacherCourseCenter() {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/campus/courses', { cache: 'no-store' });
    const payload = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      records?: CourseItem[];
      error?: string;
    };
    if (!response.ok || !payload.success || !payload.records) {
      throw new Error(payload.error || '课程加载失败');
    }
    setCourses(payload.records);
  }, []);

  useEffect(() => {
    void load()
      .catch((error) => toast.error(error instanceof Error ? error.message : '课程加载失败'))
      .finally(() => setLoading(false));
  }, [load]);

  async function togglePublish(course: CourseItem) {
    setPendingId(course.id);
    const action = course.status === 'published' ? 'unpublish' : 'publish';
    try {
      const response = await fetch(`/api/stages/${encodeURIComponent(course.id)}/${action}`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || '操作失败');
      await load();
      toast.success(action === 'publish' ? '课程已发布给班级学生' : '已撤回课程发布');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setPendingId(null);
    }
  }

  async function copyShare(course: CourseItem) {
    if (!course.inviteCode) return;
    const joinUrl = `${window.location.origin}/join/${encodeURIComponent(course.inviteCode)}`;
    const text = `课程：${course.name}\n课堂码：${course.inviteCode}\n学生入口：${joinUrl}`;
    await navigator.clipboard.writeText(text);
    setCopiedId(course.id);
    toast.success('课程分享信息已复制');
    window.setTimeout(() => setCopiedId(null), 1600);
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-8 text-slate-950 dark:bg-[#071023] dark:text-slate-50 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/teacher"
              className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-600"
            >
              <ArrowLeft className="h-4 w-4" /> 返回教师工作台
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">课程发布中心</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              发布课程后，班级里的学生会立即看到；也可以复制课堂码和学生入口发给学生。
            </p>
          </div>
          <Link
            href="/messages"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-violet-700 shadow-sm ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10"
          >
            <Send className="h-4 w-4" /> 站内消息
          </Link>
        </div>

        <div className="mb-7 grid gap-3 rounded-[24px] border border-violet-100 bg-violet-50/70 p-5 text-sm text-slate-600 dark:border-violet-400/15 dark:bg-violet-500/10 dark:text-slate-300 sm:grid-cols-3">
          <p>
            <b className="text-violet-700 dark:text-violet-300">1. 发布</b>
            <br />
            选择准备好的课程并发布。
          </p>
          <p>
            <b className="text-violet-700 dark:text-violet-300">2. 分享</b>
            <br />
            复制课堂码或学生入口发送给学生。
          </p>
          <p>
            <b className="text-violet-700 dark:text-violet-300">3. 学习</b>
            <br />
            学生加入班级后，课程自动进入“我的课程”。
          </p>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
          </div>
        ) : courses.length ? (
          <div className="grid gap-5 md:grid-cols-2">
            {courses.map((course) => {
              const published = course.status === 'published';
              return (
                <article
                  key={course.id}
                  className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                      <BookOpen className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-lg font-bold">{course.name}</h2>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${published ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'}`}
                        >
                          {published ? '已发布' : '草稿'}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {course.sceneCount} 页课件 · {course.className ?? '默认班级'}
                      </p>
                    </div>
                  </div>

                  {published && course.inviteCode ? (
                    <div className="mt-5 rounded-2xl bg-slate-50 p-4 dark:bg-white/5">
                      <p className="text-xs text-slate-400">学生加入课堂码</p>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <code className="text-xl font-bold tracking-[0.18em] text-violet-700 dark:text-violet-300">
                          {course.inviteCode}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyShare(course)}
                          className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-violet-700 shadow-sm dark:bg-slate-900"
                        >
                          {copiedId === course.id ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Clipboard className="h-4 w-4" />
                          )}
                          {copiedId === course.id ? '已复制' : '复制分享信息'}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      href={`/classroom/${course.id}`}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-medium hover:border-violet-300 hover:text-violet-600 dark:border-white/10"
                    >
                      <ExternalLink className="h-4 w-4" /> 打开课程
                    </Link>
                    <button
                      type="button"
                      disabled={pendingId === course.id}
                      onClick={() => void togglePublish(course)}
                      className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white disabled:opacity-50 ${published ? 'bg-slate-500' : 'bg-gradient-to-r from-violet-600 to-blue-500'}`}
                    >
                      {pendingId === course.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : published ? (
                        <Undo2 className="h-4 w-4" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      {published ? '撤回发布' : '发布给学生'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-slate-300 p-14 text-center text-slate-500 dark:border-white/15">
            还没有课程，请先在教师工作台创建课程。
          </div>
        )}
      </div>
    </main>
  );
}
