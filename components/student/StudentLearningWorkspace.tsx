'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  GitBranch,
  HardDrive,
  History,
  Lightbulb,
  Loader2,
  Maximize2,
  MessageCircleQuestion,
  Minimize2,
  NotebookPen,
  PencilLine,
  RefreshCcw,
  Route,
  Send,
  Sparkles,
  Target,
} from 'lucide-react';
import {
  Handle,
  MarkerType,
  NodeResizeControl,
  NodeResizer,
  Position,
  type Edge as ReactFlowEdge,
  type Node as ReactFlowNode,
  type NodeProps,
  useNodesState,
} from '@xyflow/react';
import { toast } from 'sonner';

import { Canvas } from '@/components/ai-elements/canvas';
import { Controls } from '@/components/ai-elements/controls';
import { Edge } from '@/components/ai-elements/edge';
import { MessageResponse } from '@/components/ai-elements/message';
import { createStudentWorkflow, expandStudentWorkflow } from '@/lib/student-workflow/client';
import {
  hydrateStudentWorkflowMemories,
  persistStudentWorkflowMemory,
} from '@/lib/student-workflow/remote-storage';
import {
  readStudentWorkflowMemories,
  saveStudentWorkflowMemory,
  type StudentWorkflowMemory,
  type StudentWorkflowPosition,
} from '@/lib/student-workflow/storage';
import type {
  StudentLearningIntent,
  StudentLearningWorkflow,
  StudentWorkflowAction,
  StudentWorkflowNode,
  StudentWorkflowNodeKind,
  StudentWorkflowSource,
} from '@/lib/student-workflow/types';
import type { StageListItem } from '@/lib/utils/stage-storage';

interface StudentLearningWorkspaceProps {
  courses: StageListItem[];
  loadingCourses: boolean;
  standalone?: boolean;
}

type StudentNodeData = {
  node: StudentWorkflowNode;
  sources: StudentWorkflowSource[];
  busy: boolean;
  onAction: (node: StudentWorkflowNode, action: StudentWorkflowAction, answer?: string) => void;
  onEdit: (nodeId: string, content: string) => void;
  onOpenSource: (sceneId: string) => void;
  onToggleSize: (nodeId: string) => void;
  aiOpen: boolean;
  onToggleAi: (nodeId: string) => void;
};

type StudentFlowNode = ReactFlowNode<StudentNodeData, 'studentLearning'>;

const INTENTS: Array<{
  id: StudentLearningIntent;
  label: string;
  description: string;
  placeholder: string;
  icon: typeof MessageCircleQuestion;
}> = [
  {
    id: 'question',
    label: '提问理解',
    description: '从疑问出发，连接课程依据和讲解',
    placeholder: '例如：为什么二分查找容易出现边界错误？',
    icon: MessageCircleQuestion,
  },
  {
    id: 'practice',
    label: '生成练习',
    description: '围绕知识点出题、作答并获得反馈',
    placeholder: '例如：给我一组二分查找的边界练习',
    icon: PencilLine,
  },
  {
    id: 'note',
    label: '整理笔记',
    description: '把课程内容整理成可继续编辑的笔记',
    placeholder: '例如：帮我整理二分查找的核心笔记',
    icon: NotebookPen,
  },
];

const NODE_THEME: Record<
  StudentWorkflowNodeKind,
  { icon: typeof Target; label: string; shell: string; iconClass: string }
> = {
  goal: {
    icon: Target,
    label: '学习目标',
    shell: 'border-violet-200 bg-violet-50/95 dark:border-violet-400/25 dark:bg-violet-500/10',
    iconClass: 'bg-violet-600 text-white',
  },
  course: {
    icon: BookOpen,
    label: '课程依据',
    shell: 'border-blue-200 bg-blue-50/95 dark:border-blue-400/25 dark:bg-blue-500/10',
    iconClass: 'bg-blue-500 text-white',
  },
  explanation: {
    icon: BrainCircuit,
    label: 'AI 讲解',
    shell: 'border-cyan-200 bg-cyan-50/95 dark:border-cyan-400/25 dark:bg-cyan-500/10',
    iconClass: 'bg-cyan-500 text-white',
  },
  example: {
    icon: Lightbulb,
    label: '例子',
    shell: 'border-amber-200 bg-amber-50/95 dark:border-amber-400/25 dark:bg-amber-500/10',
    iconClass: 'bg-amber-500 text-white',
  },
  practice: {
    icon: PencilLine,
    label: '互动练习',
    shell: 'border-orange-200 bg-orange-50/95 dark:border-orange-400/25 dark:bg-orange-500/10',
    iconClass: 'bg-orange-500 text-white',
  },
  note: {
    icon: NotebookPen,
    label: '学习笔记',
    shell: 'border-emerald-200 bg-emerald-50/95 dark:border-emerald-400/25 dark:bg-emerald-500/10',
    iconClass: 'bg-emerald-500 text-white',
  },
  feedback: {
    icon: CheckCircle2,
    label: '作答反馈',
    shell: 'border-fuchsia-200 bg-fuchsia-50/95 dark:border-fuchsia-400/25 dark:bg-fuchsia-500/10',
    iconClass: 'bg-fuchsia-500 text-white',
  },
};

function LearningNode({ data, selected, width }: NodeProps<StudentFlowNode>) {
  const {
    node,
    sources,
    busy,
    aiOpen,
    onAction,
    onEdit,
    onOpenSource,
    onToggleSize,
    onToggleAi,
  } = data;
  const [answer, setAnswer] = useState(node.studentAnswer ?? '');
  const [showHint, setShowHint] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const expanded = (width ?? 330) >= 500;
  const theme = NODE_THEME[node.kind];
  const Icon = theme.icon;
  const resizeColor = node.kind === 'note' ? '#10b981' : '#8b5cf6';
  const minimumHeight = node.kind === 'note' ? 300 : 220;
  const nodeSources = sources.filter((source) => node.sourceSceneIds.includes(source.sceneId));

  return (
    <div
      className={`flex h-full min-h-[220px] w-full min-w-[300px] flex-col ${
        selected
          ? node.kind === 'note'
            ? 'ring-2 ring-emerald-400/70 ring-offset-2 ring-offset-transparent'
            : 'ring-2 ring-violet-400/70 ring-offset-2 ring-offset-transparent'
          : ''
      } relative rounded-[22px] border shadow-xl shadow-slate-900/[0.08] backdrop-blur ${theme.shell}`}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={300}
        minHeight={minimumHeight}
        maxWidth={900}
        maxHeight={900}
        color={resizeColor}
        handleClassName="nodrag"
        lineClassName="nodrag"
      />
      <NodeResizeControl
        position="bottom-right"
        minWidth={300}
        minHeight={minimumHeight}
        maxWidth={900}
        maxHeight={900}
        className="nodrag"
        style={{
          right: 7,
          bottom: 7,
          left: 'auto',
          top: 'auto',
          width: 24,
          height: 24,
          transform: 'none',
          translate: 'none',
          border: 'none',
          background: 'transparent',
          zIndex: 20,
        }}
      >
        <span
          title="拖动调整节点窗口大小"
          aria-hidden="true"
          className="block h-full w-full rounded-br-xl opacity-55 transition-opacity hover:opacity-100"
          style={{
            backgroundImage: `repeating-linear-gradient(135deg, transparent 0 4px, ${resizeColor} 4px 6px)`,
          }}
        />
      </NodeResizeControl>
      <button
        type="button"
        onClick={() => onToggleAi(node.id)}
        className={`nodrag absolute -right-4 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-white shadow-lg transition hover:scale-105 dark:border-slate-900 ${
          aiOpen ? 'bg-violet-700' : 'bg-violet-500'
        }`}
        aria-label={aiOpen ? '关闭节点 AI' : '从此节点继续探索'}
        title="从此节点继续探索"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      </button>
      {aiOpen ? (
        <div className="nodrag nowheel absolute left-full top-12 z-40 ml-6 w-[290px] rounded-2xl border border-violet-200 bg-white/95 p-3.5 shadow-2xl shadow-violet-950/15 backdrop-blur dark:border-violet-400/25 dark:bg-slate-900/95">
          <div className="flex items-center gap-2 text-xs font-semibold text-violet-600 dark:text-violet-300">
            <Sparkles className="h-3.5 w-3.5" />
            从“{node.title.slice(0, 18)}”继续
          </div>
          <textarea
            autoFocus
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && aiPrompt.trim() && !busy) {
                event.preventDefault();
                onAction(node, 'explore', aiPrompt.trim());
                setAiPrompt('');
                onToggleAi(node.id);
              }
            }}
            placeholder="例如：我想看看它在游戏匹配中的应用"
            className="mt-3 min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-5 text-slate-700 outline-none transition focus:border-violet-400 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            aria-label="输入下一步探索内容"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400">Enter 生成新卡片</span>
            <button
              type="button"
              disabled={!aiPrompt.trim() || busy}
              onClick={() => {
                onAction(node, 'explore', aiPrompt.trim());
                setAiPrompt('');
                onToggleAi(node.id);
              }}
              className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              生成下一步
            </button>
          </div>
        </div>
      ) : null}
      <Handle type="target" position={Position.Left} className="size-2.5! border-2! bg-white!" />
      <div className="flex shrink-0 cursor-grab items-start gap-3 border-b border-black/[0.05] px-4 py-3.5 active:cursor-grabbing dark:border-white/10">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${theme.iconClass}`}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            {theme.label}
          </p>
          <h3 className="mt-0.5 text-[15px] font-bold leading-5 text-slate-900 dark:text-white">
            {node.title}
          </h3>
        </div>
        {node.kind === 'note' ? (
          <button
            type="button"
            onClick={() => onToggleSize(node.id)}
            className="nodrag flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200/80 bg-white/75 text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-400/20 dark:bg-white/10 dark:text-emerald-200"
            aria-label={expanded ? '收起笔记节点' : '展开笔记节点'}
            title={expanded ? '收起笔记节点' : '展开笔记节点'}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      <div className="nowheel flex min-h-0 flex-1 flex-col overflow-auto px-4 py-4">
        {node.kind === 'note' ? (
          <textarea
            value={node.content}
            onChange={(event) => onEdit(node.id, event.target.value)}
            className="nodrag nowheel min-h-32 w-full flex-1 resize-none rounded-xl border border-emerald-200/80 bg-white/80 p-3 text-sm leading-6 text-slate-700 outline-none focus:border-emerald-400 dark:border-emerald-400/20 dark:bg-black/10 dark:text-slate-200"
            aria-label="编辑学习笔记"
          />
        ) : (
          <MessageResponse className="text-sm leading-6 text-slate-700 dark:text-slate-200">
            {node.content}
          </MessageResponse>
        )}

        {node.question ? (
          <div className="mt-3 rounded-xl border border-orange-200/80 bg-white/80 p-3 dark:border-orange-400/20 dark:bg-black/10">
            <p className="text-sm font-medium leading-6 text-slate-800 dark:text-slate-100">
              {node.question}
            </p>
            {node.hint && showHint ? (
              <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                提示：{node.hint}
              </p>
            ) : null}
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="写下你的答案…"
              className="nodrag nowheel mt-3 min-h-20 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-300 dark:border-white/10 dark:bg-white/5"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              {node.hint ? (
                <button
                  type="button"
                  onClick={() => setShowHint((current) => !current)}
                  className="nodrag text-xs font-medium text-amber-700 hover:text-amber-800 dark:text-amber-300"
                >
                  {showHint ? '收起提示' : '查看提示'}
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                disabled={!answer.trim() || busy}
                onClick={() => onAction(node, 'grade', answer)}
                className="nodrag rounded-full bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                提交作答
              </button>
            </div>
          </div>
        ) : null}

        {nodeSources.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {nodeSources.map((source) => (
              <button
                key={source.sceneId}
                type="button"
                title={source.excerpt}
                onClick={() => onOpenSource(source.sceneId)}
                className="nodrag rounded-full border border-blue-200 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-400/20 dark:bg-white/5 dark:text-blue-200"
              >
                第 {source.sceneOrder} 页 · {source.title}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 border-t border-black/[0.05] px-4 py-3 dark:border-white/10">
        {node.kind !== 'practice' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(node, 'explain')}
            className="nodrag rounded-full bg-white/75 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm hover:text-violet-600 disabled:opacity-40 dark:bg-white/10 dark:text-slate-200"
          >
            再讲一步
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction(node, 'practice')}
          className="nodrag rounded-full bg-white/75 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm hover:text-orange-600 disabled:opacity-40 dark:bg-white/10 dark:text-slate-200"
        >
          {node.kind === 'practice' ? '换一道题' : '生成练习'}
        </button>
        {node.kind !== 'note' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(node, 'note')}
            className="nodrag rounded-full bg-white/75 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm hover:text-emerald-600 disabled:opacity-40 dark:bg-white/10 dark:text-slate-200"
          >
            记成笔记
          </button>
        ) : null}
        <span
          className={`ml-auto self-center pr-5 text-[10px] font-medium ${
            node.kind === 'note'
              ? 'text-emerald-700/55 dark:text-emerald-200/50'
              : 'text-violet-700/50 dark:text-violet-200/50'
          }`}
        >
          右下角拖动缩放
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="size-2.5! border-2! bg-white!" />
    </div>
  );
}

const nodeTypes = { studentLearning: LearningNode };
const edgeTypes = { animated: Edge.Animated };

function layoutWorkflowNodes(
  workflow: StudentLearningWorkflow,
  dataFor: (node: StudentWorkflowNode) => StudentNodeData,
): StudentFlowNode[] {
  const depthById = new Map<string, number>();
  const groups = new Map<number, StudentWorkflowNode[]>();

  for (const node of workflow.nodes) {
    const depth = node.parentId ? (depthById.get(node.parentId) ?? 0) + 1 : 0;
    depthById.set(node.id, depth);
    groups.set(depth, [...(groups.get(depth) ?? []), node]);
  }

  return workflow.nodes.map((node) => {
    const depth = depthById.get(node.id) ?? 0;
    const siblings = groups.get(depth) ?? [node];
    const index = siblings.findIndex((item) => item.id === node.id);
    return {
      id: node.id,
      type: 'studentLearning',
      style: {
        width: 330,
        ...(node.kind === 'note' ? { height: 360 } : {}),
      },
      position: {
        x: depth * 390,
        y: (index - (siblings.length - 1) / 2) * 540,
      },
      data: dataFor(node),
    };
  });
}

function workflowEdges(workflow: StudentLearningWorkflow): ReactFlowEdge[] {
  return workflow.nodes.flatMap((node) =>
    node.parentId
      ? [
          {
            id: `edge-${node.parentId}-${node.id}`,
            source: node.parentId,
            target: node.id,
            type: 'animated',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' },
            style: { stroke: '#8b5cf6', strokeWidth: 1.8 },
          },
        ]
      : [],
  );
}

export function StudentLearningWorkspace({
  courses,
  loadingCourses,
  standalone = false,
}: StudentLearningWorkspaceProps) {
  const router = useRouter();
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [intent, setIntent] = useState<StudentLearningIntent>('question');
  const [prompt, setPrompt] = useState('');
  const [workflow, setWorkflow] = useState<StudentLearningWorkflow | null>(null);
  const [generating, setGenerating] = useState(false);
  const [expandingNodeId, setExpandingNodeId] = useState<string | null>(null);
  const [activeAiNodeId, setActiveAiNodeId] = useState<string | null>(null);
  const [progressIndex, setProgressIndex] = useState(0);
  const [savedMemories, setSavedMemories] = useState<StudentWorkflowMemory[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [databaseConnected, setDatabaseConnected] = useState(false);
  const [databaseSaving, setDatabaseSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const savedMemoriesRef = useRef<StudentWorkflowMemory[]>([]);
  const pendingPositionsRef = useRef<Record<string, StudentWorkflowPosition> | null>(null);
  const restoredCourseIdsRef = useRef(new Set<string>());
  const requestedWorkflowRestoredRef = useRef(false);

  useEffect(() => {
    if (courses.length === 0) {
      setSelectedCourseId('');
      return;
    }
    setSelectedCourseId((current) => {
      if (current && courses.some((course) => course.id === current)) return current;
      const requestedCourseId = new URLSearchParams(window.location.search).get('course');
      return courses.some((course) => course.id === requestedCourseId)
        ? requestedCourseId!
        : courses[0]!.id;
    });
  }, [courses]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    let cancelled = false;
    async function hydrateMemories() {
      const localRecords = readStudentWorkflowMemories();
      const result = await hydrateStudentWorkflowMemories(localRecords);
      if (cancelled) return;
      for (const record of [...result.records].reverse()) saveStudentWorkflowMemory(record);
      savedMemoriesRef.current = result.records;
      setSavedMemories(result.records);
      setDatabaseConnected(result.databaseConnected);
      setStorageReady(true);
    }
    void hydrateMemories();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);
  const selectedIntent = INTENTS.find((item) => item.id === intent) ?? INTENTS[0]!;

  async function handleCreate() {
    if (!selectedCourse || !prompt.trim() || generating) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setProgressIndex(0);
    const progressTimer = window.setInterval(
      () => setProgressIndex((current) => Math.min(current + 1, 2)),
      1_100,
    );
    try {
      const nextWorkflow = await createStudentWorkflow({
        courseId: selectedCourse.id,
        prompt: prompt.trim(),
        intent,
        signal: controller.signal,
      });
      setWorkflow(nextWorkflow);
    } catch (error) {
      if (!controller.signal.aborted) {
        toast.error(error instanceof Error ? error.message : '学习工作流生成失败');
      }
    } finally {
      window.clearInterval(progressTimer);
      if (abortRef.current === controller) abortRef.current = null;
      setGenerating(false);
    }
  }

  async function handleNodeAction(
    parentNode: StudentWorkflowNode,
    action: StudentWorkflowAction,
    answer?: string,
  ) {
    if (!workflow || !selectedCourse || expandingNodeId) return;
    if (action === 'grade' && answer?.trim()) {
      setWorkflow((current) =>
        current
          ? {
              ...current,
              nodes: current.nodes.map((node) =>
                node.id === parentNode.id ? { ...node, studentAnswer: answer.trim() } : node,
              ),
            }
          : current,
      );
    }
    setExpandingNodeId(parentNode.id);
    try {
      const result = await expandStudentWorkflow({
        courseId: selectedCourse.id,
        prompt: workflow.prompt,
        intent: workflow.intent,
        action,
        parentNode,
        answer,
      });
      setWorkflow((current) => {
        if (!current) return current;
        const sourceMap = new Map(current.sources.map((source) => [source.sceneId, source]));
        for (const source of result.sources) sourceMap.set(source.sceneId, source);
        return {
          ...current,
          nodes: [...current.nodes, result.node],
          sources: [...sourceMap.values()],
        };
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '新学习节点生成失败');
    } finally {
      setExpandingNodeId(null);
    }
  }

  function editNode(nodeId: string, content: string) {
    setWorkflow((current) =>
      current
        ? {
            ...current,
            nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, content } : node)),
          }
        : current,
    );
  }

  function resetWorkflow() {
    abortRef.current?.abort();
    setWorkflow(null);
    setGenerating(false);
    setExpandingNodeId(null);
    setActiveAiNodeId(null);
  }

  const [canvasNodes, setCanvasNodes, onNodesChange] = useNodesState<StudentFlowNode>([]);

  const toggleNoteNodeSize = useCallback(
    (nodeId: string) => {
      setCanvasNodes((currentNodes) =>
        currentNodes.map((canvasNode) => {
          if (canvasNode.id !== nodeId) return canvasNode;
          const styleWidth =
            typeof canvasNode.style?.width === 'number' ? canvasNode.style.width : undefined;
          const currentWidth = canvasNode.measured?.width ?? styleWidth ?? 330;
          const shouldExpand = currentWidth < 500;
          return {
            ...canvasNode,
            style: {
              ...canvasNode.style,
              width: shouldExpand ? 620 : 330,
              height: shouldExpand ? 560 : 360,
            },
          };
        }),
      );
    },
    [setCanvasNodes],
  );

  function restoreMemory(memory: StudentWorkflowMemory) {
    pendingPositionsRef.current = memory.nodePositions;
    setCanvasNodes([]);
    setIntent(memory.workflow.intent);
    setPrompt(memory.workflow.prompt);
    setWorkflow(memory.workflow);
  }

  const flowNodes = useMemo(
    () =>
      workflow
        ? layoutWorkflowNodes(workflow, (node) => ({
            node,
            sources: workflow.sources,
            busy: expandingNodeId === node.id,
            aiOpen: activeAiNodeId === node.id,
            onAction: (targetNode, action, answer) =>
              void handleNodeAction(targetNode, action, answer),
            onEdit: editNode,
            onToggleSize: toggleNoteNodeSize,
            onToggleAi: (nodeId) =>
              setActiveAiNodeId((current) => (current === nodeId ? null : nodeId)),
            onOpenSource: (sceneId) =>
              router.push(
                `/student/classroom/${selectedCourseId}?scene=${encodeURIComponent(sceneId)}`,
              ),
          }))
        : [],
    // handleNodeAction reads the latest workflow and selected course from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      workflow,
      expandingNodeId,
      activeAiNodeId,
      router,
      selectedCourseId,
      toggleNoteNodeSize,
    ],
  );
  const flowEdges = useMemo(() => (workflow ? workflowEdges(workflow) : []), [workflow]);

  const savedForCourse = useMemo(
    () => savedMemories.filter((memory) => memory.courseId === selectedCourseId),
    [savedMemories, selectedCourseId],
  );

  useEffect(() => {
    if (!storageReady || !selectedCourseId || restoredCourseIdsRef.current.has(selectedCourseId)) {
      return;
    }
    restoredCourseIdsRef.current.add(selectedCourseId);
    const requestedWorkflowId = new URLSearchParams(window.location.search).get('workflow');
    const requested = requestedWorkflowRestoredRef.current
      ? undefined
      : savedMemoriesRef.current.find(
          (memory) =>
            memory.courseId === selectedCourseId && memory.workflow.id === requestedWorkflowId,
        );
    requestedWorkflowRestoredRef.current = true;
    const latest =
      requested ??
      savedMemoriesRef.current.find((memory) => memory.courseId === selectedCourseId);
    if (latest) restoreMemory(latest);
    // restoreMemory intentionally runs once when a course becomes active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId, storageReady]);

  useEffect(() => {
    if (flowNodes.length === 0) {
      setCanvasNodes([]);
      return;
    }
    const pendingPositions = pendingPositionsRef.current;
    setCanvasNodes((currentNodes) => {
      const currentById = new Map(currentNodes.map((node) => [node.id, node] as const));
      return flowNodes.map((node) => {
        const current = currentById.get(node.id);
        const savedLayout = pendingPositions?.[node.id];
        return {
          ...node,
          position: savedLayout
            ? { x: savedLayout.x, y: savedLayout.y }
            : (current?.position ?? node.position),
          style: {
            ...node.style,
            ...current?.style,
            ...(savedLayout?.width ? { width: savedLayout.width } : {}),
            ...(savedLayout?.height ? { height: savedLayout.height } : {}),
          },
        };
      });
    });
    pendingPositionsRef.current = null;
  }, [flowNodes, setCanvasNodes]);

  useEffect(() => {
    if (!storageReady || !workflow || !selectedCourseId) return;
    const saveTimer = window.setTimeout(() => {
      const now = Date.now();
      const existing = savedMemoriesRef.current.find(
        (memory) => memory.workflow.id === workflow.id,
      );
      const nodePositions = Object.fromEntries(
        canvasNodes.map((node) => {
          const styleWidth = typeof node.style?.width === 'number' ? node.style.width : undefined;
          const styleHeight =
            typeof node.style?.height === 'number' ? node.style.height : undefined;
          return [
            node.id,
            {
              x: node.position.x,
              y: node.position.y,
              ...(node.measured?.width || styleWidth
                ? { width: node.measured?.width ?? styleWidth }
                : {}),
              ...(node.measured?.height || styleHeight
                ? { height: node.measured?.height ?? styleHeight }
                : {}),
            },
          ];
        }),
      );
      const memory = {
        courseId: selectedCourseId,
        workflow,
        nodePositions,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      } satisfies StudentWorkflowMemory;
      const nextRecords = saveStudentWorkflowMemory(memory);
      savedMemoriesRef.current = nextRecords;
      setSavedMemories(nextRecords);
      setDatabaseSaving(true);
      void persistStudentWorkflowMemory(memory)
        .then(() => setDatabaseConnected(true))
        .catch(() => setDatabaseConnected(false))
        .finally(() => setDatabaseSaving(false));
    }, 300);
    return () => window.clearTimeout(saveTimer);
  }, [canvasNodes, selectedCourseId, storageReady, workflow]);

  return (
    <div
      className={`w-full overflow-hidden rounded-[28px] border border-white/80 bg-white/82 text-left shadow-2xl shadow-slate-900/[0.07] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/78 dark:shadow-black/20 ${
        standalone ? 'max-w-[1600px]' : 'max-w-[1180px]'
      }`}
    >
      <div className="border-b border-slate-100 px-5 py-5 dark:border-white/10 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
              <Route className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold">AI 学习工作流</p>
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                  可视化学习
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                从对话开始，把课程依据、讲解、练习和笔记连接起来
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-white/5">
              <BookOpen className="h-4 w-4 text-violet-500" />
              <select
                value={selectedCourseId}
                onChange={(event) => {
                  const nextCourseId = event.target.value;
                  restoredCourseIdsRef.current.delete(nextCourseId);
                  setSelectedCourseId(nextCourseId);
                  resetWorkflow();
                }}
                disabled={loadingCourses || courses.length === 0 || generating}
                className="max-w-56 bg-transparent pr-3 font-medium outline-none"
              >
                {loadingCourses ? <option>正在读取课程…</option> : null}
                {!loadingCourses && courses.length === 0 ? <option>暂无课程</option> : null}
                {courses.map((course) => (
                  <option key={course.id} value={course.id} className="text-slate-900">
                    {course.name}
                  </option>
                ))}
              </select>
            </label>
            {savedForCourse.length > 0 ? (
              <label className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-white/5">
                <History className="h-4 w-4 text-emerald-500" />
                <select
                  value=""
                  onChange={(event) => {
                    const memory = savedForCourse.find(
                      (record) => record.workflow.id === event.target.value,
                    );
                    if (memory) restoreMemory(memory);
                  }}
                  className="max-w-48 bg-transparent pr-3 text-xs font-medium outline-none"
                  aria-label="打开已保存学习记录"
                >
                  <option value="">学习记录（{savedForCourse.length}）</option>
                  {savedForCourse.map((memory) => (
                    <option
                      key={memory.workflow.id}
                      value={memory.workflow.id}
                      className="text-slate-900"
                    >
                      {memory.workflow.title} ·{' '}
                      {new Date(memory.updatedAt).toLocaleString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {workflow ? (
              <button
                type="button"
                onClick={resetWorkflow}
                className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                新建流程
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {!workflow ? (
        <div className="px-5 py-6 sm:px-7">
          <div className="grid gap-3 md:grid-cols-3">
            {INTENTS.map((item) => {
              const Icon = item.icon;
              const active = item.id === intent;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setIntent(item.id)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    active
                      ? 'border-violet-300 bg-violet-50 shadow-sm dark:border-violet-400/35 dark:bg-violet-500/10'
                      : 'border-slate-200 bg-slate-50/70 hover:border-violet-200 dark:border-white/10 dark:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        active
                          ? 'bg-violet-600 text-white'
                          : 'bg-white text-slate-500 dark:bg-white/10 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="font-semibold">{item.label}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {item.description}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedCourse ? (
            <div className="mt-5 rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-500 dark:bg-white/[0.04] dark:text-slate-400">
              当前课程：
              <strong className="text-slate-800 dark:text-slate-100">{selectedCourse.name}</strong>
              。AI 会从教师生成的课件和讲义中寻找依据，再搭建学习节点。
            </div>
          ) : null}

          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleCreate();
              }
            }}
            disabled={!selectedCourse || generating}
            placeholder={`${selectedIntent.placeholder}（Enter 开始，Shift+Enter 换行）`}
            className="mt-5 min-h-28 w-full resize-none bg-transparent text-[15px] leading-7 text-slate-800 outline-none placeholder:text-slate-300 disabled:opacity-60 dark:text-slate-100 dark:placeholder:text-slate-600"
          />

          {generating ? (
            <div className="mt-4 grid gap-2 rounded-2xl border border-violet-100 bg-violet-50/60 p-4 sm:grid-cols-3 dark:border-violet-400/15 dark:bg-violet-500/[0.06]">
              {['理解学习目标', '检索教师课程', '搭建学习节点'].map((label, index) => (
                <div
                  key={label}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
                    index <= progressIndex
                      ? 'bg-white text-violet-700 shadow-sm dark:bg-white/10 dark:text-violet-200'
                      : 'text-slate-400'
                  }`}
                >
                  {index < progressIndex ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : index === progressIndex ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full border text-[9px]">
                      {index + 1}
                    </span>
                  )}
                  {label}
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-white/10">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <GitBranch className="h-4 w-4" />
              <span>
                {databaseConnected
                  ? '以“匿名学生”身份保存到数据库，并按课程归入我的笔记'
                  : '数据库暂不可用，已保存在本机浏览器并等待同步'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!prompt.trim() || !selectedCourse || generating}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-blue-500 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              生成学习流程
              {!generating ? <Send className="h-4 w-4" /> : null}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/10 sm:px-7">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-900 dark:text-white">{workflow.title}</h2>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {workflow.nodes.length} 个节点
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{workflow.summary}</p>
            </div>
            {expandingNodeId ? (
              <div className="flex items-center gap-2 text-xs font-medium text-violet-600 dark:text-violet-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在生成新节点…
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <HardDrive className="h-4 w-4 text-emerald-500" />
                {databaseSaving
                  ? '正在保存到数据库…'
                  : databaseConnected
                    ? '已保存到数据库 · 匿名学生'
                    : '已保存到浏览器 · 等待数据库'}
                <span className="text-slate-300 dark:text-slate-600">·</span>
                拖拽节点调整位置
              </div>
            )}
          </div>

          <div
            className={`${standalone ? 'h-[calc(100vh-250px)] min-h-[680px]' : 'h-[680px]'} bg-[#f7f8fc] dark:bg-[#071023]`}
          >
            <Canvas
              key={workflow.id}
              nodes={canvasNodes}
              edges={flowEdges}
              onNodesChange={onNodesChange}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesConnectable={false}
              nodesDraggable
              panOnDrag
              fitView={!standalone}
              defaultViewport={standalone ? { x: 76, y: 96, zoom: 0.78 } : undefined}
              minZoom={0.35}
              maxZoom={1.3}
              fitViewOptions={{ padding: 0.18 }}
              proOptions={{ hideAttribution: true }}
            >
              <Controls showInteractive={false} position="bottom-left" />
            </Canvas>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 dark:border-white/10 sm:px-7">
            <div className="flex flex-wrap gap-2">
              {workflow.suggestedPrompts.map((suggestion) => (
                <span
                  key={suggestion}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                >
                  {suggestion}
                </span>
              ))}
            </div>
            {selectedCourse ? (
              <button
                type="button"
                onClick={() => router.push(`/student/classroom/${selectedCourse.id}`)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-300"
              >
                打开课程
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
