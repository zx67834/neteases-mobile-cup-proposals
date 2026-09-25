'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, FileText, Megaphone } from 'lucide-react';
import { toast } from 'sonner';

import {
  EmptyHint,
  PrimaryButton,
  SectionTitle,
  SoftInput,
  SoftTextarea,
  ToolCard,
  ToolShell,
  toolFieldClass,
} from '@/components/campus/tools/ToolShell';
import { stripPlainMarkup } from '@/lib/campus-tools/plain-text';

export function NoticesTool({ canPublish }: { canPublish: boolean }) {
  const [records, setRecords] = useState<
    Array<{ id: string; title: string; body: string; kind: string; author_name: string }>
  >([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<'notice' | 'minutes'>('notice');
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/campus/tools/notices');
    const data = await res.json();
    if (res.ok) setRecords(data.records ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function draft() {
    setPending(true);
    try {
      const res = await fetch('/api/campus/tools/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'notice_draft',
          noticeKind: kind,
          noticeDraft: title || body,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '起草失败');
      setBody(stripPlainMarkup(String(data.content || '')));
      toast.success('已生成草稿');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '起草失败');
    } finally {
      setPending(false);
    }
  }

  async function publish() {
    setPending(true);
    try {
      const plainTitle = stripPlainMarkup(title);
      const plainBody = stripPlainMarkup(body);
      const res = await fetch('/api/campus/tools/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: plainTitle, body: plainBody, kind, audience: 'all' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '发布失败');
      toast.success('已发布，师生工具箱可见');
      setTitle('');
      setBody('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发布失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <ToolShell
      title="通知与纪要"
      description="行政/教师起草并发布，学生端同源可见。"
      eyebrow="沟通 · Notices"
    >
      {canPublish ? (
        <ToolCard>
          <SectionTitle
            icon={<Megaphone className="h-4 w-4" />}
            title="起草发布"
            hint="可用 AI 先出草稿，再人工修订后发布。"
          />
          <div className="flex flex-wrap gap-2">
            <select
              className={toolFieldClass + ' w-auto min-w-[7rem]'}
              value={kind}
              onChange={(e) => setKind(e.target.value as 'notice' | 'minutes')}
            >
              <option value="notice">通知</option>
              <option value="minutes">纪要</option>
            </select>
            <SoftInput
              className="min-w-[12rem] flex-1"
              placeholder="标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <SoftTextarea
            className="mt-3 min-h-36"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="正文（纯文本）"
          />
          <div className="mt-4 flex gap-3">
            <PrimaryButton pending={pending} onClick={() => void draft()}>
              AI 起草
            </PrimaryButton>
            <PrimaryButton pending={pending} onClick={() => void publish()}>
              发布
            </PrimaryButton>
          </div>
        </ToolCard>
      ) : null}

      <ToolCard>
        <SectionTitle icon={<FileText className="h-4 w-4" />} title="已发布" />
        <ul className="space-y-3 text-sm">
          {records.map((n) => (
            <li
              key={n.id}
              className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 transition hover:border-violet-200 dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                  {n.kind === 'minutes' ? '纪要' : '通知'}
                </span>
                <p className="font-medium text-slate-900 dark:text-slate-50">
                  {stripPlainMarkup(n.title)}
                </p>
              </div>
              <p className="mt-1 text-xs text-slate-400">{n.author_name}</p>
              <pre className="mt-3 whitespace-pre-wrap font-sans leading-6 text-slate-700 dark:text-slate-200">
                {stripPlainMarkup(n.body)}
              </pre>
            </li>
          ))}
          {!records.length ? <EmptyHint>暂无通知</EmptyHint> : null}
        </ul>
      </ToolCard>
    </ToolShell>
  );
}

export function OpsTool({ isAdmin }: { isAdmin: boolean }) {
  const [records, setRecords] = useState<
    Array<{
      id: string;
      title: string;
      kind: string;
      detail: string;
      status: string;
      requester_name?: string;
    }>
  >([]);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [kind, setKind] = useState('reschedule');
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/campus/tools/ops');
    const data = await res.json();
    if (res.ok) setRecords(data.records ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setPending(true);
    try {
      const res = await fetch('/api/campus/tools/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, title, detail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提交失败');
      toast.success('已提交，等待行政审批');
      setTitle('');
      setDetail('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交失败');
    } finally {
      setPending(false);
    }
  }

  async function review(opsId: string, status: 'approved' | 'rejected') {
    const res = await fetch('/api/campus/tools/ops', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opsId, status, note: '' }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || '审批失败');
      return;
    }
    toast.success(status === 'approved' ? '已通过' : '已驳回');
    await load();
  }

  const statusTone = (status: string) => {
    if (status === 'approved') return 'bg-violet-100 text-violet-700';
    if (status === 'rejected') return 'bg-slate-200 text-slate-600';
    return 'bg-violet-50 text-violet-600';
  };

  return (
    <ToolShell
      title="教学运行"
      description="调课/监考申请；行政审批后教师可见状态。"
      eyebrow="事务 · Ops"
    >
      {!isAdmin ? (
        <ToolCard>
          <SectionTitle
            icon={<ClipboardList className="h-4 w-4" />}
            title="提交申请"
            hint="写清时间、班级与原因，便于行政快速审批。"
          />
          <select
            className={toolFieldClass}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="reschedule">调课</option>
            <option value="invigilation">监考</option>
            <option value="other">其他</option>
          </select>
          <SoftInput
            className="mt-3"
            placeholder="标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <SoftTextarea
            className="mt-3 min-h-24"
            placeholder="详情（时间、班级等）"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
          <div className="mt-4">
            <PrimaryButton pending={pending} onClick={() => void submit()}>
              提交申请
            </PrimaryButton>
          </div>
        </ToolCard>
      ) : null}

      <ToolCard>
        <SectionTitle
          icon={<ClipboardList className="h-4 w-4" />}
          title={isAdmin ? '待办与历史' : '我的申请'}
        />
        <ul className="space-y-3 text-sm">
          {records.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  {r.kind}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone(r.status)}`}>
                  {r.status}
                </span>
                <p className="font-medium text-slate-900 dark:text-slate-50">{r.title}</p>
              </div>
              <p className="mt-1 text-xs text-slate-400">{r.requester_name || '我'}</p>
              <p className="mt-2 leading-6 text-slate-600 dark:text-slate-300">{r.detail}</p>
              {isAdmin && r.status === 'pending' ? (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white"
                    onClick={() => void review(r.id, 'approved')}
                  >
                    通过
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                    onClick={() => void review(r.id, 'rejected')}
                  >
                    驳回
                  </button>
                </div>
              ) : null}
            </li>
          ))}
          {!records.length ? <EmptyHint>暂无申请</EmptyHint> : null}
        </ul>
      </ToolCard>
    </ToolShell>
  );
}
