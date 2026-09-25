import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  FileText,
  Megaphone,
  MessageCircle,
  PenLine,
  Sparkles,
  Wrench,
} from 'lucide-react';

import type { CampusRole } from '@/lib/auth/campus-auth';
import { campusHomeForRole } from '@/lib/auth/campus-auth';

export interface CampusToolItem {
  id: string;
  title: string;
  description?: string;
  href?: string;
}

const ROLE_TITLE: Record<CampusRole, string> = {
  teacher: '教师工具',
  student: '学生工具',
  admin: '行政工具',
};

const ROLE_LABEL: Record<CampusRole, string> = {
  teacher: '教师',
  student: '学生',
  admin: '行政',
};

const ROLE_BLURB: Record<CampusRole, string> = {
  teacher: '备课、出题、批改与学情，结果会同步到学生与行政端。',
  student: '练习、口语与个人学情，数据回写教师看板。',
  admin: '运行审批、通知发布与全校学情预警。',
};

const TOOL_ICON: Record<string, typeof Wrench> = {
  'lesson-plan': BookOpen,
  'quiz-builder': Sparkles,
  grading: ClipboardCheck,
  insights: BarChart3,
  ops: FileText,
  notices: Megaphone,
  alerts: AlertTriangle,
  practice: PenLine,
  oral: MessageCircle,
  'my-insights': BarChart3,
  overview: BarChart3,
  'check-in': CalendarCheck,
};

/** Per-role tool catalog — linked across roles via campus_tool_* tables. */
export const TOOLS_BY_ROLE: Record<CampusRole, CampusToolItem[]> = {
  teacher: [
    {
      id: 'lesson-plan',
      title: '智能教案',
      description: '课题 → 结构化教案，可共享给学生',
      href: '/tools/lesson-plan',
    },
    {
      id: 'quiz-builder',
      title: '智能出题',
      description: '知识点/文本出题并发布到学生练习',
      href: '/tools/quiz-builder',
    },
    {
      id: 'grading',
      title: '作业批改',
      description: 'AI 批改文本作业，查看练习提交',
      href: '/tools/grading',
    },
    {
      id: 'check-in',
      title: '每日打卡',
      description: '发布打卡任务，查看班级打卡与计划完成',
      href: '/tools/check-in',
    },
    {
      id: 'insights',
      title: '学情看板',
      description: '本班练习均分与提交量',
      href: '/tools/insights',
    },
    {
      id: 'ops',
      title: '调课/监考申请',
      description: '提交运行事务，行政审批',
      href: '/tools/ops',
    },
    {
      id: 'notices',
      title: '通知与纪要',
      description: '查看/起草通知（与学生同源）',
      href: '/tools/notices',
    },
    {
      id: 'alerts',
      title: '学业预警',
      description: '正确率偏低学生列表',
      href: '/tools/alerts',
    },
  ],
  student: [
    {
      id: 'practice',
      title: '我的练习',
      description: '完成老师发布的练习卷',
      href: '/tools/practice',
    },
    {
      id: 'check-in',
      title: '每日打卡',
      description: '制定学习计划并完成每日打卡',
      href: '/tools/check-in',
    },
    {
      id: 'oral',
      title: '口语练习',
      description: '情景英语对话与评分',
      href: '/tools/oral',
    },
    {
      id: 'my-insights',
      title: '我的学情',
      description: '个人练习与口语报告',
      href: '/tools/my-insights',
    },
    {
      id: 'notices',
      title: '通知公告',
      description: '查看行政/教师发布的通知',
      href: '/tools/notices',
    },
  ],
  admin: [
    {
      id: 'ops',
      title: '教学运行审批',
      description: '审批调课、监考等申请',
      href: '/tools/ops',
    },
    {
      id: 'notices',
      title: '通知与纪要',
      description: '起草并发布全校通知',
      href: '/tools/notices',
    },
    {
      id: 'overview',
      title: '学情总览',
      description: '跨班练习与口语汇总',
      href: '/tools/overview',
    },
    {
      id: 'alerts',
      title: '学业预警',
      description: '按规则标红需关注学生',
      href: '/tools/alerts',
    },
  ],
};

export function ToolsCenter({
  role,
  displayName,
}: {
  role: CampusRole;
  displayName: string;
}) {
  const tools = TOOLS_BY_ROLE[role];
  const homeHref = campusHomeForRole(role);
  const title = ROLE_TITLE[role];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f7fb] text-slate-950 dark:bg-[#071023] dark:text-slate-50">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-violet-400/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-40 h-72 w-72 rounded-full bg-indigo-400/15 blur-3xl"
      />

      <div className="relative mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
        <Link
          href={homeHref}
          className="group mb-6 inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-violet-600"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
            <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-0.5" />
          </span>
          返回工作台
        </Link>

        <section className="relative mb-10 overflow-hidden rounded-[32px] border border-violet-200/50 bg-gradient-to-br from-violet-600 via-violet-600 to-indigo-600 p-7 text-white shadow-xl shadow-violet-600/25 sm:p-9">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/10 blur-2xl"
          />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
                <Wrench className="h-3.5 w-3.5" />
                {ROLE_LABEL[role]} · 工具箱
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-violet-50/90">
                {displayName}，{ROLE_BLURB[role]}
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-right text-sm backdrop-blur">
              <p className="text-violet-100">可用工具</p>
              <p className="text-2xl font-bold tabular-nums">{tools.length}</p>
            </div>
          </div>
        </section>

        {tools.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-white px-8 py-16 text-center shadow-sm dark:border-white/10 dark:bg-slate-900">
            <p className="text-lg font-semibold">工具即将上线</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool, index) => {
              const Icon = TOOL_ICON[tool.id] ?? Wrench;
              const card = (
                <div
                  className="group relative flex h-full flex-col overflow-hidden rounded-[26px] border border-slate-200/90 bg-white p-5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)] transition duration-300 hover:-translate-y-1 hover:border-violet-300 hover:shadow-[0_24px_50px_-24px_rgba(109,40,217,0.35)] dark:border-white/10 dark:bg-slate-900 dark:hover:border-violet-500/40"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 transition group-hover:scale-105 group-hover:bg-violet-600 group-hover:text-white dark:bg-violet-500/20 dark:text-violet-300">
                      <Icon className="h-5 w-5" />
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-violet-500" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold tracking-tight">{tool.title}</h2>
                  {tool.description ? (
                    <p className="mt-2 flex-1 text-sm leading-6 text-slate-500">{tool.description}</p>
                  ) : null}
                  <p className="mt-4 text-xs font-semibold text-violet-600 opacity-0 transition group-hover:opacity-100">
                    打开工具 →
                  </p>
                </div>
              );
              return tool.href ? (
                <Link key={tool.id} href={tool.href} className="block h-full">
                  {card}
                </Link>
              ) : (
                <div key={tool.id} className="h-full">
                  {card}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
