'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, FileText, Loader2, Share2, X } from 'lucide-react';
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

/** @deprecated use stripPlainMarkup — kept for existing imports */
export const stripLessonMarkup = stripPlainMarkup;

interface ClassroomOption {
  id: string;
  name: string;
  description?: string;
  sceneCount?: number;
  status?: string;
}

interface LessonRecord {
  id: string;
  title: string;
  subject: string;
  grade: string;
  duration: string;
  content: string;
  shared: boolean;
  status?: 'draft' | 'saved' | string;
  teacher_name?: string;
  updated_at?: string;
  created_at?: string;
}

type LessonEditorDraft = {
  id?: string;
  title: string;
  subject: string;
  grade: string;
  duration: string;
  content: string;
  shared: boolean;
  status?: 'draft' | 'saved';
};

function formatDay(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function statusLabel(lesson: Pick<LessonRecord, 'status' | 'shared'>) {
  if (lesson.status === 'draft') return '草稿';
  if (lesson.shared) return '已共享';
  return '已保存';
}

/** Read-only modal for students / admins. */
function LessonReadModal({
  lesson,
  onClose,
  heading = '共享教案',
}: {
  lesson: LessonRecord;
  onClose: () => void;
  heading?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lesson-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/10">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {heading}
            </p>
            <h2
              id="lesson-modal-title"
              className="mt-1 truncate text-lg font-semibold text-slate-900 dark:text-slate-50"
            >
              {lesson.title}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {[
                lesson.teacher_name,
                lesson.subject,
                lesson.grade,
                lesson.duration,
                formatDay(lesson.updated_at || lesson.created_at),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <article className="whitespace-pre-wrap text-[15px] leading-8 text-slate-700 dark:text-slate-200">
            {stripPlainMarkup(lesson.content || '')}
          </article>
        </div>
      </div>
    </div>
  );
}

/** Editable lesson modal: generate result + library open both use this. */
function LessonEditorModal({
  draft,
  heading = '我的教案',
  saving,
  onChange,
  onClose,
  onSaveDraft,
  onSave,
}: {
  draft: LessonEditorDraft;
  heading?: string;
  saving: boolean;
  onChange: (next: LessonEditorDraft) => void;
  onClose: () => void;
  onSaveDraft: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lesson-editor-title"
      onClick={saving ? undefined : onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/10">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {heading}
            </p>
            <SoftInput
              id="lesson-editor-title"
              className="mt-2 font-semibold"
              placeholder="教案标题 *"
              value={draft.title}
              disabled={saving}
              onChange={(e) => onChange({ ...draft, title: e.target.value })}
            />
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <SoftInput
                placeholder="学科"
                value={draft.subject}
                disabled={saving}
                onChange={(e) => onChange({ ...draft, subject: e.target.value })}
              />
              <SoftInput
                placeholder="年级"
                value={draft.grade}
                disabled={saving}
                onChange={(e) => onChange({ ...draft, grade: e.target.value })}
              />
              <SoftInput
                placeholder="课时"
                value={draft.duration}
                disabled={saving}
                onChange={(e) => onChange({ ...draft, duration: e.target.value })}
              />
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭"
            disabled={saving}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-white/10"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <SoftTextarea
            rows={14}
            placeholder="在此编辑教案正文…"
            value={draft.content}
            disabled={saving}
            onChange={(e) => onChange({ ...draft, content: e.target.value })}
            className="min-h-[280px] resize-y leading-7"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 dark:border-white/10">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={draft.shared}
              disabled={saving}
              onChange={(e) => onChange({ ...draft, shared: e.target.checked })}
            />
            共享给学生
          </label>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onSaveDraft}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/5"
            >
              {saving ? '处理中…' : '存为草稿'}
            </button>
            <PrimaryButton pending={saving} onClick={onSave}>
              保存
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LessonPlanTool() {
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [shared, setShared] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(true);
  const [editor, setEditor] = useState<LessonEditorDraft | null>(null);

  const selected = classrooms.find((c) => c.id === selectedId);
  const fieldClass = toolFieldClass;

  const loadClassrooms = useCallback(async () => {
    setLoadingCourses(true);
    try {
      const res = await fetch('/api/campus/courses', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '课堂列表加载失败');
      setClassrooms(data.records ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '课堂列表加载失败');
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  const loadLessons = useCallback(async () => {
    setLoadingLessons(true);
    try {
      const res = await fetch('/api/campus/tools/lessons', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '教案列表加载失败');
      setLessons(data.records ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '教案列表加载失败');
    } finally {
      setLoadingLessons(false);
    }
  }, []);

  useEffect(() => {
    void loadClassrooms();
    void loadLessons();
  }, [loadClassrooms, loadLessons]);

  function pickClassroom(id: string) {
    setSelectedId(id);
    if (!id) return;
    const course = classrooms.find((c) => c.id === id);
    if (!course) return;
    setTopic(course.name);
  }

  function openLibraryLesson(lesson: LessonRecord) {
    setEditor({
      id: lesson.id,
      title: lesson.title,
      subject: lesson.subject || '',
      grade: lesson.grade || '',
      duration: lesson.duration || '45分钟',
      content: stripLessonMarkup(lesson.content || ''),
      shared: Boolean(lesson.shared),
      status: lesson.status === 'draft' ? 'draft' : 'saved',
    });
  }

  async function generate() {
    if (!topic.trim()) {
      toast.error('请先选择课堂或填写课题');
      return;
    }
    if (generating) return;
    setGenerating(true);
    try {
      const sourceText = selected
        ? `关联课堂：${selected.name}\n页数：${selected.sceneCount ?? 0}\n简介：${selected.description || '无'}`
        : '';
      const res = await fetch('/api/campus/tools/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'lesson_plan',
          topic,
          subject,
          grade,
          duration: '45分钟',
          sourceText,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '生成失败');
      const next = stripLessonMarkup(String((data as { content?: string }).content || ''));
      if (!next) throw new Error('生成结果为空，请重试');
      setEditor({
        title: topic.trim() ? `《${topic.trim()}》教案` : '未命名教案',
        subject: subject.trim(),
        grade: grade.trim(),
        duration: '45分钟',
        content: next,
        shared,
      });
      toast.success('教案已生成，可在弹窗中编辑后保存');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  }

  async function persist(status: 'draft' | 'saved') {
    if (!editor) return;
    const title = editor.title.trim();
    const content = stripLessonMarkup(editor.content).trim();
    if (!title || !content) {
      toast.error('请填写标题和教案内容');
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/campus/tools/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editor.id,
          title,
          subject: editor.subject.trim(),
          grade: editor.grade.trim(),
          duration: editor.duration.trim() || '45分钟',
          content,
          shared: status === 'draft' ? false : editor.shared,
          status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          (data as { error?: string; details?: string }).error ||
          (data as { details?: string }).details ||
          '保存失败';
        throw new Error(msg);
      }
      setSaving(false);
      setEditor(null);
      if (status === 'draft') {
        toast.success('已存为草稿');
      } else if (editor.shared) {
        toast.success('已保存并共享：学生可在「共享教案」中查看');
      } else {
        toast.success('已保存到「我的教案」');
      }
      void loadLessons();
      return;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ToolShell
      title="智能教案"
      description="生成后弹出编辑窗：可改内容，右下角存草稿或保存。教案库条目同样可编辑。"
      eyebrow="备课 · Lesson"
    >
      <ToolCard>
        <SectionTitle
          icon={<FileText className="h-4 w-4" />}
          title="选题与生成"
          hint="优先从课堂选题，也可手动填写课题后一键生成。"
        />
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          从我的课堂选择课题
        </label>
        <div className="relative">
          <select
            className={fieldClass}
            value={selectedId}
            disabled={loadingCourses || generating}
            onChange={(e) => pickClassroom(e.target.value)}
          >
            <option value="">
              {loadingCourses
                ? '正在加载课堂…'
                : classrooms.length
                  ? '请选择已生成的课堂'
                  : '暂无课堂，可手动填写课题'}
            </option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.status === 'published' ? '（已发布）' : c.status === 'draft' ? '（草稿）' : ''}
                {typeof c.sceneCount === 'number' ? ` · ${c.sceneCount} 页` : ''}
              </option>
            ))}
          </select>
          {loadingCourses ? (
            <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-violet-500" />
          ) : null}
        </div>
        {selected ? (
          <p className="mt-2 text-xs text-slate-500">
            已选课堂将作为教案课题；生成时会参考课堂简介。
            {selected.description ? ` 简介：${selected.description.slice(0, 80)}` : ''}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SoftInput
            placeholder="课题 *（可改）"
            value={topic}
            disabled={generating}
            onChange={(e) => setTopic(e.target.value)}
          />
          <SoftInput
            placeholder="学科"
            value={subject}
            disabled={generating}
            onChange={(e) => setSubject(e.target.value)}
          />
          <SoftInput
            placeholder="年级"
            value={grade}
            disabled={generating}
            onChange={(e) => setGrade(e.target.value)}
          />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <PrimaryButton pending={generating} disabled={saving} onClick={() => void generate()}>
            AI 生成教案
          </PrimaryButton>
          <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5">
            <input
              type="checkbox"
              checked={shared}
              disabled={generating || saving}
              onChange={(e) => setShared(e.target.checked)}
            />
            生成后默认共享
          </label>
        </div>
      </ToolCard>

      <ToolCard>
        <SectionTitle
          icon={<BookOpen className="h-4 w-4" />}
          title="我的教案库"
          hint="点击条目打开「我的教案」编辑窗，可继续修改后保存。"
        />
        {loadingLessons ? (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            加载教案…
          </p>
        ) : null}
        <ul className="space-y-2">
          {lessons.map((lesson) => (
            <li key={lesson.id}>
              <button
                type="button"
                onClick={() => openLibraryLesson(lesson)}
                className="flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-100 px-4 py-3 text-left transition hover:border-violet-200 hover:bg-violet-50/40 dark:border-white/10"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-slate-50">{lesson.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {[
                      lesson.subject,
                      lesson.grade,
                      formatDay(lesson.updated_at || lesson.created_at),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {lesson.status === 'draft' ? (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    草稿
                  </span>
                ) : lesson.shared ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                    <Share2 className="h-3 w-3" />
                    已共享
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
                    {statusLabel(lesson)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {!loadingLessons && !lessons.length ? (
          <EmptyHint>还没有教案。生成后在弹窗里「保存」或「存为草稿」即可。</EmptyHint>
        ) : null}
      </ToolCard>

      {editor ? (
        <LessonEditorModal
          draft={editor}
          heading="我的教案"
          saving={saving}
          onChange={setEditor}
          onClose={() => {
            if (!saving) setEditor(null);
          }}
          onSaveDraft={() => void persist('draft')}
          onSave={() => void persist('saved')}
        />
      ) : null}
    </ToolShell>
  );
}

/** Student / admin read-only list of shared lesson plans. */
export function SharedLessonsTool() {
  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewLesson, setPreviewLesson] = useState<LessonRecord | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/campus/tools/lessons', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '加载失败');
        setLessons(data.records ?? []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <ToolShell
      title="共享教案"
      description="老师勾选「共享给学生」并保存后，教案会出现在这里。"
      eyebrow="学习 · Lessons"
    >
      <ToolCard>
        <SectionTitle icon={<BookOpen className="h-4 w-4" />} title="老师共享的教案" />
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            加载中…
          </p>
        ) : null}
        <ul className="space-y-2">
          {lessons.map((lesson) => (
            <li key={lesson.id}>
              <button
                type="button"
                onClick={() => setPreviewLesson(lesson)}
                className="flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-100 px-4 py-3 text-left transition hover:border-violet-200 hover:bg-violet-50/40 dark:border-white/10"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-slate-50">{lesson.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {[
                      lesson.teacher_name,
                      lesson.subject,
                      lesson.grade,
                      formatDay(lesson.updated_at),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <FileText className="h-4 w-4 shrink-0 text-violet-500" />
              </button>
            </li>
          ))}
        </ul>
        {!loading && !lessons.length ? <EmptyHint>暂时还没有老师共享教案。</EmptyHint> : null}
      </ToolCard>

      {previewLesson ? (
        <LessonReadModal
          lesson={previewLesson}
          heading="共享教案"
          onClose={() => setPreviewLesson(null)}
        />
      ) : null}
    </ToolShell>
  );
}
