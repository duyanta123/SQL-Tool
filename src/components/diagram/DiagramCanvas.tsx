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

const erNodeTypes: NodeTypes = {
  erTable: ERTableNode as any,
};

const erEdgeTypes: EdgeTypes = {
  erJoin: ERJoinEdge as any,
};

const dfNodeTypes: NodeTypes = {
  dfSource: DFSourceNode as any,
  dfTarget: DFTargetNode as any,
  dfCte: DFCTENode as any,
  dfCteGroup: DFCTEGroupNode as any,
  dfSubquery: DFSubqueryNode as any,
  dfAggregate: DFAggregateNode as any,
  dfLiteral: DFLiteralNode as any,
};

const dfEdgeTypes: EdgeTypes = {
  dfFlow: DFFlowEdge as any,
};

interface DiagramCanvasProps {
  nodes: Node[];
  edges: Edge[];
  mode: 'er' | 'dataflow';
}

export function DiagramCanvas({ nodes, edges, mode }: DiagramCanvasProps) {
  const reactFlowRef = useRef<any>(null);
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

  const handleEdgeMouseEnter = useCallback((_e: any, edge: any) => {
    setHoveredEdge(edge.id);
  }, [setHoveredEdge]);

  const handleEdgeMouseLeave = useCallback(() => {
    setHoveredEdge(null);
  }, [setHoveredEdge]);

  const handleEdgeClick = useCallback((e: any, edge: any) => {
    e.stopPropagation();
    setSelectedEdge(edge.id);
  }, [setSelectedEdge]);

  const handlePaneClick = useCallback(() => {
    setSelectedEdge(null);
    setHoveredNode(null);
  }, [setSelectedEdge, setHoveredNode]);

  const handleNodeDragStop = useCallback((_e: any, node: any) => {
    setNodePosition(node.id, node.position);
  }, [setNodePosition]);

  const handleNodeMouseEnter = useCallback((_e: any, node: any) => {
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

  void reactFlowRef;

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
      <ErrorBoundary>
        {isEmpty ? (
          <EmptyState />
        ) : (
          <ReactFlow
            key={mode}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(inst: any) => {
              reactFlowRef.current = inst;
              setTimeout(fitContent, 80);
            }}
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
            defaultEdgeOptions={{ type: mode === 'er' ? 'erJoin' : 'dfFlow', animated: false }}
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
