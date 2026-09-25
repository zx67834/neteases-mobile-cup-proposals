'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, BookOpen, LockKeyhole, Save, UserRound } from 'lucide-react';
import { ProviderConfigPanel } from '@/components/settings/provider-config-panel';
import { PROVIDERS } from '@/lib/ai/providers';
import type { ProvidersConfig } from '@/lib/types/settings';

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
  const [section, setSection] = useState<'profile' | 'model'>('model');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function load() {
    const response = await fetch('/api/auth/account', { cache: 'no-store' });
    if (!response.ok) throw new Error('账号设置加载失败');
    const next = (await response.json()) as AccountData;
    setData(next);
    setModelId(next.model.modelId);
    if (next.user.role === 'admin') setSection('profile');
  }

  useEffect(() => {
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

  function submitModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save('model', { modelId, apiKey });
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
  const deepseekProvider = PROVIDERS.deepseek;
  const deepseekConfig = {
    deepseek: {
      apiKey,
      baseUrl: '',
      models: deepseekProvider.models,
      name: deepseekProvider.name,
      type: deepseekProvider.type,
      defaultBaseUrl: deepseekProvider.defaultBaseUrl,
      icon: deepseekProvider.icon,
      requiresApiKey: deepseekProvider.requiresApiKey,
      isBuiltIn: true,
    },
  } as ProvidersConfig;

  return (
    <main className="min-h-screen bg-[#f6f8fd] px-5 py-8 text-slate-900 dark:bg-[#071023] dark:text-slate-100">
      <div className="mx-auto max-w-6xl">
        <Link
          href={home}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-600"
        >
          <ArrowLeft className="h-4 w-4" /> 返回工作台
        </Link>
        <h1 className="mt-8 text-3xl font-bold">账号设置</h1>
        <p className="mt-2 text-sm text-slate-500">管理个人资料和专属 AI 服务商配置。</p>
        {notice ? (
          <p
            role="status"
            className="mt-5 rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-700"
          >
            {notice}
          </p>
        ) : null}
        {!data ? (
          <p className="mt-10 text-slate-500">正在加载…</p>
        ) : (
          <div className="mt-7 grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 md:grid-cols-[210px_minmax(0,1fr)]">
            <nav className="border-b border-slate-200 p-4 dark:border-white/10 md:min-h-[650px] md:border-b-0 md:border-r">
              <p className="px-3 pb-3 text-xs font-semibold tracking-wider text-slate-400">
                账号配置
              </p>
              <button
                type="button"
                onClick={() => setSection('profile')}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${section === 'profile' ? 'bg-violet-50 font-semibold text-violet-700 dark:bg-violet-500/15' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5'}`}
              >
                <UserRound className="h-4 w-4" /> 个人资料
              </button>
              {data.user.role !== 'admin' ? (
                <button
                  type="button"
                  onClick={() => setSection('model')}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${section === 'model' ? 'bg-violet-50 font-semibold text-violet-700 dark:bg-violet-500/15' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                >
                  <BookOpen className="h-4 w-4" /> 语言模型
                </button>
              ) : null}
            </nav>
            {section === 'profile' ? (
              <div className="space-y-5 p-5 md:p-7">
                <form
                  onSubmit={submitProfile}
                  className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900"
                >
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <UserRound className="h-5 w-5 text-violet-600" /> 个人资料
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    当前身份：
                    {data.user.role === 'teacher'
                      ? '教师'
                      : data.user.role === 'student'
                        ? '学生'
                        : '教务'}
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
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-4 py-3 dark:border-white/15"
                      />
                    </label>
                    <label className="text-sm">
                      显示名称
                      <input
                        name="displayName"
                        required
                        maxLength={50}
                        defaultValue={data.user.displayName}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-4 py-3 dark:border-white/15"
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      真实姓名
                      <input
                        name="realName"
                        maxLength={50}
                        defaultValue={data.user.realName}
                        placeholder="选填"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-4 py-3 dark:border-white/15"
                      />
                    </label>
                  </div>
                  <button
                    disabled={busy}
                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" /> 保存资料
                  </button>
                </form>
                <form
                  onSubmit={submitPassword}
                  className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900"
                >
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <LockKeyhole className="h-5 w-5 text-violet-600" /> 修改密码
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">修改后，其他设备的登录会失效。</p>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm sm:col-span-2">
                      当前密码
                      <input
                        name="currentPassword"
                        type="password"
                        required
                        autoComplete="current-password"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-4 py-3 dark:border-white/15"
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
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-4 py-3 dark:border-white/15"
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
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-4 py-3 dark:border-white/15"
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
            ) : null}
            {section === 'model' && data.user.role !== 'admin' ? (
              <div className="grid min-w-0 md:grid-cols-[190px_minmax(0,1fr)]">
                <div className="border-b border-slate-200 p-4 dark:border-white/10 md:border-b-0 md:border-r">
                  <p className="px-2 pb-3 text-xs font-semibold tracking-wider text-slate-400">
                    服务商
                  </p>
                  <div className="flex items-center gap-3 rounded-xl border border-violet-300 bg-violet-50 px-3 py-3 text-sm font-semibold text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200">
                    <img src="/logos/deepseek.svg" alt="" className="h-5 w-5" /> DeepSeek
                  </div>
                  <p className="px-2 pt-4 text-xs leading-5 text-slate-400">
                    当前测试阶段仅开放此服务商；每个账号的密钥独立保存。
                  </p>
                </div>
                <form onSubmit={submitModel} className="min-w-0 p-5 md:p-7">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-5 dark:border-white/10">
                    <img src="/logos/deepseek.svg" alt="" className="h-8 w-8" />
                    <div>
                      <h2 className="text-xl font-semibold">DeepSeek</h2>
                      <p className="text-xs text-slate-500">
                        OpenAI 兼容协议 · https://api.deepseek.com/v1
                      </p>
                    </div>
                  </div>
                  <p className="mt-5 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">
                    {data.model.hasPersonalKey
                      ? '当前使用你独立保存的 API Key。'
                      : data.model.hasAvailableKey
                        ? '当前使用服务器的实验测试 Key。'
                        : '目前尚无可用 Key，请填入你自己的 Key。'}
                  </p>
                  <div className="mt-7">
                    <ProviderConfigPanel
                      provider={deepseekProvider}
                      initialApiKey={apiKey}
                      initialBaseUrl=""
                      initialRequiresApiKey
                      providersConfig={deepseekConfig}
                      onConfigChange={(nextApiKey) => setApiKey(nextApiKey)}
                      onSave={() => undefined}
                      onEditModel={() => undefined}
                      onDeleteModel={() => undefined}
                      onAddModel={() => undefined}
                      isBuiltIn
                      verifyEndpoint="/api/auth/account/verify-model"
                      hasStoredApiKey={data.model.hasPersonalKey}
                      hasAvailableApiKey={data.model.hasAvailableKey}
                      selectedModelId={modelId}
                      onSelectModel={setModelId}
                      modelsReadOnly
                      showBaseUrl={false}
                      showRequiresApiKeyToggle={false}
                    />
                  </div>
                  <div className="mt-7 flex flex-wrap gap-3 border-t border-slate-100 pt-5 dark:border-white/10">
                    <button
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" /> 保存模型设置
                    </button>
                    {data.model.hasPersonalKey ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void save('model', { modelId, resetKey: true })}
                        className="rounded-xl border border-slate-200 px-5 py-3 text-sm dark:border-white/15"
                      >
                        改用测试 Key
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
