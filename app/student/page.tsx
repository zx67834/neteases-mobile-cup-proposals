'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clock3,
  GraduationCap,
  KeyRound,
  Loader2,
  Moon,
  NotebookPen,
  Route,
  Search,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { Slide } from '@openmaic/dsl';
import { toast } from 'sonner';

import { SlideThumbnail } from '@/components/slide-renderer/SlideThumbnail';
import { AccountDock } from '@/components/auth/AccountDock';
import { listStudentCampusCourses } from '@/lib/campus/course-client';
import { useTheme } from '@/lib/hooks/use-theme';
import { hydrateStudentWorkflowMemories } from '@/lib/student-workflow/remote-storage';
import {
  readStudentWorkflowMemories,
  type StudentWorkflowMemory,
} from '@/lib/student-workflow/storage';
import {
  getFirstSlideByStages,
  revokeThumbnailSlideMediaUrls,
  type StageListItem,
} from '@/lib/utils/stage-storage';

function formatUpdatedAt(timestamp: number) {
  if (!timestamp) return '最近学习';
  const elapsedDays = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (elapsedDays <= 0) return '今天更新';
  if (elapsedDays === 1) return '昨天更新';
  if (elapsedDays < 7) return `${elapsedDays} 天前更新`;
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(timestamp);
}

function CourseCover({ slide }: { readonly slide?: Slide }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[18px] bg-gradient-to-br from-violet-50 via-white to-blue-50 dark:from-violet-950/70 dark:via-slate-900 dark:to-blue-950/70">
      {slide ? (
        <SlideThumbnail slide={slide} viewportRatio={9 / 16} visible />
      ) : (
        <div className="flex h-full items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/80 text-violet-500 shadow-sm dark:bg-white/10">
            <BookOpen className="h-8 w-8" />
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/[0.04] dark:ring-white/10" />
    </div>
  );
}

export default function StudentHomePage() {
  const { theme, setTheme } = useTheme();
  const [courses, setCourses] = useState<StageListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const thumbnailRef = useRef<Record<string, Slide>>({});
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<StudentWorkflowMemory[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesInDatabase, setNotesInDatabase] = useState(false);
  const [query, setQuery] = useState('');
  const [displayName, setDisplayName] = useState('同学');
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const sharedCode = new URLSearchParams(window.location.search).get('join')?.trim();
    if (!sharedCode) return;
    setInviteCode(sharedCode.toUpperCase());
    window.setTimeout(() => {
      document.getElementById('student-courses')?.scrollIntoView({ behavior: 'smooth' });
      toast.info('课堂码已填入，点击“加入”即可同步老师发布的课程');
    }, 250);
  }, []);

  async function fetchCourses(): Promise<StageListItem[]> {
    return listStudentCampusCourses();
  }

  useEffect(() => {
    let cancelled = false;

    async function loadCourses() {
      try {
        const records = await fetchCourses();
        const nextThumbnails = await getFirstSlideByStages(records.map((course) => course.id));
        if (cancelled) {
          revokeThumbnailSlideMediaUrls(nextThumbnails);
          return;
        }
        revokeThumbnailSlideMediaUrls(thumbnailRef.current);
        thumbnailRef.current = nextThumbnails;
        setCourses(records);
        setThumbnails(nextThumbnails);
      } catch (error) {
        console.error('[StudentHome] Failed to load courses', error);
        toast.error('课程列表加载失败，请稍后重试');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCourses();
    return () => {
      cancelled = true;
      revokeThumbnailSlideMediaUrls(thumbnailRef.current);
      thumbnailRef.current = {};
    };
  }, []);

  useEffect(() => {
    void fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: { user?: { displayName?: string } }) => {
        if (payload.user?.displayName) setDisplayName(payload.user.displayName);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadNotes() {
      const result = await hydrateStudentWorkflowMemories(readStudentWorkflowMemories());
      if (cancelled) return;
      setNotes(result.records);
      setNotesInDatabase(result.databaseConnected);
      setNotesLoading(false);
    }
    void loadNotes();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleCourses = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return courses;
    return courses.filter((course) =>
      `${course.name} ${course.description ?? ''}`.toLocaleLowerCase().includes(normalized),
    );
  }, [courses, query]);

  const continueCourse = courses[0];

  function cycleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }

  async function joinClass() {
    const code = inviteCode.trim();
    if (!code) return;
    setJoining(true);
    try {
      const response = await fetch('/api/campus/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: code }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        className?: string;
        courseCount?: number;
      };
      if (!response.ok || !payload.success) throw new Error(payload.error || '加入班级失败');
      const records = await fetchCourses();
      setCourses(records);
      setInviteCode('');
      toast.success(
        `已加入${payload.className ?? '班级'}，同步 ${payload.courseCount ?? 0} 门课程`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加入班级失败');
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f9fd] text-slate-950 dark:bg-[#071023] dark:text-slate-50">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-[18%] h-[430px] w-[430px] rounded-full bg-blue-300/20 blur-3xl dark:bg-blue-500/10" />
        <div className="absolute bottom-[-160px] right-[12%] h-[520px] w-[520px] rounded-full bg-violet-300/25 blur-3xl dark:bg-violet-500/10" />
      </div>

      <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <Link href="/student" className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-blue-500 text-white shadow-lg shadow-violet-500/20">
            <GraduationCap className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-[17px] font-bold tracking-tight">智慧课堂</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">学生学习中心</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cycleTheme}
            aria-label="切换主题"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/70 text-slate-500 shadow-sm backdrop-blur-md transition hover:text-violet-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <AccountDock displayName={displayName} role="学生" floating={false} />
        </div>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-6 pb-14 pt-[7vh] text-center">
        <img src="/logo-horizontal.png" alt="OpenMAIC" className="mb-3 h-12 md:h-16" />
        <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
          你的 AI 学习空间 · 听课、答疑与巩固练习
        </p>

        <Link
          href={
            continueCourse ? `/student/workflow?course=${continueCourse.id}` : '/student/workflow'
          }
          className="group grid w-full overflow-hidden rounded-[28px] border border-white/80 bg-white/82 text-left shadow-2xl shadow-slate-900/[0.07] backdrop-blur-xl transition hover:-translate-y-1 hover:shadow-violet-500/10 dark:border-white/10 dark:bg-slate-900/78 md:grid-cols-[1fr_auto]"
        >
          <div className="p-7 sm:p-9">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
                <Route className="h-6 w-6" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold">AI 可视化学习工作流</h1>
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                    独立学习空间
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  从课程提问出发，自由拖拽并连接讲解、练习与笔记
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
              {['课程内容关联', '节点自由拖拽', '逐步追问', '互动练习'].map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-white/10 dark:bg-white/5"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-center border-t border-slate-100 bg-gradient-to-br from-violet-50 to-blue-50 px-8 py-6 md:border-l md:border-t-0 dark:border-white/10 dark:from-violet-500/10 dark:to-blue-500/10">
            <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/20">
              <Sparkles className="h-4 w-4" />
              打开学习画布
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </Link>
      </section>

      <section
        id="student-courses"
        className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-20 lg:px-10"
      >
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-violet-500">
              学习空间
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">我的课程</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              老师发布的课程会在这里出现，进入后使用学生课堂视图。
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <label className="flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 shadow-sm backdrop-blur-sm focus-within:border-violet-300 sm:w-64 dark:border-white/10 dark:bg-white/5">
              <KeyRound className="h-4 w-4 text-slate-400" />
              <input
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void joinClass();
                }}
                placeholder="输入课堂码加入班级"
                className="min-w-0 flex-1 bg-transparent text-sm uppercase outline-none placeholder:normal-case placeholder:text-slate-400"
              />
              <button
                type="button"
                disabled={joining || !inviteCode.trim()}
                onClick={() => void joinClass()}
                className="text-xs font-semibold text-violet-600 disabled:text-slate-300"
              >
                加入
              </button>
            </label>
            <label className="flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 shadow-sm backdrop-blur-sm focus-within:border-violet-300 sm:w-56 dark:border-white/10 dark:bg-white/5">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索已加入课程"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </label>
          </div>
        </div>

        {continueCourse && !query ? (
          <Link
            href={`/student/classroom/${continueCourse.id}`}
            className="group mb-8 grid overflow-hidden rounded-[26px] border border-slate-200/70 bg-white/85 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-900/[0.06] dark:border-white/10 dark:bg-white/5 md:grid-cols-[1.15fr_1fr]"
          >
            <CourseCover slide={thumbnails[continueCourse.id]} />
            <div className="flex flex-col justify-center p-6 md:p-8">
              <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                <Clock3 className="h-3.5 w-3.5" />
                继续学习
              </span>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {continueCourse.name}
              </h2>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {continueCourse.description ||
                  `共 ${continueCourse.sceneCount} 页课件，点击回到课堂继续学习。`}
              </p>
              <div className="mt-6 flex items-center gap-5 text-sm text-slate-500 dark:text-slate-400">
                <span>{continueCourse.sceneCount} 页课件</span>
                <span>{formatUpdatedAt(continueCourse.updatedAt)}</span>
                <span className="ml-auto flex items-center gap-1 font-semibold text-violet-600 dark:text-violet-300">
                  进入课堂
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          </Link>
        ) : null}

        {loading ? (
          <div className="flex min-h-48 items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white/50 dark:border-white/10 dark:bg-white/[0.03]">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          </div>
        ) : visibleCourses.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visibleCourses.map((course) => (
              <Link
                key={course.id}
                href={`/student/classroom/${course.id}`}
                className="group rounded-[24px] border border-slate-200/70 bg-white/80 p-3 shadow-sm transition hover:-translate-y-1 hover:border-violet-200 hover:shadow-xl hover:shadow-violet-500/[0.06] dark:border-white/10 dark:bg-white/5 dark:hover:border-violet-400/30"
              >
                <CourseCover slide={thumbnails[course.id]} />
                <div className="px-2 pb-2 pt-4">
                  <h3 className="line-clamp-1 text-lg font-semibold tracking-tight">
                    {course.name}
                  </h3>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      {course.sceneCount} 页课件 · {formatUpdatedAt(course.updatedAt)}
                    </span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-violet-600 group-hover:text-white dark:bg-white/10 dark:text-slate-300">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white/50 px-6 text-center dark:border-white/10 dark:bg-white/[0.03]">
            <BookOpen className="mb-4 h-9 w-9 text-slate-300 dark:text-slate-600" />
            <h3 className="font-semibold">{query ? '没有找到相关课程' : '还没有加入课程'}</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {query ? '换一个课程名试试。' : '在上方输入老师提供的课堂码。'}
            </p>
          </div>
        )}
      </section>

      <section className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-24 lg:px-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">
              {displayName} · 学习资产
            </p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">我的笔记</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              每次课程提问、练习和整理都会保存为一张可继续编辑的学习画布。
            </p>
          </div>
          <span
            className={`hidden rounded-full px-3 py-1.5 text-xs font-medium sm:inline-flex ${
              notesInDatabase
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
            }`}
          >
            {notesInDatabase ? '数据库已同步' : '浏览器缓存模式'}
          </span>
        </div>

        {notesLoading ? (
          <div className="flex min-h-40 items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white/50 dark:border-white/10 dark:bg-white/[0.03]">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          </div>
        ) : notes.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {notes.map((memory) => {
              const course = courses.find((item) => item.id === memory.courseId);
              return (
                <Link
                  key={memory.workflow.id}
                  href={`/student/workflow?course=${encodeURIComponent(memory.courseId)}&workflow=${encodeURIComponent(memory.workflow.id)}`}
                  className="group rounded-[24px] border border-slate-200/70 bg-white/80 p-5 shadow-sm transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-500/[0.06] dark:border-white/10 dark:bg-white/5 dark:hover:border-emerald-400/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                      <NotebookPen className="h-5 w-5" />
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500 dark:bg-white/10 dark:text-slate-300">
                      {memory.workflow.nodes.length} 个节点
                    </span>
                  </div>
                  <h3 className="mt-4 line-clamp-1 text-lg font-semibold tracking-tight">
                    {memory.workflow.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500 dark:text-slate-400">
                    {memory.workflow.summary}
                  </p>
                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
                    <span className="line-clamp-1 max-w-[70%]">
                      {course?.name ?? '关联课程'} · {formatUpdatedAt(memory.updatedAt)}
                    </span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <Link
            href={
              continueCourse ? `/student/workflow?course=${continueCourse.id}` : '/student/workflow'
            }
            className="flex min-h-48 flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white/50 px-6 text-center transition hover:border-emerald-300 hover:bg-emerald-50/30 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-emerald-400/30"
          >
            <NotebookPen className="mb-4 h-9 w-9 text-slate-300 dark:text-slate-600" />
            <h3 className="font-semibold">还没有学习笔记</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              打开 AI 学习画布，从课程提问或整理笔记开始。
            </p>
          </Link>
        )}
      </section>
    </main>
  );
}
