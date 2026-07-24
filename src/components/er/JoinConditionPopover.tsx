import { memo } from 'react';
import { EdgeLabelRenderer } from '@xyflow/react';
import type { ERJoinEdgeData } from '@/types/er-diagram';
import { useAppStore } from '@/store/useAppStore';
import { XIcon } from '../shared/Icon';

interface JoinConditionPopoverProps {
  edgeId: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  data?: ERJoinEdgeData;
}

export const JoinConditionPopover = memo(function JoinConditionPopover({
  edgeId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: JoinConditionPopoverProps) {
  const selectedEdgeId = useAppStore(s => s.selectedEdgeId);
  const setSelectedEdge = useAppStore(s => s.setSelectedEdge);

  if (selectedEdgeId !== edgeId || !data) return null;

  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  return (
    <EdgeLabelRenderer>
      <div
        className="join-condition-popover"
        style={{
          transform: `translate(-50%, -50%) translate(${midX}px, ${midY - 20}px)`,
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: 12,
          minWidth: 240,
          maxWidth: 360,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          pointerEvents: 'auto',
          fontFamily: 'var(--font-sans)',
          zIndex: 20,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {data.joinType} 条件
          </div>
          <button
            onClick={() => setSelectedEdge(null)}
            style={{ color: 'var(--color-text-muted)', display: 'flex' }}
          >
            <XIcon size={14} />
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
                <span style={{ color: 'var(--color-fk)' }}>{cond.leftTable}.{cond.leftColumn}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>{cond.operator}</span>
                <span style={{ color: 'var(--color-fk)' }}>{cond.rightTable}.{cond.rightColumn}</span>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              {data.conditionSQL || '(无条件)'}
            </div>
          )}
        </div>
      </div>
    </EdgeLabelRenderer>
  );
});
