import type { Edge, Node } from '@xyflow/react';
import type { ERNodeData, ERJoinEdgeData } from './er-diagram';
import type { DFNodeData, DFFlowEdgeData } from './dataflow';

export type ViewMode = 'er' | 'dataflow';

export interface Position {
  x: number;
  y: number;
}

export type ERFlowNode = Node<ERNodeData & Record<string, unknown>>;
export type ERFlowEdge = Edge<ERJoinEdgeData & Record<string, unknown>>;
export type DFFlowNode = Node<DFNodeData & Record<string, unknown>>;
export type DFFlowEdge = Edge<DFFlowEdgeData & Record<string, unknown>>;
