import { describe, expect, it } from 'vitest';

import {
  buildClassroomQuickQaSystemPrompt,
  buildStudentQaSystemPrompt,
  selectStudentQaEvidence,
} from '@/lib/student-qa/course-context';
import type { AppScene } from '@/lib/types/stage';

const now = Date.now();
const scenes = [
  {
    id: 'intro',
    stageId: 'course-1',
    title: '算法导论',
    order: 1,
    type: 'slide',
    content: {
      type: 'slide',
      canvas: {
        id: 'slide-1',
        elements: [
          {
            id: 'text-1',
            type: 'text',
            left: 0,
            top: 0,
            width: 100,
            height: 30,
            content: '<p>算法是解决问题的有限步骤</p>',
          },
        ],
        background: { type: 'solid', color: '#fff' },
        viewportSize: 1000,
        viewportRatio: 0.5625,
      },
    },
    actions: [{ id: 'speech-1', type: 'speech', text: '算法不等于某种编程语言。' }],
  },
  {
    id: 'binary-search',
    stageId: 'course-1',
    title: '二分查找的边界陷阱',
    order: 2,
    type: 'quiz',
    content: {
      type: 'quiz',
      questions: [
        {
          id: 'q1',
          type: 'single',
          question: '二分查找为什么会死循环？',
          options: [
            { label: '边界没有收缩', value: 'A' },
            { label: '数组太长', value: 'B' },
          ],
          answer: ['A'],
          analysis: '更新 left 和 right 时必须保证搜索区间缩小。',
        },
      ],
    },
  },
] as unknown as AppScene[];

const document = {
  stage: {
    id: 'course-1',
    name: 'Java 算法基础',
    description: '面向初学者的算法课',
    createdAt: now,
    updatedAt: now,
  },
  scenes,
};

describe('student course QA evidence', () => {
  it('ranks the matching lesson page and exposes a citation', () => {
    const evidence = selectStudentQaEvidence(document, '二分查找为什么会死循环？', undefined, 1);
    expect(evidence.sources).toEqual([
      expect.objectContaining({ sceneId: 'binary-search', sceneOrder: 2 }),
    ]);
    expect(evidence.context).toContain('边界没有收缩');
    expect(evidence.context).toContain('搜索区间缩小');
  });

  it('includes slide text and teacher narration without HTML markup', () => {
    const evidence = selectStudentQaEvidence(document, '算法是什么', undefined, 1);
    expect(evidence.sources[0]?.sceneId).toBe('intro');
    expect(evidence.context).toContain('算法是解决问题的有限步骤');
    expect(evidence.context).toContain('算法不等于某种编程语言');
    expect(evidence.context).not.toContain('<p>');
  });

  it('builds a student-only grounded instruction', () => {
    const evidence = selectStudentQaEvidence(document, '算法是什么', undefined, 1);
    const prompt = buildStudentQaSystemPrompt('Java 算法基础', '面向初学者', evidence);
    expect(prompt).toContain('学生学习助教');
    expect(prompt).toContain('不要虚构页码');
    expect(prompt).toContain('不执行修改课程');
  });

  it('builds a concise current-slide prompt for classroom questions', () => {
    const evidence = selectStudentQaEvidence(document, '为什么会死循环', 'binary-search', 2);
    const prompt = buildClassroomQuickQaSystemPrompt(
      'Java 算法基础',
      '二分查找的边界陷阱',
      evidence,
    );

    expect(prompt).toContain('60—120 个汉字');
    expect(prompt).toContain('只出 1 道短题');
    expect(prompt).toContain('二分查找的边界陷阱');
  });
});
