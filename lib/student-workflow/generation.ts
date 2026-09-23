import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';

import type {
  StudentLearningIntent,
  StudentLearningWorkflow,
  StudentWorkflowAction,
  StudentWorkflowNode,
  StudentWorkflowNodeKind,
  StudentWorkflowSource,
} from '@/lib/student-workflow/types';

const nodeKindSchema = z.enum([
  'goal',
  'course',
  'explanation',
  'example',
  'practice',
  'note',
  'feedback',
]);

const rawNodeSchema = z.object({
  kind: nodeKindSchema,
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(2_000),
  parentIndex: z.number().int().min(-1).max(12).optional(),
  sourceSceneIds: z.array(z.string()).max(6).optional(),
  question: z.string().trim().min(1).max(800).optional(),
  hint: z.string().trim().min(1).max(400).optional(),
});

const rawWorkflowSchema = z.object({
  title: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(240),
  nodes: z.array(rawNodeSchema).min(3).max(7),
  suggestedPrompts: z.array(z.string().trim().min(1).max(100)).min(2).max(4),
});

function extractJson(raw: string): unknown {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型没有返回学习工作流 JSON');
  return JSON.parse(jsonrepair(trimmed.slice(start, end + 1)));
}

function workflowId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function allowedSourceIds(sources: StudentWorkflowSource[]): Set<string> {
  return new Set(sources.map((source) => source.sceneId));
}

function normalizeSourceIds(
  sourceSceneIds: string[] | undefined,
  sources: StudentWorkflowSource[],
  kind: StudentWorkflowNodeKind,
): string[] {
  const allowed = allowedSourceIds(sources);
  const selected = [...new Set(sourceSceneIds ?? [])].filter((id) => allowed.has(id));
  if (selected.length > 0) return selected;
  if (kind === 'course') return sources.slice(0, 2).map((source) => source.sceneId);
  return [];
}

export function parseStudentWorkflow(
  raw: string,
  options: {
    intent: StudentLearningIntent;
    prompt: string;
    sources: StudentWorkflowSource[];
  },
): StudentLearningWorkflow {
  const parsed = rawWorkflowSchema.parse(extractJson(raw));
  const workflowPrefix = workflowId('learning');
  const nodes: StudentWorkflowNode[] = parsed.nodes.map((node, index) => {
    const id = `${workflowPrefix}-node-${index + 1}`;
    const requestedParent = node.parentIndex ?? index - 1;
    const parentIndex = index === 0 ? -1 : Math.min(Math.max(requestedParent, 0), index - 1);
    return {
      id,
      kind: node.kind,
      title: node.title,
      content: node.content,
      ...(parentIndex >= 0 ? { parentId: `${workflowPrefix}-node-${parentIndex + 1}` } : {}),
      sourceSceneIds: normalizeSourceIds(node.sourceSceneIds, options.sources, node.kind),
      ...(node.question ? { question: node.question } : {}),
      ...(node.hint ? { hint: node.hint } : {}),
    };
  });

  return {
    id: workflowPrefix,
    intent: options.intent,
    title: parsed.title,
    summary: parsed.summary,
    prompt: options.prompt,
    nodes,
    sources: options.sources,
    suggestedPrompts: parsed.suggestedPrompts,
  };
}

export function parseStudentWorkflowExpansion(
  raw: string,
  options: {
    action: StudentWorkflowAction;
    parentId: string;
    sources: StudentWorkflowSource[];
  },
): StudentWorkflowNode {
  const parsed = rawNodeSchema.parse(extractJson(raw));
  const forcedKind: Partial<Record<StudentWorkflowAction, StudentWorkflowNodeKind>> = {
    practice: 'practice',
    note: 'note',
    grade: 'feedback',
  };
  const kind = forcedKind[options.action] ?? parsed.kind;
  return {
    id: workflowId(`learning-node-${kind}`),
    kind,
    title: parsed.title,
    content: parsed.content,
    parentId: options.parentId,
    sourceSceneIds: normalizeSourceIds(parsed.sourceSceneIds, options.sources, kind),
    ...(parsed.question ? { question: parsed.question } : {}),
    ...(parsed.hint ? { hint: parsed.hint } : {}),
  };
}

export function buildFallbackStudentWorkflow(options: {
  intent: StudentLearningIntent;
  prompt: string;
  courseName: string;
  sources: StudentWorkflowSource[];
}): StudentLearningWorkflow {
  const workflowPrefix = workflowId('learning-fallback');
  const primarySource = options.sources[0];
  const sourceLabel = primarySource
    ? `第 ${primarySource.sceneOrder} 页《${primarySource.title}》`
    : `“${options.courseName}”课程资料`;
  const sourceContent = primarySource?.excerpt
    ? `${sourceLabel}提到：${primarySource.excerpt}`
    : `先从${sourceLabel}中定位与问题相关的概念、步骤和例子。`;
  const node = (
    index: number,
    kind: StudentWorkflowNodeKind,
    title: string,
    content: string,
    parentIndex?: number,
    extra?: Pick<StudentWorkflowNode, 'question' | 'hint'>,
  ): StudentWorkflowNode => ({
    id: `${workflowPrefix}-node-${index + 1}`,
    kind,
    title,
    content,
    ...(parentIndex === undefined ? {} : { parentId: `${workflowPrefix}-node-${parentIndex + 1}` }),
    sourceSceneIds: kind === 'course' && primarySource ? [primarySource.sceneId] : [],
    ...extra,
  });

  const nodes: StudentWorkflowNode[] = [
    node(0, 'goal', '明确学习目标', options.prompt),
    node(1, 'course', '找到课程依据', sourceContent, 0),
    node(
      2,
      'explanation',
      '拆解关键问题',
      `围绕“${options.prompt}”，先确认概念适用的条件，再观察每一步发生了什么，最后用一个反例检查容易出错的边界。`,
      1,
    ),
    node(3, 'practice', '马上检验理解', '先独立作答，再让 AI 根据课程内容给出反馈。', 2, {
      question: `请用自己的话说明“${options.prompt}”中最关键的一步，并举一个容易出错的情况。`,
      hint: `回到${sourceLabel}，关注条件、过程和结果之间的关系。`,
    }),
    node(
      4,
      'note',
      '形成学习笔记',
      `主题：${options.prompt}\n\n课程依据：${sourceLabel}\n\n我的理解：先写结论，再补充关键步骤和一个反例。`,
      2,
    ),
  ];

  return {
    id: workflowPrefix,
    intent: options.intent,
    title: `${options.prompt.slice(0, 28)}学习路径`,
    summary: '从教师课程依据出发，经过讲解、练习和笔记完成一次学习闭环。',
    prompt: options.prompt,
    nodes,
    sources: options.sources,
    suggestedPrompts: ['从另一个角度再解释一次', '根据易错点再出一道题', '把结论整理成复习卡'],
  };
}

export function buildFallbackStudentWorkflowExpansion(options: {
  action: Exclude<StudentWorkflowAction, 'grade'>;
  parentNode: StudentWorkflowNode;
  sources: StudentWorkflowSource[];
}): StudentWorkflowNode {
  const primarySource = options.sources[0];
  const sourceIds = primarySource ? [primarySource.sceneId] : [];
  const sourceLabel = primarySource
    ? `第 ${primarySource.sceneOrder} 页《${primarySource.title}》`
    : '当前课程资料';
  const common = {
    id: workflowId(`learning-node-${options.action}`),
    parentId: options.parentNode.id,
    sourceSceneIds: sourceIds,
  };

  if (options.action === 'practice') {
    return {
      ...common,
      kind: 'practice',
      title: `${options.parentNode.title} · 巩固练习`,
      content: `结合${sourceLabel}完成下面的问题，先不要查看外部答案。`,
      question: `请解释“${options.parentNode.title}”的关键条件，并说明忽略其中一个条件可能造成什么结果。`,
      hint: options.parentNode.content.slice(0, 120),
    };
  }
  if (options.action === 'note') {
    return {
      ...common,
      kind: 'note',
      title: `${options.parentNode.title} · 笔记卡`,
      content: `课程依据：${sourceLabel}\n\n核心结论：${options.parentNode.content}\n\n我的补充：`,
    };
  }
  return {
    ...common,
    kind: 'explanation',
    title: `${options.parentNode.title} · 再讲一步`,
    content: `先抓住当前节点的结论，再回到${sourceLabel}核对适用条件。把过程拆成“输入条件—关键动作—结果”三步，通常就能发现理解断点。`,
  };
}

export function buildStudentWorkflowPrompt({
  courseName,
  intent,
  prompt,
  evidence,
}: {
  courseName: string;
  intent: StudentLearningIntent;
  prompt: string;
  evidence: string;
}): string {
  const intentRule = {
    question: '围绕学生的问题建立理解路径，必须包含课程依据、核心讲解，并给出练习或笔记节点。',
    practice: '围绕学生想练习的内容建立训练路径，必须包含课程依据和一道暂不公布答案的练习题。',
    note: '围绕学生想整理的内容建立笔记路径，必须包含课程依据、概念梳理和一份可编辑的笔记草稿。',
  }[intent];

  return `你是“${courseName}”课程的学习工作流规划器。请把学生的一次学习需求转换成可交互的节点链。

学生需求：${prompt}
工作流类型：${intent}
类型要求：${intentRule}

课程资料：
${evidence || '暂无可读取的课程文字资料。'}

只返回 JSON，不要 Markdown。格式：
{
  "title": "工作流标题",
  "summary": "一句话说明这条学习路径",
  "nodes": [
    {
      "kind": "goal|course|explanation|example|practice|note",
      "title": "节点标题",
      "content": "简洁、面向学生的内容",
      "parentIndex": -1,
      "sourceSceneIds": ["只能填写课程资料中真实出现的 sceneId"],
      "question": "仅练习节点填写题目",
      "hint": "可选提示"
    }
  ],
  "suggestedPrompts": ["后续操作建议 1", "后续操作建议 2"]
}

规则：
1. 生成 4—6 个节点；第一个必须是 goal，且 parentIndex 为 -1。
2. 后续节点的 parentIndex 只能指向它前面的节点下标；允许从同一节点分出讲解、练习和笔记支路。
3. 至少生成一个 course 节点，明确说明依据了哪一页课程；sourceSceneIds 不得编造。
4. practice 节点只给题目和提示，不公布答案。
5. note 节点写成学生可继续修改的知识卡片，不写教师教案。
6. 每个节点只承担一个任务，content 控制在 60—220 个汉字。`;
}

export function buildStudentWorkflowExpansionPrompt({
  courseName,
  action,
  workflowPrompt,
  parentNode,
  answer,
  evidence,
}: {
  courseName: string;
  action: StudentWorkflowAction;
  workflowPrompt: string;
  parentNode: Pick<StudentWorkflowNode, 'kind' | 'title' | 'content' | 'question'>;
  answer?: string;
  evidence: string;
}): string {
  const actionInstruction: Record<StudentWorkflowAction, string> = {
    explain: '沿着当前节点再讲清楚一步，生成 explanation 或 example 节点。',
    practice: '根据当前节点生成一道新的 practice 题目，只出题，不公布答案。',
    note: '把当前节点整理为一张可独立阅读和继续编辑的 note 知识卡片。',
    grade: `评价学生答案，指出做对之处、需要修正之处和下一步建议。学生答案：${answer || '未提供'}`,
  };

  return `你是“${courseName}”课程的学习工作流执行器。
原始学习需求：${workflowPrompt}
当前节点：${parentNode.title}
当前节点内容：${parentNode.content}
${parentNode.question ? `当前题目：${parentNode.question}` : ''}
本次操作：${actionInstruction[action]}

课程资料：
${evidence || '暂无可读取的课程文字资料。'}

只返回一个 JSON 对象，不要 Markdown：
{
  "kind": "explanation|example|practice|note|feedback",
  "title": "新节点标题",
  "content": "节点内容",
  "sourceSceneIds": ["真实 sceneId"],
  "question": "仅练习节点填写",
  "hint": "可选提示"
}

内容要简洁、具体并直接承接当前节点。练习不泄露答案；评分节点不得只说对错，要给出可执行的改进建议。`;
}
