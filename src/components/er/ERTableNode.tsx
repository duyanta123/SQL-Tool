import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ERNodeData } from '@/types/er-diagram';
import { KeyIcon, LinkIcon } from '../shared/Icon';

export const ERTableNode = memo(({ data, selected }: NodeProps & { data: ERNodeData }) => {
  const isVirtual = data.kind !== 'table';
  const bgColor = isVirtual ? 'var(--color-bg-subtle)' : 'var(--color-bg)';

  const name = data.kind === 'table' ? data.displayName : data.name;
  const tableType = data.kind === 'table' ? data.tableType : data.kind;
  const columns = data.columns ?? [];

  return (
    <div
      style={{
        width: 'var(--er-node-width)',
        borderRadius: 'var(--radius-md)',
        border: selected ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
        background: bgColor,
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
        boxShadow: 'none',
        transition: 'border-color 150ms ease',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{
          background: 'var(--color-bg)',
          borderColor: 'var(--color-border-strong)',
          width: 8,
          height: 8,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{
          background: 'var(--color-bg)',
          borderColor: 'var(--color-border-strong)',
          width: 8,
          height: 8,
        }}
      />

      {/* Header */}
      <div
        style={{
          height: 'var(--er-header-height)',
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-node-header)',
          borderBottom: '1px solid var(--color-border)',
          gap: 8,
        }}
      >
        <div
          title={data.kind === 'table' ? data.comment : undefined}
          style={{
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            color: 'var(--color-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
        {tableType !== 'physical' && (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-border)',
              color: 'var(--color-text-secondary)',
              textTransform: 'uppercase',
              fontWeight: 500,
              letterSpacing: 0.3,
              flexShrink: 0,
            }}
          >
            {tableType === 'cte' ? 'CTE' : tableType === 'subquery' ? '子查询' : tableType}
          </span>
        )}
      </div>

      {/* Columns */}
      <div style={{ padding: '4px 0' }}>
        {columns.length === 0 ? (
          <div
            style={{
              padding: '8px 12px',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
              fontStyle: 'italic',
            }}
          >
            {data.kind === 'table' && data.source === 'inferred'
              ? '(未检测到列信息)'
              : ''}
          </div>
        ) : (
          columns.map((col, idx) => (
            <div
              key={`${col.name}-${idx}`}
              title={col.comment}
              style={{
                height: 'var(--er-row-height)',
                padding: '0 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {col.isPK && (
                <span title="Primary Key" style={{ color: 'var(--color-pk)', display: 'flex' }}>
                  <KeyIcon size={12} />
                </span>
              )}
              {col.isFK && !col.isPK && (
                <span title={`Foreign Key → ${col.fkRefTable}`} style={{ color: 'var(--color-fk)', display: 'flex' }}>
                  <LinkIcon size={12} />
                </span>
              )}
              {!col.isPK && !col.isFK && <span style={{ width: 12, flexShrink: 0 }} />}
              <span
                style={{
                  color: 'var(--color-text)',
                  fontWeight: col.isPK ? 600 : 400,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.name}
              </span>
              {col.source === 'sql-inferred' && (
                <span className="inferred-column-badge" title="由当前 SQL 的字段引用推断（类型为启发式推测，可能与真实定义不同）">推断</span>
              )}
              <span
                style={{
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--text-xs)',
                  flexShrink: 0,
                }}
              >
                {col.type}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

ERTableNode.displayName = 'ERTableNode';
