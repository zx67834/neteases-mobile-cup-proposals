import { Background, ReactFlow, type Edge, type Node, type ReactFlowProps } from '@xyflow/react';
import type { ReactNode } from 'react';
import '@xyflow/react/dist/style.css';

type CanvasProps<NodeType extends Node, EdgeType extends Edge> = ReactFlowProps<
  NodeType,
  EdgeType
> & {
  children?: ReactNode;
};

export const Canvas = <NodeType extends Node = Node, EdgeType extends Edge = Edge>({
  children,
  ...props
}: CanvasProps<NodeType, EdgeType>) => (
  <ReactFlow
    deleteKeyCode={['Backspace', 'Delete']}
    fitView
    panOnDrag={false}
    panOnScroll
    selectionOnDrag={true}
    zoomOnDoubleClick={false}
    {...props}
  >
    <Background bgColor="var(--sidebar)" />
    {children}
  </ReactFlow>
);
