import { memo, useMemo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import type { DFFlowEdgeData } from '@/types/dataflow';
import { useAppStore } from '@/store/useAppStore';

const KIND_COLORS: Record<string, string> = {
  read: 'var(--color-read)',
  join: 'var(--color-join)',
  pipe: 'var(--color-pipe)',
  write: 'var(--color-write)',
  output: 'var(--color-read)',
  correlate: 'var(--color-correlate)',
};

export const DFFlowEdge = memo((props: EdgeProps & { data?: DFFlowEdgeData }) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    style,
  } = props;

  const hoveredEdgeId = useAppStore(s => s.hoveredEdgeId);
  const setHoveredEdge = useAppStore(s => s.setHoveredEdge);
  const hoveredNodeId = useAppStore(s => s.hoveredNodeId);

  const isHovered = hoveredEdgeId === id;
  const isNodeHovered = !!hoveredNodeId && (props.source === hoveredNodeId || props.target === hoveredNodeId);
  const highlight = isHovered || isNodeHovered;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 6,
    offset: 16,
  });

  const edgeColor = data ? KIND_COLORS[data.kind] ?? 'var(--color-read)' : 'var(--color-read)';
  const isDashed = data?.kind === 'correlate';
  const isWrite = data?.kind === 'write';

  const edgeStyle = useMemo<React.CSSProperties>(() => ({
    stroke: highlight ? 'var(--color-accent)' : edgeColor,
    strokeWidth: highlight ? 2.5 : isWrite ? 2 : 1.5,
    strokeDasharray: isDashed ? '5 3' : undefined,
    ...style,
  }), [edgeColor, isDashed, isWrite, highlight, style]);

  const markerId = `arrow-${highlight ? 'hover' : data?.kind ?? 'default'}`;

  const label = data?.label;

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={edgeStyle}
        markerEnd={`url(#${markerId})`}
        interactionWidth={14}
      />

      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
              background: 'var(--color-bg)',
              border: `1px solid ${highlight ? 'var(--color-accent)' : 'var(--color-border)'}`,
              borderRadius: 3,
              padding: '1px 6px',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-sans)',
              color: highlight ? 'var(--color-accent)' : edgeColor,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              letterSpacing: 0.2,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Column-level lineage popover */}
      {isHovered && ((data?.columnMapping?.length ?? 0) > 0 || (data?.filters?.length ?? 0) > 0) && (
        <EdgeLabelRenderer>
          <div
            className="df-column-mapping-popover"
            style={{
              position: 'absolute',
              transform: `translate(-50%, 0) translate(${labelX}px, ${labelY + 12}px)`,
            }}
          >
            {data?.columnMapping && data.columnMapping.length > 0 && (
              <>
                <div className="df-mapping-title">列映射</div>
                {data.columnMapping.slice(0, 8).map((mapping, index) => (
                  <div className="df-mapping-row" key={index}>
                    <span className="df-mapping-target">{mapping.target.column}</span>
                    <span className="df-mapping-arrow">←</span>
                    <span className="df-mapping-source">
                      {mapping.source.column ? `${mapping.source.table}.${mapping.source.column}` : mapping.source.table}
                    </span>
                    {mapping.expression && <span className="df-mapping-expr" title={mapping.expression}>{mapping.expression}</span>}
                  </div>
                ))}
                {data.columnMapping.length > 8 && <div className="df-mapping-more">还有 {data.columnMapping.length - 8} 列…</div>}
              </>
            )}
            {data?.filters && data.filters.length > 0 && (
              <>
                <div className="df-mapping-title" style={{ marginTop: data?.columnMapping?.length ? 6 : 0 }}>过滤列</div>
                {data.filters.slice(0, 8).map((filter, index) => (
                  <div className="df-mapping-row" key={index}>
                    <span className="df-mapping-arrow">▸</span>
                    <span className="df-mapping-source">{filter.table}.{filter.column}</span>
                  </div>
                ))}
                {data.filters.length > 8 && <div className="df-mapping-more">还有 {data.filters.length - 8} 列…</div>}
              </>
            )}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Invisible hover zone */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        onMouseEnter={() => setHoveredEdge(id)}
        onMouseLeave={() => setHoveredEdge(null)}
        style={{ cursor: 'pointer' }}
      />
    </>
  );
});

DFFlowEdge.displayName = 'DFFlowEdge';

// Global SVG arrow markers (rendered once in DiagramCanvas)
export function EdgeArrowDefs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {Object.entries(KIND_COLORS).map(([kind, color]) => (
          <marker
            key={kind}
            id={`arrow-${kind}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 z" fill={color} />
          </marker>
        ))}
        <marker
          id="arrow-hover"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="var(--color-accent)" />
        </marker>
        <marker
          id="arrow-default"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="var(--color-read)" />
        </marker>
      </defs>
    </svg>
  );
}
