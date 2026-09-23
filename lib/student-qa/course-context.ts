import type { MaicDocument } from '@openmaic/storage';

import type { AppScene } from '@/lib/types/stage';

export interface StudentQaSource {
  sceneId: string;
  sceneOrder: number;
  title: string;
  excerpt: string;
}

export interface StudentQaEvidence {
  context: string;
  sources: StudentQaSource[];
}

interface SceneKnowledge extends StudentQaSource {
  body: string;
}

const MAX_SCENE_TEXT = 6_000;
const MAX_CONTEXT_TEXT = 16_000;

const USEFUL_TEXT_KEYS = new Set([
  'analysis',
  'answer',
  'code',
  'commentPrompt',
  'content',
  'description',
  'explanation',
  'goal',
  'hint',
  'instructions',
  'label',
  'latex',
  'name',
  'objective',
  'prompt',
  'question',
  'summary',
  'text',
  'title',
  'topic',
  'value',
]);

const SKIPPED_KEYS = new Set([
  'audioId',
  'avatar',
  'background',
  'color',
  'defaultColor',
  'defaultFontName',
  'fill',
  'html',
  'id',
  'image',
  'path',
  'src',
  'style',
  'theme',
  'url',
]);

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
}

function normalizeText(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/\r/g, '')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collectUsefulStrings(value: unknown, output: string[], key?: string, depth = 0): void {
  if (depth > 8 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (!key || !USEFUL_TEXT_KEYS.has(key)) return;
    if (value.length > 25_000 || /^data:|^blob:/i.test(value)) return;
    const text = normalizeText(value.includes('<') ? htmlToText(value) : value);
    if (text) output.push(text);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUsefulStrings(item, output, key, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    if (!SKIPPED_KEYS.has(childKey)) collectUsefulStrings(childValue, output, childKey, depth + 1);
  }
}

function extractVisibleInteractiveHtml(scene: AppScene): string[] {
  if (scene.content.type !== 'interactive' || !scene.content.html) return [];
  const visible = normalizeText(htmlToText(scene.content.html));
  return visible ? [visible.slice(0, MAX_SCENE_TEXT)] : [];
}

function extractSceneKnowledge(scene: AppScene): SceneKnowledge {
  const lines: string[] = [scene.title];
  if (scene.content.type === 'slide') collectUsefulStrings(scene.content.canvas.elements, lines);
  else if (scene.content.type === 'quiz') collectUsefulStrings(scene.content.questions, lines);
  else {
    collectUsefulStrings(scene.content, lines);
    lines.push(...extractVisibleInteractiveHtml(scene));
  }
  collectUsefulStrings(scene.actions, lines);
  collectUsefulStrings(scene.whiteboards, lines);

  const body = normalizeText([...new Set(lines)].join('\n')).slice(0, MAX_SCENE_TEXT);
  const excerptSource = body.replace(scene.title, '').trim() || body;
  return {
    sceneId: scene.id,
    sceneOrder: scene.order,
    title: scene.title,
    excerpt: excerptSource.replace(/\s+/g, ' ').slice(0, 120),
    body,
  };
}

function tokenize(value: string): string[] {
  const normalized = value.toLocaleLowerCase();
  const tokens = new Set<string>();
  for (const word of normalized.match(/[a-z0-9][a-z0-9_+.#-]{1,}/g) ?? []) tokens.add(word);
  for (const segment of normalized.match(/[\u3400-\u9fff]{2,}/g) ?? []) {
    if (segment.length <= 8) tokens.add(segment);
    for (let index = 0; index < segment.length - 1; index += 1) {
      tokens.add(segment.slice(index, index + 2));
    }
  }
  return [...tokens].filter((token) => token.length > 1);
}

function scoreKnowledge(scene: SceneKnowledge, tokens: string[], currentSceneId?: string): number {
  const title = scene.title.toLocaleLowerCase();
  const body = scene.body.toLocaleLowerCase();
  let score = scene.sceneId === currentSceneId ? 12 : 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 5;
    else if (body.includes(token)) score += 1;
  }
  return score;
}

export function selectStudentQaEvidence(
  document: MaicDocument<AppScene>,
  question: string,
  currentSceneId?: string,
  limit = 4,
): StudentQaEvidence {
  const tokens = tokenize(question);
  const ranked = document.scenes
    .map(extractSceneKnowledge)
    .map((scene) => ({ scene, score: scoreKnowledge(scene, tokens, currentSceneId) }))
    .sort(
      (left, right) => right.score - left.score || left.scene.sceneOrder - right.scene.sceneOrder,
    );
  const matched = ranked.filter((item) => item.score > 0);
  const selected = (matched.length > 0 ? matched : ranked).slice(0, Math.max(1, limit));
  const blocks: string[] = [];
  let length = 0;
  for (const { scene } of selected) {
    const block = `【第 ${scene.sceneOrder} 页｜${scene.title}】\n${scene.body}`;
    const remaining = MAX_CONTEXT_TEXT - length;
    if (remaining <= 0) break;
    blocks.push(block.slice(0, remaining));
    length += Math.min(block.length, remaining);
  }
  return {
    context: blocks.join('\n\n'),
    sources: selected.map(({ scene }) => ({
      sceneId: scene.sceneId,
      sceneOrder: scene.sceneOrder,
      title: scene.title,
      excerpt: scene.excerpt,
    })),
  };
}

export function buildStudentQaSystemPrompt(
  courseName: string,
  courseDescription: string | undefined,
  evidence: StudentQaEvidence,
): string {
  return `你是“${courseName}”课程的学生学习助教。你的回答必须服务于真实课堂后的复习、理解和练习。

回答规则：
1. 优先依据下方“课程资料”回答，并使用与课程一致的术语和教学顺序。
2. 不要声称看过未提供的课件；资料不足时明确说“当前课程资料里没有足够信息”，再给出通用解释。
3. 用简体中文，先给直接结论，再分步骤讲解；面向学生，不使用教师备课口吻。
4. 对作业、测验和代码题，先解释思路、关键步骤和常见错误；除非学生明确要求，不直接只给最终答案。
5. 可以引用“第 N 页《标题》”，但不要虚构页码或资料来源。
6. 不执行修改课程、生成课件、替教师发布课堂等教师端操作。

课程简介：${courseDescription?.trim() || '暂无课程简介'}

课程资料：
${evidence.context || '当前课程暂无可读取的文字资料。'}`;
}

export function buildClassroomQuickQaSystemPrompt(
  courseName: string,
  currentSceneTitle: string | undefined,
  evidence: StudentQaEvidence,
): string {
  return `你是“${courseName}”课堂里的随堂 AI 助教，学生正在听老师讲课，需要快速消除一个小疑问。

严格遵守：
1. 默认只回答 60—120 个汉字，先给一句结论，最多再列 3 个短要点。
2. 不写长篇背景、章节标题、表格或完整教案；除非学生追问，不展开无关知识。
3. 优先结合当前页“${currentSceneTitle || '未知页面'}”和下方课程资料。
4. 学生要求“出题”时只出 1 道短题，暂不公布答案，等待学生作答。
5. 不确定时直接说明，不虚构课件内容或页码。

当前页相关资料：
${evidence.context || '当前页暂无可读取的文字资料。'}`;
}
