import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';

export interface DagreLayoutOptions {
  rankdir?: 'TB' | 'LR' | 'BT' | 'RL';
  nodesep?: number;
  ranksep?: number;
  marginx?: number;
  marginy?: number;
  getNodeSize?: (node: Node) => { width: number; height: number };
}

const DEFAULT_SIZE = { width: 180, height: 60 };

export function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  options: DagreLayoutOptions = {}
): Node[] {
  const {
    rankdir = 'TB',
    nodesep = 50,
    ranksep = 80,
    marginx = 40,
    marginy = 40,
    getNodeSize,
  } = options;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir, nodesep, ranksep, marginx, marginy });

  const sizedNodes = nodes.map(node => {
    const size = getNodeSize?.(node) ?? {
      width: (node.measured?.width as number) ?? (node.width as number) ?? DEFAULT_SIZE.width,
      height: (node.measured?.height as number) ?? (node.height as number) ?? DEFAULT_SIZE.height,
    };
    return { ...node, width: size.width, height: size.height };
  });

  for (const node of sizedNodes) {
    g.setNode(node.id, { width: node.width, height: node.height });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return sizedNodes.map(node => {
    const pos = g.node(node.id);
    if (!pos) return node;
    return {
      ...node,
      position: {
        x: pos.x - (node.width ?? DEFAULT_SIZE.width) / 2,
        y: pos.y - (node.height ?? DEFAULT_SIZE.height) / 2,
      },
    };
  });
}
