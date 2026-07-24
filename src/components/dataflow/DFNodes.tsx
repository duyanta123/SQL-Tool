import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type {
  DFSourceNodeData,
  DFTargetNodeData,
  DFCTENodeData,
  DFSubqueryNodeData,
  DFAggregateNodeData,
  DFLiteralNodeData,
  DFCTEGroupNodeData,
} from '@/types/dataflow';
import { DatabaseIcon, ArrowDownTrayIcon, GitBranchIcon, CircleDotIcon, TableIcon, SparklesIcon } from '../shared/Icon';

const HANDLE_STYLE: React.CSSProperties = {
  background: 'var(--color-bg)',
  borderColor: 'var(--color-border-strong)',
  width: 8,
  height: 8,
};

function NodeShell({
  accent,
  children,
  dashedBorder = false,
  subtitle,
  icon,
  small = false,
}: {
  accent: string;
  children: React.ReactNode;
  dashedBorder?: boolean;
  subtitle?: string;
  icon?: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: small ? 44 : 'var(--df-node-height)',
        border: `1px ${dashedBorder ? 'dashed' : 'solid'} var(--color-border)`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-bg)',
        padding: small ? '0 10px' : '0 12px',
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
        transition: 'border-color 150ms',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {icon && <span style={{ color: accent, display: 'flex', flexShrink: 0 }}>{icon}</span>}
      <div style={{ minWidth: 0, flex: 1 }}>
        {children}
        {subtitle && (
          <div
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

// Source node (table source) - top of TB flow
export const DFSourceNode = memo(({ data }: NodeProps & { data: DFSourceNodeData }) => (
  <>
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
    <NodeShell
      accent="var(--color-read)"
      icon={<DatabaseIcon size={14} />}
      subtitle={data.alias ? `AS ${data.alias}` : '源表'}
    >
      <div style={titleStyle}>{data.tableName}</div>
    </NodeShell>
  </>
));
DFSourceNode.displayName = 'DFSourceNode';

// Target node (INSERT/UPDATE/SELECT output)
export const DFTargetNode = memo(({ data }: NodeProps & { data: DFTargetNodeData }) => (
  <>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
    {data.operation === 'SELECT' && <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />}
    <NodeShell
      accent="var(--color-write)"
      icon={<ArrowDownTrayIcon size={14} />}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: 'var(--color-write)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 1,
        }}
      >
        {data.operation}
      </div>
      <div style={titleStyle}>{data.targetTable ?? data.label}</div>
    </NodeShell>
  </>
));
DFTargetNode.displayName = 'DFTargetNode';

// CTE node
export const DFCTENode = memo(({ data }: NodeProps & { data: DFCTENodeData }) => (
  <>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
    <NodeShell
      accent="var(--color-cte)"
      icon={<GitBranchIcon size={14} />}
      subtitle={`CTE · ${data.outputColumns.length} 列`}
    >
      <div style={titleStyle}>{data.cteName}</div>
    </NodeShell>
  </>
));
DFCTENode.displayName = 'DFCTENode';

// CTE Group (bounding box)
export const DFCTEGroupNode = memo(({ data }: NodeProps & { data: DFCTEGroupNodeData }) => (
  <><Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} /><div
    style={{
      width: '100%',
      height: '100%',
      border: '1px dashed var(--color-cte)',
      borderRadius: 'var(--radius-md)',
      background: 'rgba(139,92,246,0.04)',
      paddingTop: 24,
    }}
  >
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 12,
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--color-cte)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      CTE 组 ({data.cteCount})
    </div>
  </div></>
));
DFCTEGroupNode.displayName = 'DFCTEGroupNode';

// Subquery node
export const DFSubqueryNode = memo(({ data }: NodeProps & { data: DFSubqueryNodeData }) => (
  <>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
    <NodeShell
      accent="var(--color-subquery)"
      icon={<CircleDotIcon size={14} />}
      subtitle={`深度 ${data.depth}`}
      small
    >
      <div style={{ ...titleStyle, fontSize: 'var(--text-sm)' }}>子查询</div>
    </NodeShell>
  </>
));
DFSubqueryNode.displayName = 'DFSubqueryNode';

// Aggregate node
export const DFAggregateNode = memo(({ data }: NodeProps & { data: DFAggregateNodeData }) => (
  <>
    <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
    <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
    <NodeShell
      accent="var(--color-aggregate)"
      icon={<SparklesIcon size={14} />}
      subtitle={data.groupByColumns.length > 0 ? `BY ${data.groupByColumns.slice(0, 2).join(', ')}` : undefined}
      small
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: 'var(--color-aggregate)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        聚合
      </div>
      <div style={{ ...titleStyle, fontSize: 'var(--text-sm)' }}>
        {data.aggregateFunctions.slice(0, 2).join(', ') || 'GROUP BY'}
      </div>
    </NodeShell>
  </>
));
DFAggregateNode.displayName = 'DFAggregateNode';

// Literal / value node
export const DFLiteralNode = memo(({ data }: NodeProps & { data: DFLiteralNodeData }) => (
  <>
    <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
    <NodeShell
      accent="var(--color-text-muted)"
      icon={<TableIcon size={12} />}
      dashedBorder
      small
    >
      <div style={{ ...titleStyle, fontSize: 'var(--text-sm)' }}>{data.label ?? '值'}</div>
    </NodeShell>
  </>
));
DFLiteralNode.displayName = 'DFLiteralNode';

const titleStyle: React.CSSProperties = {
  fontSize: 'var(--text-base)',
  fontWeight: 600,
  color: 'var(--color-text)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
