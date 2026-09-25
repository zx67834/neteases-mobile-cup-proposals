'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  BookOpenCheck,
  ChevronDown,
  LogOut,
  Mail,
  RefreshCw,
  Settings,
  UserRound,
  Wrench,
} from 'lucide-react';

export function AccountDock({
  displayName,
  role,
  inviteCode,
  floating = true,
}: {
  displayName: string;
  role: string;
  inviteCode?: string;
  floating?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function leaveSession(mode: 'switch' | 'logout') {
    if (pending) return;
    setPending(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      window.location.replace(`/login?${mode}=1`);
    }
  }

  return (
    <div className={floating ? 'fixed bottom-5 left-5 z-[120]' : 'relative z-30'}>
      {open ? (
        <div
          className={`absolute right-0 z-50 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-white/10 dark:bg-slate-900 ${
            floating ? 'bottom-[calc(100%+10px)] left-0 right-auto' : 'top-[calc(100%+10px)]'
          }`}
        >
          <div className="border-b border-slate-100 px-3 py-2.5 dark:border-white/10">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <p className="mt-0.5 text-xs text-slate-400">当前身份：{role}</p>
          </div>
          {role === '教师' ? (
            <Link
              href="/teacher/courses"
              className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-500/10"
            >
              <BookOpenCheck className="h-4 w-4" />
              课程发布
            </Link>
          ) : null}
          {role === '教师' || role === '学生' ? (
            <Link
              href="/messages"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-500/10"
            >
              <Mail className="h-4 w-4" />
              站内消息
            </Link>
          ) : null}
          <Link
            href="/tools"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-500/10"
          >
            <Wrench className="h-4 w-4" />
            {role === '教师' ? '教师工具' : role === '学生' ? '学生工具' : '行政工具'}
          </Link>
          <Link
            href="/account"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-500/10"
          >
            <Settings className="h-4 w-4" />
            账号设置
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() => void leaveSession('switch')}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50 dark:hover:bg-violet-500/10"
          >
            <RefreshCw className="h-4 w-4" />
            切换账号
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void leaveSession('logout')}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/92 p-1.5 pl-2 text-sm shadow-xl backdrop-blur dark:border-white/10 dark:bg-slate-900/92">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="打开账号菜单"
          className="flex min-w-0 items-center gap-2 rounded-full px-1.5 py-1 transition hover:bg-slate-50 dark:hover:bg-white/5"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
            <UserRound className="h-4 w-4" />
          </span>
          <span className="max-w-28 truncate font-medium">{displayName}</span>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {inviteCode ? (
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(inviteCode)}
            title="点击复制课堂码"
            className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
          >
            课堂码 {inviteCode}
          </button>
        ) : null}
      </div>
    </div>
  );
}
