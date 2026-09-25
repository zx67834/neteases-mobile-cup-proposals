'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/** Shared campus-tools chrome. Palette locked to existing violet / slate. */

export function ToolShell({
  title,
  description,
  eyebrow = 'Campus Tools',
  actions,
  children,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f7fb] text-slate-950 dark:bg-[#071023] dark:text-slate-50">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,_rgba(139,92,246,0.16),_transparent_58%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 top-48 h-56 w-56 rounded-full bg-indigo-400/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-8">
        <Link
          href="/tools"
          className="group mb-6 inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-violet-600"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 shadow-sm transition group-hover:border-violet-200 group-hover:text-violet-600 dark:border-white/10 dark:bg-slate-900/80">
            <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-0.5" />
          </span>
          返回工具箱
        </Link>

        <header className="relative mb-8 overflow-hidden rounded-[28px] border border-violet-200/60 bg-gradient-to-br from-violet-600 via-violet-600 to-indigo-600 p-6 text-white shadow-lg shadow-violet-600/20 sm:p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl"
          />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-100/90">
                {eyebrow}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
              {description ? (
                <p className="mt-3 max-w-2xl text-sm leading-6 text-violet-50/90">{description}</p>
              ) : null}
            </div>
            {actions ? <div className="relative shrink-0">{actions}</div> : null}
          </div>
        </header>

        <div className="space-y-6">{children}</div>
      </div>
    </main>
  );
}

export function ToolCard({
  children,
  className = '',
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  return (
    <div
      className={`rounded-[28px] border border-slate-200/90 bg-white/95 p-6 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)] backdrop-blur-sm transition duration-300 hover:border-violet-200/80 dark:border-white/10 dark:bg-slate-900/90 dark:hover:border-violet-500/30 ${className}`}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  icon,
  title,
  hint,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
              {icon}
            </span>
          ) : (
            <span className="h-5 w-1 rounded-full bg-violet-500" />
          )}
          <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            {title}
          </h2>
        </div>
        {hint ? <p className="mt-1.5 pl-10 text-xs leading-5 text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-violet-50/60 p-4 dark:border-white/10 dark:from-slate-900 dark:to-violet-950/20">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-violet-700 dark:text-violet-300">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-400 dark:border-white/10 dark:bg-white/5">
      {children}
    </div>
  );
}

export function PrimaryButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { pending?: boolean },
) {
  const { pending, className = '', children, ...rest } = props;
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || pending}
      className={`inline-flex items-center justify-center gap-1.5 rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-600/25 transition hover:bg-violet-500 hover:shadow-violet-500/30 active:scale-[0.98] disabled:opacity-50 ${className}`}
    >
      {pending ? '处理中…' : children}
    </button>
  );
}

export function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', children, ...rest } = props;
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200 ${className}`}
    >
      {children}
    </button>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
      {children}
    </label>
  );
}

export function SoftInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { as?: 'input' },
) {
  return (
    <input
      {...props}
      className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-500/15 dark:border-white/10 dark:bg-slate-950 ${props.className || ''}`}
    />
  );
}

export function SoftTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-500/15 dark:border-white/10 dark:bg-slate-950 ${props.className || ''}`}
    />
  );
}

export const toolFieldClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-500/15 dark:border-white/10 dark:bg-slate-950';
