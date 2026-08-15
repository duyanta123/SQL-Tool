import type { Node, Edge } from '@xyflow/react';
import type { DataFlowGraph, DFFlowEdgeData } from '@/types/dataflow';
import { applyDagreLayout } from './dagre-layout';
import {
  DF_LAYOUT_CONFIG,
  DF_NODE_WIDTH,
  DF_NODE_HEIGHT,
  DF_SMALL_NODE_WIDTH,
} from '@/utils/constants';

function dfNodeType(kind: string): string {
  switch (kind) {
    case 'source': return 'dfSource';
    case 'target': return 'dfTarget';
    case 'cte': return 'dfCte';
    case 'cte-group': return 'dfCteGroup';
    case 'subquery': return 'dfSubquery';
    case 'aggregate': return 'dfAggregate';
    case 'literal': return 'dfLiteral';
    default: return 'dfSource';
  }
}

function nodeSize(kind: string): { width: number; height: number } {
  switch (kind) {
    case 'source':
    case 'target':
      return { width: DF_NODE_WIDTH, height: DF_NODE_HEIGHT };
    case 'literal':
      return { width: DF_SMALL_NODE_WIDTH, height: 48 };
    case 'cte-group':
      return { width: DF_NODE_WIDTH + 40, height: DF_NODE_HEIGHT * 2 + 40 };
    default:
      return { width: DF_SMALL_NODE_WIDTH, height: DF_NODE_HEIGHT };
  }
}

function edgeColor(kind: string): string {
  switch (kind) {
    case 'read': return '#737373';
    case 'join': return '#5b5bd6';
    case 'pipe': return '#8b5cf6';
    case 'write': return '#30a46c';
    case 'output': return '#737373';
    case 'correlate': return '#f97316';
    default: return '#737373';
  }
}

export function layoutDataFlowGraph(graph: DataFlowGraph): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  graph.nodes.forEach((data) => {
    const finalId = data.id;
    const size = nodeSize(data.kind);
    const node: Node = {
      id: finalId,
      type: dfNodeType(data.kind),
      position: { x: 0, y: 0 },
      data: data as unknown as Record<string, unknown>,
      width: size.width,
      height: size.height,
      style: { width: size.width, height: size.height },
    };
    nodes.push(node);

  });

  const edges: Edge[] = [];
  // 防御：过滤悬空边，避免 dagre 为不存在的端点隐式创建无尺寸占位节点（与 er-layout 规则一致）
  const nodeIds = new Set(graph.nodes.map(data => data.id));
  graph.edges.forEach((data: DFFlowEdgeData & { id: string; source: string; target: string }) => {
    const sourceId = data.source;
    const targetId = data.target;
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) return;

    const color = edgeColor(data.kind);
    edges.push({
      id: data.id,
      source: sourceId,
      target: targetId,
      type: 'dfFlow',
      data: data as unknown as Record<string, unknown>,
      label: data.label,
      markerEnd: `url(#arrow-${data.kind})`,
      style: {
        stroke: color,
        strokeDasharray: data.kind === 'correlate' ? '6 3' : undefined,
        strokeWidth: data.kind === 'write' ? 2 : 1.5,
      },
    });
  });

  const layoutedNodes = applyDagreLayout(nodes, edges, {
    ...DF_LAYOUT_CONFIG,
    getNodeSize: n => ({
      width: (n.width as number) ?? DF_NODE_WIDTH,
      height: (n.height as number) ?? DF_NODE_HEIGHT,
    }),
  });

  return { nodes: layoutedNodes, edges };
}
