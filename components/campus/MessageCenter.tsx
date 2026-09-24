'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Mail, Send, UserRound } from 'lucide-react';
import { toast } from 'sonner';

interface Contact {
  id: string;
  displayName: string;
  role: 'teacher' | 'student';
}

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  subject: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export function MessageCenter({ homeHref }: { homeHref: string }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  async function load() {
    const response = await fetch('/api/campus/messages', { cache: 'no-store' });
    const payload = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      records?: Message[];
      contacts?: Contact[];
      currentUserId?: string;
      error?: string;
    };
    if (!response.ok || !payload.success) throw new Error(payload.error || '消息加载失败');
    const nextContacts = payload.contacts ?? [];
    setContacts(nextContacts);
    setMessages(payload.records ?? []);
    setCurrentUserId(payload.currentUserId ?? '');
    setSelectedId((current) => current || nextContacts[0]?.id || '');
  }

  useEffect(() => {
    void load()
      .then(() =>
        fetch('/api/campus/messages', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
      )
      .catch((error) => toast.error(error instanceof Error ? error.message : '消息加载失败'))
      .finally(() => setLoading(false));
  }, []);

  const selected = contacts.find((contact) => contact.id === selectedId);
  const thread = useMemo(
    () =>
      messages.filter(
        (message) =>
          (message.senderId === currentUserId && message.recipientId === selectedId) ||
          (message.senderId === selectedId && message.recipientId === currentUserId),
      ),
    [currentUserId, messages, selectedId],
  );

  async function sendMessage() {
    const content = draft.trim();
    if (!content || !selectedId) return;
    setSending(true);
    try {
      const response = await fetch('/api/campus/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: selectedId, body: content }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        message?: Message;
        error?: string;
      };
      if (!response.ok || !payload.success || !payload.message) {
        throw new Error(payload.error || '发送失败');
      }
      setMessages((current) => [...current, payload.message!]);
      setDraft('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '发送失败');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 text-slate-950 dark:bg-[#071023] dark:text-slate-50 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href={homeHref}
          className="mb-5 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-600"
        >
          <ArrowLeft className="h-4 w-4" /> 返回工作台
        </Link>
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
            <Mail className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-3xl font-bold">站内消息</h1>
            <p className="mt-1 text-sm text-slate-500">
              与你有课程关系的老师或学生可以在这里联系。
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-96 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
          </div>
        ) : (
          <div className="grid min-h-[620px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-900/[0.05] dark:border-white/10 dark:bg-slate-900 md:grid-cols-[270px_1fr]">
            <aside className="border-b border-slate-200 p-3 dark:border-white/10 md:border-b-0 md:border-r">
              <p className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                联系人
              </p>
              {contacts.length ? (
                contacts.map((contact) => {
                  const unread = messages.filter(
                    (message) =>
                      message.senderId === contact.id &&
                      message.recipientId === currentUserId &&
                      !message.readAt,
                  ).length;
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => setSelectedId(contact.id)}
                      className={`mb-1 flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${selectedId === contact.id ? 'bg-violet-50 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm dark:bg-white/10">
                        <UserRound className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {contact.displayName}
                        </span>
                        <span className="text-xs text-slate-400">
                          {contact.role === 'teacher' ? '教师' : '学生'}
                        </span>
                      </span>
                      {unread ? (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">
                          {unread}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              ) : (
                <p className="px-3 py-10 text-center text-sm text-slate-400">
                  加入班级或发布课程后，这里会出现联系人。
                </p>
              )}
            </aside>

            <section className="flex min-h-[520px] flex-col">
              {selected ? (
                <>
                  <header className="border-b border-slate-100 px-6 py-5 dark:border-white/10">
                    <h2 className="font-bold">{selected.displayName}</h2>
                    <p className="text-xs text-slate-400">
                      {selected.role === 'teacher' ? '任课教师' : '班级学生'}
                    </p>
                  </header>
                  <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/60 p-5 dark:bg-black/10 sm:p-7">
                    {thread.length ? (
                      thread.map((message) => {
                        const mine = message.senderId === currentUserId;
                        return (
                          <div
                            key={message.id}
                            className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 ${mine ? 'rounded-br-md bg-violet-600 text-white' : 'rounded-bl-md bg-white text-slate-700 shadow-sm dark:bg-white/10 dark:text-slate-100'}`}
                            >
                              <p className="whitespace-pre-wrap break-words">{message.body}</p>
                              <p
                                className={`mt-1 text-[10px] ${mine ? 'text-white/60' : 'text-slate-400'}`}
                              >
                                {new Date(message.createdAt).toLocaleString('zh-CN', {
                                  month: 'numeric',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-400">
                        还没有消息，可以从课程安排或学习问题开始交流。
                      </div>
                    )}
                  </div>
                  <div className="border-t border-slate-100 p-4 dark:border-white/10 sm:p-5">
                    <div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-violet-300 dark:border-white/10 dark:bg-white/5">
                      <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            void sendMessage();
                          }
                        }}
                        maxLength={4000}
                        rows={2}
                        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                        className="min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
                      />
                      <button
                        type="button"
                        disabled={!draft.trim() || sending}
                        onClick={() => void sendMessage()}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white disabled:opacity-40"
                      >
                        {sending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-400">
                  暂无可联系的老师或学生。
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
