import { useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';

export function useHoverHighlight() {
  const hoveredEdgeId = useAppStore(s => s.hoveredEdgeId);
  const erEdges = useAppStore(s => s.erEdges);
  const dfEdges = useAppStore(s => s.dfEdges);
  const setHoveredEdge = useAppStore(s => s.setHoveredEdge);

  const getConnectedNodeIds = useCallback((edgeId: string | null): Set<string> => {
    const ids = new Set<string>();
    if (!edgeId) return ids;
    const allEdges = [...erEdges, ...dfEdges];
    const edge = allEdges.find(e => e.id === edgeId);
    if (edge) {
      ids.add(edge.source);
      ids.add(edge.target);
    }
    return ids;
  }, [erEdges, dfEdges]);

  const getEdgeStyle = useCallback((edgeId: string, baseStyle?: React.CSSProperties): React.CSSProperties => {
    if (!hoveredEdgeId) return baseStyle ?? {};
    if (edgeId === hoveredEdgeId) {
      return {
        ...baseStyle,
        strokeWidth: 3,
        stroke: 'var(--color-accent)',
        opacity: 1,
      };
    }
    return { ...baseStyle, opacity: 0.15 };
  }, [hoveredEdgeId]);

  const getNodeStyle = useCallback((nodeId: string, baseStyle?: React.CSSProperties): React.CSSProperties => {
    if (!hoveredEdgeId) return baseStyle ?? {};
    const connected = getConnectedNodeIds(hoveredEdgeId);
    if (connected.has(nodeId)) {
      return {
        ...baseStyle,
        borderColor: 'var(--color-accent)',
        boxShadow: '0 0 0 2px var(--color-accent-soft)',
        opacity: 1,
      };
    }
    return { ...baseStyle, opacity: 0.3 };
  }, [hoveredEdgeId, getConnectedNodeIds]);

  return {
    hoveredEdgeId,
    setHoveredEdge,
    getEdgeStyle,
    getNodeStyle,
    getConnectedNodeIds,
  };
}
