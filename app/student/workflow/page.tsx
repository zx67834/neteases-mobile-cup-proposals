'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, GraduationCap, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';

import { StudentLearningWorkspace } from '@/components/student/StudentLearningWorkspace';
import { useTheme } from '@/lib/hooks/use-theme';
import { listStages, type StageListItem } from '@/lib/utils/stage-storage';

export default function StudentWorkflowPage() {
  const { theme, setTheme } = useTheme();
  const [courses, setCourses] = useState<StageListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadCourses() {
      try {
        const records = await listStages();
        if (!cancelled) setCourses(records);
      } catch (error) {
        console.error('[StudentWorkflow] Failed to load courses', error);
        toast.error('课程列表加载失败，请稍后重试');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCourses();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f9fd] text-slate-950 dark:bg-[#071023] dark:text-slate-50">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-[18%] h-[430px] w-[430px] rounded-full bg-blue-300/20 blur-3xl dark:bg-blue-500/10" />
        <div className="absolute bottom-[-160px] right-[12%] h-[520px] w-[520px] rounded-full bg-violet-300/25 blur-3xl dark:bg-violet-500/10" />
      </div>

      <header className="relative z-20 mx-auto flex w-full max-w-[1600px] items-center justify-between px-5 py-5 lg:px-8">
        <div className="flex items-center gap-4">
          <Link
            href="/student"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/75 text-slate-500 shadow-sm backdrop-blur-md transition hover:border-violet-200 hover:text-violet-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
            aria-label="返回学生首页"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Link href="/student" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-blue-500 text-white shadow-lg shadow-violet-500/20">
              <GraduationCap className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-[17px] font-bold tracking-tight">AI 学习画布</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                自由组织你的课程理解
              </span>
            </span>
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="切换主题"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/75 text-slate-500 shadow-sm backdrop-blur-md transition hover:text-violet-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-[1600px] justify-center px-5 pb-8 lg:px-8">
        <StudentLearningWorkspace courses={courses} loadingCourses={loading} standalone />
      </section>
    </main>
  );
}
