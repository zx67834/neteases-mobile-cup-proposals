'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { PrimaryButton, SectionTitle, SoftInput, ToolCard, ToolShell, toolFieldClass } from '@/components/campus/tools/ToolShell';
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

export function LessonPlanTool() {
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [content, setContent] = useState('');
  const [shared, setShared] = useState(true);
  const [pending, setPending] = useState(false);
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loadingCourses, setLoadingCourses] = useState(true);

  const clean = useMemo(() => stripLessonMarkup(content), [content]);
  const selected = classrooms.find((c) => c.id === selectedId);
  const displayTitle = topic.trim() ? `《${topic.trim()}》教案` : '教案';
  const metaLine = [
    subject.trim() ? `学科：${subject.trim()}` : null,
    grade.trim() ? `年级：${grade.trim()}` : null,
    '课时：45分钟',
  ]
    .filter(Boolean)
    .join('　　');

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

  useEffect(() => {
    void loadClassrooms();
  }, [loadClassrooms]);

  function pickClassroom(id: string) {
    setSelectedId(id);
    if (!id) return;
    const course = classrooms.find((c) => c.id === id);
    if (!course) return;
    setTopic(course.name);
  }

  async function generate() {
    if (!topic.trim()) {
      toast.error('请先选择课堂或填写课题');
      return;
    }
    setPending(true);
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '生成失败');
      setContent(stripLessonMarkup(data.content || ''));
      toast.success('教案已生成');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败');
    } finally {
      setPending(false);
    }
  }

  async function save() {
    setPending(true);
    try {
      const res = await fetch('/api/campus/tools/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: topic || '未命名教案',
          subject,
          grade,
          duration: '45分钟',
          content: clean,
          shared,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      toast.success(shared ? '已保存并共享给学生' : '已保存（未共享）');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setPending(false);
    }
  }

  const fieldClass = toolFieldClass;

  return (
    <ToolShell
      title="智能教案"
      description="可从已生成课堂选题，生成干净教案并保存共享。"
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
            disabled={loadingCourses}
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
            onChange={(e) => setTopic(e.target.value)}
          />
          <SoftInput
            placeholder="学科"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <SoftInput
            placeholder="年级"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <PrimaryButton pending={pending} onClick={() => void generate()}>
            AI 生成教案
          </PrimaryButton>
          <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            共享给学生
          </label>
          <PrimaryButton pending={pending} onClick={() => void save()} disabled={!clean}>
            保存
          </PrimaryButton>
        </div>
      </ToolCard>

      {clean ? (
        <ToolCard>
          <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4 dark:border-white/10">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-500/20">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                {displayTitle}
              </h2>
              {metaLine ? <p className="mt-1 text-sm text-slate-500">{metaLine}</p> : null}
            </div>
          </div>
          <article className="whitespace-pre-wrap rounded-2xl bg-slate-50/80 px-4 py-5 text-[15px] leading-8 text-slate-700 dark:bg-white/5 dark:text-slate-200">
            {clean}
          </article>
        </ToolCard>
      ) : null}
    </ToolShell>
  );
}
