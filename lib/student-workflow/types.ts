export type StudentLearningIntent = 'question' | 'practice' | 'note';

export type StudentWorkflowAction = 'explain' | 'practice' | 'note' | 'grade';

export type StudentWorkflowNodeKind =
  | 'goal'
  | 'course'
  | 'explanation'
  | 'example'
  | 'practice'
  | 'note'
  | 'feedback';

export interface StudentWorkflowSource {
  sceneId: string;
  sceneOrder: number;
  title: string;
  excerpt: string;
}

export interface StudentWorkflowNode {
  id: string;
  kind: StudentWorkflowNodeKind;
  title: string;
  content: string;
  parentId?: string;
  sourceSceneIds: string[];
  question?: string;
  hint?: string;
  studentAnswer?: string;
}

export interface StudentLearningWorkflow {
  id: string;
  intent: StudentLearningIntent;
  title: string;
  summary: string;
  prompt: string;
  nodes: StudentWorkflowNode[];
  sources: StudentWorkflowSource[];
  suggestedPrompts: string[];
}
