'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clock3,
  GraduationCap,
  Loader2,
  Moon,
  Search,
  Sun,
} from 'lucide-react';
import type { Slide } from '@openmaic/dsl';
import { toast } from 'sonner';

import { SlideThumbnail } from '@/components/slide-renderer/SlideThumbnail';
import { StudentCourseChat } from '@/components/student/StudentCourseChat';
import { useTheme } from '@/lib/hooks/use-theme';
import {
  getFirstSlideByStages,
  listStages,
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
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadCourses() {
      try {
        const records = await listStages();
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
          <Link
            href="/teacher"
            className="hidden rounded-full border border-slate-200/80 bg-white/70 px-4 py-2 text-sm text-slate-600 shadow-sm backdrop-blur-md transition hover:border-violet-200 hover:text-violet-600 sm:block dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
          >
            进入教师端
          </Link>
          <button
            type="button"
            onClick={cycleTheme}
            aria-label="切换主题"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/70 text-slate-500 shadow-sm backdrop-blur-md transition hover:text-violet-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <div className="ml-1 flex h-10 items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-2.5 pr-4 shadow-sm dark:border-white/10 dark:bg-white/5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
              学
            </span>
            <span className="text-sm font-medium">同学</span>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-6 pb-12 pt-[7vh] text-center">
        <img src="/logo-horizontal.png" alt="OpenMAIC" className="mb-3 h-12 md:h-16" />
        <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
          你的 AI 学习空间 · 听课、答疑与巩固练习
        </p>

        <StudentCourseChat courses={courses} loadingCourses={loading} />
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
          <label className="flex h-11 w-full items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 shadow-sm backdrop-blur-sm focus-within:border-violet-300 sm:w-72 dark:border-white/10 dark:bg-white/5">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索已加入课程"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </label>
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
    </main>
  );
}
