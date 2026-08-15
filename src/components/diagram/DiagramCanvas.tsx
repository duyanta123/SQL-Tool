import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  useReactFlow,
  type NodeTypes,
  type EdgeTypes,
  type Node,
  type Edge,
  type OnNodeDrag,
  type NodeMouseHandler,
  type EdgeMouseHandler,
} from '@xyflow/react';
import { useAppStore } from '@/store/useAppStore';
import { MiniMapStyled } from './MiniMapStyled';
import { ERTableNode } from '../er/ERTableNode';
import { ERJoinEdge } from '../er/ERJoinEdge';
import {
  DFSourceNode,
  DFTargetNode,
  DFCTENode,
  DFCTEGroupNode,
  DFSubqueryNode,
  DFAggregateNode,
  DFLiteralNode,
} from '../dataflow/DFNodes';
import { DFFlowEdge, EdgeArrowDefs } from '../dataflow/DFFlowEdge';
import { EmptyState } from '../shared/EmptyState';
import { ErrorBoundary } from '../shared/ErrorBoundary';

type NodeComponentType = NonNullable<NodeTypes[string]>;
type EdgeComponentType = NonNullable<EdgeTypes[string]>;

const erNodeTypes: NodeTypes = {
  erTable: ERTableNode as unknown as NodeComponentType,
};

const erEdgeTypes: EdgeTypes = {
  erJoin: ERJoinEdge as unknown as EdgeComponentType,
};

const dfNodeTypes: NodeTypes = {
  dfSource: DFSourceNode as unknown as NodeComponentType,
  dfTarget: DFTargetNode as unknown as NodeComponentType,
  dfCte: DFCTENode as unknown as NodeComponentType,
  dfCteGroup: DFCTEGroupNode as unknown as NodeComponentType,
  dfSubquery: DFSubqueryNode as unknown as NodeComponentType,
  dfAggregate: DFAggregateNode as unknown as NodeComponentType,
  dfLiteral: DFLiteralNode as unknown as NodeComponentType,
};

const dfEdgeTypes: EdgeTypes = {
  dfFlow: DFFlowEdge as unknown as EdgeComponentType,
};

interface DiagramCanvasProps {
  nodes: Node[];
  edges: Edge[];
  mode: 'er' | 'dataflow';
  searchMatchedIds?: Set<string>;
}

export function DiagramCanvas({ nodes, edges, mode, searchMatchedIds }: DiagramCanvasProps) {
  const setHoveredEdge = useAppStore(s => s.setHoveredEdge);
  const setSelectedEdge = useAppStore(s => s.setSelectedEdge);
  const setHoveredNode = useAppStore(s => s.setHoveredNode);
  const setNodePosition = useAppStore(s => s.setNodePosition);
  const isExporting = useAppStore(s => s.isExporting);
  const isStale = useAppStore(s => s.isStale);
  const mobilePanel = useAppStore(s => s.mobilePanel);
  const { fitView } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);

  const nodeTypes = mode === 'er' ? erNodeTypes : dfNodeTypes;
  const edgeTypes = mode === 'er' ? erEdgeTypes : dfEdgeTypes;
  const defaultEdgeOptions = useMemo(() => ({ type: mode === 'er' ? 'erJoin' : 'dfFlow', animated: false }), [mode]);

  const handleEdgeMouseEnter = useCallback<EdgeMouseHandler<Edge>>((_event, edge) => {
    setHoveredEdge(edge.id);
  }, [setHoveredEdge]);

  const handleEdgeMouseLeave = useCallback(() => {
    setHoveredEdge(null);
  }, [setHoveredEdge]);

  const handleEdgeClick = useCallback<EdgeMouseHandler<Edge>>((event, edge) => {
    event.stopPropagation();
    setSelectedEdge(edge.id);
  }, [setSelectedEdge]);

  const handlePaneClick = useCallback(() => {
    setSelectedEdge(null);
    setHoveredNode(null);
  }, [setSelectedEdge, setHoveredNode]);

  const handleNodeDragStop = useCallback<OnNodeDrag<Node>>((_event, node) => {
    setNodePosition(node.id, node.position);
  }, [setNodePosition]);

  const handleNodeMouseEnter = useCallback<NodeMouseHandler<Node>>((_event, node) => {
    setHoveredNode(node.id);
  }, [setHoveredNode]);

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, [setHoveredNode]);

  const isEmpty = nodes.length === 0;
  const nodeSignature = useMemo(() => nodes.map(node => node.id).sort().join('|'), [nodes]);

  const fitContent = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1 || nodes.length === 0) return;
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    void fitView({ padding: mobile ? 0.06 : 0.08, duration: 180, maxZoom: mobile ? 0.9 : 1.15 });
  }, [fitView, nodes.length]);

  useEffect(() => {
    let timer = window.setTimeout(fitContent, 80);
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(fitContent, 60);
    });
    if (containerRef.current) observer.observe(containerRef.current);
    const visibility = () => { if (!document.hidden) window.setTimeout(fitContent, 40); };
    document.addEventListener('visibilitychange', visibility);
    return () => { window.clearTimeout(timer); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, [fitContent, mode, mobilePanel, nodeSignature]);

  const displayNodes = useMemo(() => {
    if (!searchMatchedIds || searchMatchedIds.size === 0) return nodes;
    // 拼接而非覆盖节点已有 className
    return nodes.map(node => searchMatchedIds.has(node.id) ? { ...node, className: [node.className, 'search-match'].filter(Boolean).join(' ') } : node);
  }, [nodes, searchMatchedIds]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        inset: 0,
        background: 'var(--color-bg)',
      }}
      className={`${isExporting ? 'exporting' : ''} ${isStale ? 'diagram-stale' : ''}`}
    >
      {isStale && <div className="stale-banner" role="status">SQL 存在错误，当前显示上一次有效结果</div>}
      <ErrorBoundary onReset={() => { useAppStore.getState().setSelectedEdge(null); useAppStore.getState().setHoveredEdge(null); }}>
        {isEmpty ? (
          <EmptyState />
        ) : (
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onEdgeMouseEnter={handleEdgeMouseEnter}
            onEdgeMouseLeave={handleEdgeMouseLeave}
            onEdgeClick={mode === 'er' ? handleEdgeClick : undefined}
            onPaneClick={handlePaneClick}
            onNodeDragStop={handleNodeDragStop}
            onNodeMouseEnter={handleNodeMouseEnter}
            onNodeMouseLeave={handleNodeMouseLeave}
            fitView
            minZoom={0.1}
            maxZoom={2}
            defaultEdgeOptions={defaultEdgeOptions}
            proOptions={{ hideAttribution: false }}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            selectNodesOnDrag={false}
            panOnScroll
            style={{ background: 'var(--color-bg)' }}
          >
            <EdgeArrowDefs />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-grid)" />
            <Controls showInteractive={false} position="bottom-right" />
            <MiniMapStyled position="bottom-left" />
          </ReactFlow>
        )}
      </ErrorBoundary>
    </div>
  );
}
