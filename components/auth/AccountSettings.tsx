'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, LockKeyhole, Save, UserRound } from 'lucide-react';
import { SettingsDialog } from '@/components/settings';
import type { SettingsSection } from '@/lib/types/settings';

type AccountData = {
  user: { username: string; displayName: string; realName: string; role: string };
  model: {
    providerId: 'deepseek';
    modelId: string;
    hasPersonalKey: boolean;
    hasAvailableKey: boolean;
  };
};

export function AccountSettings() {
  const [data, setData] = useState<AccountData | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState('deepseek-flash');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [initialSection, setInitialSection] = useState<SettingsSection>('providers');

  async function load() {
    const response = await fetch('/api/auth/account', { cache: 'no-store' });
    if (!response.ok) throw new Error('账号设置加载失败');
    const next = (await response.json()) as AccountData;
    setData(next);
    setModelId(next.model.modelId);
  }

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('section');
    const sections: SettingsSection[] = [
      'profile',
      'providers',
      'token-plan',
      'image',
      'video',
      'tts',
      'asr',
      'pdf',
      'web-search',
      'skills',
      'general',
    ];
    if (requested && sections.includes(requested as SettingsSection))
      setInitialSection(requested as SettingsSection);
    void load().catch((error) => setNotice(error.message));
  }, []);

  async function save(section: 'profile' | 'model' | 'password', payload: Record<string, unknown>) {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/auth/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, ...payload }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || '保存失败');
      setApiKey('');
      await load();
      setNotice('已保存');
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存失败');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void save('profile', {
      username: String(form.get('username') ?? ''),
      displayName: String(form.get('displayName') ?? ''),
      realName: String(form.get('realName') ?? ''),
    });
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get('newPassword') ?? '');
    if (newPassword !== form.get('confirmPassword')) {
      setNotice('两次输入的新密码不一致');
      return;
    }
    void save('password', {
      currentPassword: String(form.get('currentPassword') ?? ''),
      newPassword,
    }).then((ok) => {
      if (ok) formElement.reset();
    });
  }

  const home =
    data?.user.role === 'teacher'
      ? '/teacher'
      : data?.user.role === 'admin'
        ? '/admin'
        : '/student';
  const profileContent = data ? (
    <div className="space-y-5">
      <form onSubmit={submitProfile} className="rounded-2xl border p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <UserRound className="h-5 w-5 text-violet-600" />
          个人资料
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          当前身份：
          {data.user.role === 'teacher' ? '教师' : data.user.role === 'student' ? '学生' : '教务'}
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            登录账号
            <input
              name="username"
              required
              minLength={3}
              maxLength={32}
              defaultValue={data.user.username}
              className="mt-2 w-full rounded-xl border bg-transparent px-4 py-3"
            />
          </label>
          <label className="text-sm">
            显示名称
            <input
              name="displayName"
              required
              maxLength={50}
              defaultValue={data.user.displayName}
              className="mt-2 w-full rounded-xl border bg-transparent px-4 py-3"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            真实姓名
            <input
              name="realName"
              maxLength={50}
              defaultValue={data.user.realName}
              placeholder="选填"
              className="mt-2 w-full rounded-xl border bg-transparent px-4 py-3"
            />
          </label>
        </div>
        <button
          disabled={busy}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          保存资料
        </button>
      </form>
      <form onSubmit={submitPassword} className="rounded-2xl border p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <LockKeyhole className="h-5 w-5 text-violet-600" />
          修改密码
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">修改后，其他设备的登录会失效。</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            当前密码
            <input
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              className="mt-2 w-full rounded-xl border bg-transparent px-4 py-3"
            />
          </label>
          <label className="text-sm">
            新密码
            <input
              name="newPassword"
              type="password"
              required
              minLength={8}
              maxLength={200}
              autoComplete="new-password"
              className="mt-2 w-full rounded-xl border bg-transparent px-4 py-3"
            />
          </label>
          <label className="text-sm">
            确认新密码
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              maxLength={200}
              autoComplete="new-password"
              className="mt-2 w-full rounded-xl border bg-transparent px-4 py-3"
            />
          </label>
        </div>
        <button
          disabled={busy}
          className="mt-6 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          更新密码
        </button>
      </form>
    </div>
  ) : null;

  return (
    <main className="min-h-screen bg-[#f6f8fd] px-5 py-8 text-slate-900 dark:bg-[#071023] dark:text-slate-100">
      <div className="mx-auto max-w-7xl">
        <Link
          href={home}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-600"
        >
          <ArrowLeft className="h-4 w-4" />
          返回工作台
        </Link>
        <h1 className="mt-8 text-3xl font-bold">账号设置</h1>
        <p className="mt-2 text-sm text-slate-500">管理个人资料与 OpenMAIC 的完整 AI 设置。</p>
        {notice && (
          <p
            role="status"
            className="mt-5 rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-700"
          >
            {notice}
          </p>
        )}
        {!data ? (
          <p className="mt-10 text-slate-500">正在加载…</p>
        ) : (
          <div className="mt-7">
            <SettingsDialog
              open
              onOpenChange={(next) => {
                if (!next) window.location.assign(home);
              }}
              embedded
              initialSection={data.user.role === 'admin' ? 'profile' : initialSection}
              profileContent={profileContent}
              accountModel={
                data.user.role === 'admin'
                  ? undefined
                  : {
                      apiKey,
                      modelId,
                      hasPersonalKey: data.model.hasPersonalKey,
                      hasAvailableKey: data.model.hasAvailableKey,
                      onApiKeyChange: setApiKey,
                      onModelChange: setModelId,
                      onSave: () => {
                        void save('model', { modelId, apiKey });
                      },
                      onResetKey: () => {
                        void save('model', { modelId, resetKey: true });
                      },
                    }
              }
            />
          </div>
        )}
      </div>
    </main>
  );
}
