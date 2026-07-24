import type { Node, Edge } from '@xyflow/react';
import type { ERGraph } from '@/types/er-diagram';
import { applyDagreLayout } from './dagre-layout';
import { ER_LAYOUT_CONFIG, ER_NODE_WIDTH, ER_HEADER_HEIGHT, ER_ROW_HEIGHT, ER_PADDING } from '@/utils/constants';

function estimateHeight(data: any): number {
  const colCount = data.columns?.length ?? 0;
  return ER_HEADER_HEIGHT + colCount * ER_ROW_HEIGHT + ER_PADDING;
}

export function layoutERGraph(graph: ERGraph): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map((data) => {
    const id = data.id;
    const height = estimateHeight(data);
    return {
      id,
      type: 'erTable',
      position: { x: 0, y: 0 },
      data: data as unknown as Record<string, unknown>,
      width: ER_NODE_WIDTH,
      height,
      style: { width: ER_NODE_WIDTH, height },
    };
  });

  const nodeIds = new Set(nodes.map(node => node.id));
  const edges: Edge[] = graph.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target)).map((data) => ({
      id: data.id,
      source: data.source,
      target: data.target,
      type: 'erJoin',
      data: data as unknown as Record<string, unknown>,
    }));

  const layoutedNodes = applyDagreLayout(nodes, edges, {
    ...ER_LAYOUT_CONFIG,
    getNodeSize: n => ({
      width: (n.width as number) ?? ER_NODE_WIDTH,
      height: (n.height as number) ?? estimateHeight(n.data),
    }),
  });

  return { nodes: layoutedNodes, edges };
}
