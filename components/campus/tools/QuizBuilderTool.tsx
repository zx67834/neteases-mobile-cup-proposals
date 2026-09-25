'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import {
  PrimaryButton,
  SectionTitle,
  SoftInput,
  SoftTextarea,
  ToolCard,
  ToolShell,
} from '@/components/campus/tools/ToolShell';

interface Question {
  qtype: string;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
}

interface QuizRow {
  id: string;
  title: string;
  status: string;
  question_count?: number;
  submission_count?: number;
}

interface ClassroomOption {
  id: string;
  name: string;
  description?: string;
  sceneCount?: number;
  status?: string;
}

const JUDGE_OPTIONS = ['对', '错'];

function typeLabel(qtype: string) {
  const t = String(qtype || '').toLowerCase();
  if (t === 'choice' || t.includes('choice') || t.includes('选')) return '选择题';
  if (t === 'judge' || t.includes('judge') || t.includes('判断')) return '判断题';
  if (t === 'open' || t.includes('open') || t.includes('开放')) return '开放简答';
  if (t === 'short' || t.includes('short') || t.includes('简') || t.includes('填'))
    return '唯一解简答';
  return '题目';
}

function gradeModeLabel(qtype: string) {
  return qtype === 'open' ? '需 AI 批' : '自动判';
}

function normalizeQuestion(q: Question): Question {
  if (q.qtype === 'judge') {
    let answer = q.answer.trim();
    if (/^(对|正确|true|t|yes|√)/i.test(answer)) answer = '对';
    else if (/^(错|错误|false|f|no|×)/i.test(answer)) answer = '错';
    else if (answer !== '对' && answer !== '错') answer = '对';
    return { ...q, qtype: 'judge', options: [...JUDGE_OPTIONS], answer };
  }
  if (q.qtype === 'open') {
    return { ...q, qtype: 'open', options: [] };
  }
  if (q.qtype === 'short') {
    return { ...q, qtype: 'short', options: [] };
  }
  return q;
}

const fieldClass =
  'w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-500/15 dark:border-white/10 dark:bg-slate-950';

/** Classroom slides often embed HTML / LaTeX / theme colors — keep only teaching text. */
function sanitizeTeachingText(raw: string): string {
  const text = raw
    .replace(/\r\n/g, '\n')
    // Drop style blocks and tags first
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/?(br|p|div|li|h[1-6]|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    // Theme / design noise from slide JSON
    .replace(/#[0-9a-fA-F]{3,8}\b/g, ' ')
    .replace(/\b(?:rgb|rgba|hsl|hsla)\([^)]*\)/gi, ' ')
    .replace(
      /\b(?:font-size|text-align|font-weight|line-height|background|color)\s*:[^;\n]*/gi,
      ' ',
    )
    .replace(/\b(?:px|rem|em|vw|vh)\b/gi, ' ')
    // Soften common LaTeX into readable math (keep meaning for 出题)
    .replace(/\\forall/g, '任意')
    .replace(/\\exists/g, '存在')
    .replace(/\\Rightarrow|\\implies/g, '⇒')
    .replace(/\\rightarrow|\\to/g, '→')
    .replace(/\\varepsilon|\\epsilon/g, 'ε')
    .replace(/\\delta/g, 'δ')
    .replace(/\\infty/g, '∞')
    .replace(/\\leq|\\le/g, '≤')
    .replace(/\\geq|\\ge/g, '≥')
    .replace(/\\neq|\\ne/g, '≠')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\pm/g, '±')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\left|\\right/g, '')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\$+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  // Reject pure noise remnants
  if (!text) return '';
  if (/^[\d\s.,;:|/\\_-]+$/.test(text)) return '';
  if (!/[\u4e00-\u9fffA-Za-z]/.test(text)) return '';
  return text;
}

function isNoiseChunk(text: string): boolean {
  if (text.length < 2 || text.length > 600) return true;
  if (/^https?:\/\//i.test(text)) return true;
  if (/^[a-z0-9_-]{10,}$/i.test(text)) return true;
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return true;
  // Mostly punctuation / symbols left after strip
  const letters = text.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, '');
  return letters.length < 2;
}

/** Pull readable teaching text from a stage document for quiz generation. */
function extractClassroomSource(doc: unknown, fallbackName: string, fallbackDesc?: string): string {
  const lines: string[] = [`课题：${fallbackName}`];
  const desc = fallbackDesc ? sanitizeTeachingText(fallbackDesc) : '';
  if (desc) lines.push(`简介：${desc}`);

  const seen = new Set<string>();
  const push = (value: unknown) => {
    if (typeof value !== 'string') return;
    const text = sanitizeTeachingText(value);
    if (!text || isNoiseChunk(text) || seen.has(text)) return;
    // Skip duplicate of title line
    if (text === fallbackName || text === `课题：${fallbackName}`) return;
    seen.add(text);
    lines.push(text);
  };

  const preferredKeys = new Set([
    'title',
    'name',
    'description',
    'text',
    'content',
    'prompt',
    'subtitle',
    'body',
    'markdown',
    'summary',
    'question',
    'explanation',
    'label',
    'html',
    'innerHTML',
    'value',
  ]);

  const walk = (node: unknown, depth = 0) => {
    if (!node || depth > 10 || lines.length > 80) return;
    if (typeof node === 'string') {
      // Only take free strings at shallow-ish depth when they look like HTML/prose
      if (node.includes('<') || /[\u4e00-\u9fff]/.test(node) || node.includes('\\')) {
        push(node);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    for (const key of preferredKeys) {
      if (key in obj) push(obj[key]);
    }
    for (const [key, value] of Object.entries(obj)) {
      if (
        /image|audio|video|url|id|created|updated|owner|thumbnail|base64|embedding|color|palette|theme|style|css|font|width|height|x|y|zIndex|opacity|shadow|border|background|fill|stroke/i.test(
          key,
        )
      ) {
        continue;
      }
      if (preferredKeys.has(key)) continue;
      walk(value, depth + 1);
    }
  };

  walk(doc);
  return lines.join('\n').slice(0, 6000);
}

export function QuizBuilderTool() {
  const [sourceText, setSourceText] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [count, setCount] = useState(5);
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [records, setRecords] = useState<QuizRow[]>([]);
  const [pending, setPending] = useState(false);
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingClassroom, setLoadingClassroom] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/campus/tools/quizzes');
    const data = await res.json();
    if (res.ok) setRecords(data.records ?? []);
  }, []);

  const loadClassrooms = useCallback(async () => {
    setLoadingCourses(true);
    try {
      const res = await fetch('/api/campus/courses', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '课题列表加载失败');
      setClassrooms(data.records ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '课题列表加载失败');
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadClassrooms();
  }, [load, loadClassrooms]);

  async function pickClassroom(id: string) {
    setSelectedId(id);
    if (!id) return;
    const course = classrooms.find((c) => c.id === id);
    if (!course) return;

    setTitle(course.name);
    setLoadingClassroom(true);
    try {
      const res = await fetch(`/api/stages/${encodeURIComponent(course.id)}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const doc = await res.json();
        const extracted = extractClassroomSource(doc, course.name, course.description);
        setSourceText(extracted);
        toast.success(`已载入课题「${course.name}」内容`);
      } else {
        setSourceText(extractClassroomSource(null, course.name, course.description));
        toast.message('已选题，课堂正文暂不可读，将用课题名与简介出题');
      }
    } catch {
      setSourceText(extractClassroomSource(null, course.name, course.description));
      toast.message('已选题，将用课题名与简介出题');
    } finally {
      setLoadingClassroom(false);
    }
  }

  async function generate() {
    const cleaned = sanitizeTeachingText(sourceText) || sourceText.trim();
    if (!cleaned && !title.trim()) {
      toast.error('请先选择课题或粘贴知识点');
      return;
    }
    if (cleaned !== sourceText.trim()) setSourceText(cleaned);
    setPending(true);
    try {
      const res = await fetch('/api/campus/tools/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'quiz_generate',
          sourceText: cleaned || title.trim(),
          topic: title.trim() || undefined,
          difficulty,
          count,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '出题失败');
      setTitle(data.title || title || '');
      setQuestions(((data.questions || []) as Question[]).map(normalizeQuestion));
      toast.success(`已生成 ${data.questions?.length ?? 0} 题`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '出题失败');
    } finally {
      setPending(false);
    }
  }

  async function save(publish: boolean) {
    setPending(true);
    try {
      const res = await fetch('/api/campus/tools/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || '未命名练习',
          topic: title,
          difficulty,
          sourceText,
          publish,
          questions: questions.map(normalizeQuestion),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      toast.success(publish ? '已发布，学生可在「我的练习」作答' : '已存草稿');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setPending(false);
    }
  }

  async function togglePublish(quizId: string, currentStatus: string) {
    const action = currentStatus === 'published' ? 'unpublish' : 'publish';
    const res = await fetch('/api/campus/tools/quizzes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizId, action }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || (action === 'publish' ? '下发失败' : '收回失败'));
      return;
    }
    toast.success(
      action === 'publish' ? '已下发，学生可在「我的练习」作答' : '已退回下发，学生端不再显示',
    );
    await load();
  }

  return (
    <ToolShell
      title="智能出题"
      description="可从已生成课题选题出题，也可粘贴教材文本；发布后学生可练习。"
      eyebrow="出题 · Quiz"
    >
      <ToolCard>
        <SectionTitle
          icon={<Sparkles className="h-4 w-4" />}
          title="选题与出题"
          hint="选题后自动载入课堂文本，也可手动粘贴知识点。"
        />
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          从我的课题选择
        </label>
        <div className="relative">
          <select
            className={fieldClass}
            value={selectedId}
            disabled={loadingCourses || loadingClassroom}
            onChange={(e) => void pickClassroom(e.target.value)}
          >
            <option value="">
              {loadingCourses
                ? '正在加载课题…'
                : classrooms.length
                  ? '请选择已生成的课题'
                  : '暂无课题，可手动粘贴知识点'}
            </option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.status === 'published' ? '（已发布）' : c.status === 'draft' ? '（草稿）' : ''}
                {typeof c.sceneCount === 'number' ? ` · ${c.sceneCount} 页` : ''}
              </option>
            ))}
          </select>
          {loadingCourses || loadingClassroom ? (
            <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-violet-500" />
          ) : null}
        </div>

        <SoftInput
          className="mt-3"
          placeholder="练习标题（选题后自动填入，可改）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <SoftTextarea
          className="mt-3 min-h-36"
          placeholder="选题后自动载入课堂内容；也可手动粘贴知识点、课文或讲义…"
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <select
            className="rounded-2xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="easy">简单</option>
            <option value="medium">中等</option>
            <option value="hard">困难</option>
          </select>
          <input
            type="number"
            min={1}
            max={15}
            title="题量"
            className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950"
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 5)}
          />
          <span className="-ml-1 self-center text-xs text-slate-400">题</span>
          <PrimaryButton pending={pending || loadingClassroom} onClick={() => void generate()}>
            AI 出题
          </PrimaryButton>
        </div>
      </ToolCard>

      {questions.length ? (
        <ToolCard>
          <input
            className="mb-4 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold dark:border-white/10 dark:bg-slate-950"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <ol className="space-y-4 text-sm">
            {questions.map((q, i) => (
              <li
                key={i}
                className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5"
              >
                <p className="font-medium leading-7 text-slate-800 dark:text-slate-100">
                  <span className="mr-2 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                    {typeLabel(q.qtype)}
                  </span>
                  <span
                    className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      q.qtype === 'open'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    }`}
                  >
                    {gradeModeLabel(q.qtype)}
                  </span>
                  {i + 1}. {q.prompt}
                </p>
                {q.qtype === 'judge' ? (
                  <div className="mt-3 flex gap-2">
                    {JUDGE_OPTIONS.map((o) => (
                      <span
                        key={o}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                          q.answer === o
                            ? o === '对'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                              : 'border-rose-300 bg-rose-50 text-rose-700'
                            : 'border-slate-200 text-slate-400'
                        }`}
                      >
                        {o}
                        {q.answer === o ? '（答案）' : ''}
                      </span>
                    ))}
                  </div>
                ) : q.options?.length ? (
                  <ul className="mt-2 space-y-1 text-slate-600">
                    {q.options.map((o) => (
                      <li
                        key={o}
                        className={o === q.answer ? 'font-medium text-violet-700' : undefined}
                      >
                        {o}
                        {o === q.answer ? ' ✓' : ''}
                      </li>
                    ))}
                  </ul>
                ) : q.qtype === 'open' ? (
                  <p className="mt-2 text-amber-800 dark:text-amber-300">
                    参考模板：{q.answer || '（无）'}
                  </p>
                ) : (
                  <p className="mt-2 text-violet-700">标准答案：{q.answer || '（无）'}</p>
                )}
                {q.explanation ? (
                  <p className="mt-2 text-xs text-slate-500">解析：{q.explanation}</p>
                ) : null}
              </li>
            ))}
          </ol>
          <div className="mt-4 flex gap-3">
            <PrimaryButton pending={pending} onClick={() => void save(false)}>
              存草稿
            </PrimaryButton>
            <PrimaryButton pending={pending} onClick={() => void save(true)}>
              保存并发布
            </PrimaryButton>
          </div>
        </ToolCard>
      ) : null}

      <ToolCard>
        <h2 className="mb-1 font-semibold">我的练习卷</h2>
        <p className="mb-3 text-xs text-slate-500">
          「下发」给学生可见；「退回」撤回下发。不会影响已保存的题目内容。
        </p>
        <ul className="space-y-2 text-sm">
          {records.map((r) => {
            const published = r.status === 'published';
            return (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 px-4 py-3 dark:border-white/10"
              >
                <span className="min-w-0">
                  <span className="font-medium text-slate-900 dark:text-slate-50">{r.title}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {r.question_count ?? 0} 题 · 提交 {r.submission_count ?? 0} ·{' '}
                    {published ? '已下发' : '草稿'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void togglePublish(r.id, r.status)}
                  className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-semibold ${
                    published
                      ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      : 'bg-violet-600 text-white hover:bg-violet-500'
                  }`}
                >
                  {published ? '退回' : '下发'}
                </button>
              </li>
            );
          })}
          {!records.length ? <li className="text-slate-400">暂无</li> : null}
        </ul>
      </ToolCard>
    </ToolShell>
  );
}
