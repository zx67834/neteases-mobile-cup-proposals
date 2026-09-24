'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, GraduationCap, Loader2, LockKeyhole, UserRound } from 'lucide-react';

type Mode = 'login' | 'register';

export function LoginPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [role, setRole] = useState<'teacher' | 'student'>('student');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const payload = {
      username: String(form.get('username') ?? ''),
      password: String(form.get('password') ?? ''),
      ...(mode === 'register' ? { displayName: String(form.get('displayName') ?? ''), role } : {}),
    };
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        redirectTo?: string;
      };
      if (!response.ok) throw new Error(result.error || result.message || '操作失败，请稍后重试');
      const requestedPath = new URLSearchParams(window.location.search).get('next');
      const safeRequestedPath =
        requestedPath?.startsWith('/') && !requestedPath.startsWith('//') ? requestedPath : null;
      router.replace(safeRequestedPath || result.redirectTo || '/student');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败，请稍后重试');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-[#f6f8fd] text-slate-950 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#081126] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(124,58,237,0.38),transparent_35%),radial-gradient(circle_at_80%_75%,rgba(59,130,246,0.3),transparent_40%)]" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
            <GraduationCap className="h-7 w-7" />
          </span>
          <div>
            <p className="text-xl font-bold">智慧课堂</p>
            <p className="text-sm text-white/55">AI 教学与学习工作台</p>
          </div>
        </div>
        <div className="relative max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-violet-300">
            OpenMAIC Campus
          </p>
          <h1 className="mt-5 text-5xl font-bold leading-tight">
            一套课程内容，连接教师备课与学生学习。
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-white/65">
            教师生成和发布课程，学生进入同一份课堂内容，并把答疑、练习和可视化笔记沉淀到自己的账号。
          </p>
        </div>
        <p className="relative text-sm text-white/40">数据由本地 PostgreSQL 持久保存</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-9 lg:hidden">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-white">
              <GraduationCap className="h-7 w-7" />
            </span>
            <h1 className="mt-4 text-2xl font-bold">智慧课堂</h1>
          </div>
          <div className="rounded-[30px] border border-white bg-white/90 p-7 shadow-2xl shadow-slate-900/[0.08] sm:p-9">
            <div className="flex rounded-2xl bg-slate-100 p-1">
              {(['login', 'register'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setMode(item);
                    setError('');
                  }}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    mode === item ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {item === 'login' ? '登录' : '创建账号'}
                </button>
              ))}
            </div>

            <div className="mb-7 mt-8">
              <h2 className="text-2xl font-bold">
                {mode === 'login' ? '欢迎回来' : '开始使用智慧课堂'}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {mode === 'login'
                  ? '登录后进入与你身份匹配的工作台。'
                  : '先选择身份，后续可由教务端统一管理。'}
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {mode === 'register' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole('student')}
                      className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-medium ${
                        role === 'student'
                          ? 'border-violet-500 bg-violet-50 text-violet-700'
                          : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      <GraduationCap className="h-4 w-4" />
                      学生
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('teacher')}
                      className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-medium ${
                        role === 'teacher'
                          ? 'border-violet-500 bg-violet-50 text-violet-700'
                          : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      <BookOpen className="h-4 w-4" />
                      教师
                    </button>
                  </div>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">姓名</span>
                    <input
                      name="displayName"
                      required
                      maxLength={50}
                      className="h-12 w-full rounded-2xl border border-slate-200 px-4 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                      placeholder="请输入姓名"
                    />
                  </label>
                </>
              ) : null}
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">账号</span>
                <div className="relative">
                  <UserRound className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                  <input
                    name="username"
                    required
                    autoComplete="username"
                    className="h-12 w-full rounded-2xl border border-slate-200 pl-12 pr-4 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                    placeholder="请输入账号"
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">密码</span>
                <div className="relative">
                  <LockKeyhole className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className="h-12 w-full rounded-2xl border border-slate-200 pl-12 pr-4 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                    placeholder="至少 8 位"
                  />
                </div>
              </label>
              {error ? (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
              ) : null}
              <button
                disabled={pending}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-blue-500 font-semibold text-white shadow-lg shadow-violet-500/20 transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {mode === 'login' ? '登录并进入工作台' : '创建账号'}
              </button>
            </form>

            {mode === 'login' ? (
              <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-500">
                演示账号：teacher_demo / student_demo / admin_demo
                <br />
                统一密码：Demo@123456
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
