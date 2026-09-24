import { describe, expect, it } from 'vitest';

import {
  buildStudentWorkflowExpansionPrompt,
  buildStudentWorkflowPrompt,
  parseStudentWorkflow,
  parseStudentWorkflowExpansion,
} from '@/lib/student-workflow/generation';

const sources = [
  {
    sceneId: 'scene-1',
    sceneOrder: 1,
    title: '二分查找基础',
    excerpt: '闭区间写法',
  },
  {
    sceneId: 'scene-2',
    sceneOrder: 2,
    title: '边界陷阱',
    excerpt: 'left 和 right 的更新',
  },
];

describe('student workflow generation', () => {
  it('normalizes a branched workflow and removes invented sources', () => {
    const workflow = parseStudentWorkflow(
      JSON.stringify({
        title: '二分查找边界学习路径',
        summary: '从课程依据到练习和笔记。',
        nodes: [
          { kind: 'goal', title: '目标', content: '理解边界更新。', parentIndex: -1 },
          {
            kind: 'course',
            title: '课程依据',
            content: '第 2 页说明了边界陷阱。',
            parentIndex: 0,
            sourceSceneIds: ['scene-2', 'invented'],
          },
          {
            kind: 'explanation',
            title: '解释',
            content: '每轮必须缩小搜索区间。',
            parentIndex: 1,
          },
          {
            kind: 'practice',
            title: '练习',
            content: '判断下一步区间。',
            question: 'left = mid 会有什么风险？',
            parentIndex: 1,
          },
        ],
        suggestedPrompts: ['再举一个例子', '整理成笔记'],
      }),
      { intent: 'question', prompt: '为什么会死循环？', sources },
    );

    expect(workflow.nodes).toHaveLength(4);
    expect(workflow.nodes[1]?.parentId).toBe(workflow.nodes[0]?.id);
    expect(workflow.nodes[3]?.parentId).toBe(workflow.nodes[1]?.id);
    expect(workflow.nodes[1]?.sourceSceneIds).toEqual(['scene-2']);
  });

  it('forces expansion node kinds for note and grading actions', () => {
    const note = parseStudentWorkflowExpansion(
      '{"kind":"explanation","title":"边界笔记","content":"区间每轮必须缩小。"}',
      { action: 'note', parentId: 'parent', sources },
    );
    const feedback = parseStudentWorkflowExpansion(
      '{"kind":"explanation","title":"作答反馈","content":"方向正确，需要说明死循环。"}',
      { action: 'grade', parentId: 'practice', sources },
    );

    expect(note.kind).toBe('note');
    expect(note.parentId).toBe('parent');
    expect(feedback.kind).toBe('feedback');
  });

  it('builds grounded create and expansion prompts', () => {
    const createPrompt = buildStudentWorkflowPrompt({
      courseName: '算法课',
      intent: 'practice',
      prompt: '练习二分查找',
      evidence: 'scene-2：边界陷阱',
    });
    const expandPrompt = buildStudentWorkflowExpansionPrompt({
      courseName: '算法课',
      action: 'grade',
      workflowPrompt: '练习二分查找',
      parentNode: {
        kind: 'practice',
        title: '边界练习',
        content: '回答问题',
        question: '为什么需要 mid + 1？',
      },
      answer: '为了缩小区间',
      evidence: 'scene-2：边界陷阱',
    });

    expect(createPrompt).toContain('暂不公布答案');
    expect(createPrompt).toContain('sceneId');
    expect(expandPrompt).toContain('为了缩小区间');
    expect(expandPrompt).toContain('可执行的改进建议');
  });

  it('uses the student freeform request to generate the next node', () => {
    const prompt = buildStudentWorkflowExpansionPrompt({
      courseName: '算法课',
      action: 'explore',
      workflowPrompt: '学习二分查找',
      parentNode: {
        kind: 'explanation',
        title: '闭区间边界',
        content: '每轮都要跳过 mid。',
      },
      answer: '我想看看它在游戏匹配中的应用',
      evidence: 'scene-2：边界陷阱',
    });

    const node = parseStudentWorkflowExpansion(
      '{"kind":"example","title":"游戏匹配","content":"用分段积分匹配合适对手。"}',
      { action: 'explore', parentId: 'boundary-node', sources },
    );

    expect(prompt).toContain('我想看看它在游戏匹配中的应用');
    expect(node.kind).toBe('example');
    expect(node.parentId).toBe('boundary-node');
  });
});
