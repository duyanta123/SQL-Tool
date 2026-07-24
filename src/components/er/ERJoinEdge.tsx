import { memo, useMemo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import type { ERJoinEdgeData } from '@/types/er-diagram';
import { useAppStore } from '@/store/useAppStore';
import { XIcon } from '../shared/Icon';

export const ERJoinEdge = memo((props: EdgeProps & { data?: ERJoinEdgeData }) => {
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
    markerEnd,
  } = props;

  const hoveredEdgeId = useAppStore(s => s.hoveredEdgeId);
  const setHoveredEdge = useAppStore(s => s.setHoveredEdge);
  const setSelectedEdge = useAppStore(s => s.setSelectedEdge);
  const selectedEdgeId = useAppStore(s => s.selectedEdgeId);
  const hoveredNodeId = useAppStore(s => s.hoveredNodeId);

  const isHovered = hoveredEdgeId === id;
  const isSelected = selectedEdgeId === id;
  const isNodeHovered = !!hoveredNodeId && (props.source === hoveredNodeId || props.target === hoveredNodeId);
  const highlight = isHovered || isSelected || isNodeHovered;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25,
  });

  const { edgeStyle, showSourceDot, showTargetDot } = useMemo(() => {
    let stroke = 'var(--color-border-strong)';
    let strokeWidth = 1.5;
    let dashArray: string | undefined;
    let sDot = false;
    let tDot = false;

    if (data?.highConfidence) {
      stroke = 'var(--color-accent)';
      strokeWidth = 2;
    }

    if (data?.joinType === 'CROSS JOIN') {
      dashArray = '5 3';
    } else if (data?.joinType === 'LEFT JOIN') {
      sDot = true;
    } else if (data?.joinType === 'RIGHT JOIN') {
      tDot = true;
    } else if (data?.joinType === 'FK') {
      stroke = 'var(--color-accent)';
      strokeWidth = 2;
    }

    if (highlight) {
      stroke = 'var(--color-accent)';
      strokeWidth = isSelected ? 2.5 : isHovered ? 2.5 : 2;
    }

    return {
      edgeStyle: {
        stroke,
        strokeWidth,
        strokeDasharray: dashArray,
        ...style,
      },
      showSourceDot: sDot,
      showTargetDot: tDot,
    };
  }, [data, highlight, isHovered, isSelected, style]);

  const card = data?.cardinality;
  const [sourceCard, targetCard] = card?.split(':') ?? [];

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={edgeStyle}
        markerEnd={markerEnd}
        interactionWidth={14}
      />
      {/* Source dot (LEFT JOIN - optional) */}
      {showSourceDot && (
        <circle
          cx={sourceX}
          cy={sourceY}
          r={3.5}
          fill="var(--color-bg)"
          stroke={edgeStyle.stroke}
          strokeWidth={1.5}
        />
      )}
      {/* Target dot (RIGHT JOIN) */}
      {showTargetDot && (
        <circle
          cx={targetX}
          cy={targetY}
          r={3.5}
          fill="var(--color-bg)"
          stroke={edgeStyle.stroke}
          strokeWidth={1.5}
        />
      )}

      {/* Cardinality labels at endpoints */}
      {card && <EdgeLabelRenderer>
        <CardinalityBadge
          x={sourceX + (targetX > sourceX ? 14 : -14)}
          y={sourceY}
          label={sourceCard}
          highlight={highlight}
        />
        <CardinalityBadge
          x={targetX + (targetX > sourceX ? -14 : 14)}
          y={targetY}
          label={targetCard}
          highlight={highlight}
        />
      </EdgeLabelRenderer>}

      {/* JOIN type chip in middle */}
      {data?.joinType && data.joinType !== 'FK' && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
              fontSize: 9,
              fontWeight: 500,
              color: highlight ? 'var(--color-accent)' : 'var(--color-text-muted)',
              fontFamily: 'var(--font-sans)',
              background: 'var(--color-bg)',
              padding: '1px 6px',
              borderRadius: 3,
              border: '1px solid var(--color-border)',
              letterSpacing: 0.3,
              textTransform: 'uppercase',
            }}
          >
            {data.joinType.replace(' JOIN', '')}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* JOIN condition popover on selection */}
      {isSelected && data && (
        <EdgeLabelRenderer>
          <div
            className="join-condition-popover"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - 16}px)`,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-accent)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 12px',
              minWidth: 260,
              maxWidth: 380,
              pointerEvents: 'auto',
              fontFamily: 'var(--font-sans)',
              zIndex: 20,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {data.joinType} 条件
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedEdge(null); }}
                style={{
                  color: 'var(--color-text-muted)',
                  display: 'flex',
                  cursor: 'pointer',
                  padding: 2,
                  borderRadius: 3,
                  border: 'none',
                  background: 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
              >
                <XIcon size={12} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {data.conditions.length > 0 ? (
                data.conditions.map((cond, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 'var(--text-sm)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>{cond.leftTable}.{cond.leftColumn}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{cond.operator}</span>
                    <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>{cond.rightTable}.{cond.rightColumn}</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {data.conditionSQL || '(无条件)'}
                </div>
              )}
            </div>
            {data.cardinality && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                关系基数: <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{data.cardinality}</span>
                {data.highConfidence && <span style={{ marginLeft: 8, color: 'var(--color-accent)' }}>(高置信度 · 外键)</span>}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Invisible wider path for hover */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        onMouseEnter={() => setHoveredEdge(id)}
        onMouseLeave={() => setHoveredEdge(null)}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedEdge(isSelected ? null : id);
        }}
        style={{ cursor: 'pointer' }}
      />
    </>
  );
});

ERJoinEdge.displayName = 'ERJoinEdge';

function CardinalityBadge({ x, y, label, highlight }: { x: number; y: number; label: string; highlight?: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
        pointerEvents: 'none',
        minWidth: 18,
        height: 18,
        padding: '0 4px',
        borderRadius: 3,
        background: 'var(--color-bg)',
        border: `1px solid ${highlight ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        fontWeight: 700,
        color: highlight ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        fontFamily: 'var(--font-mono)',
        lineHeight: 1,
      }}
    >
      {label}
    </div>
  );
}
