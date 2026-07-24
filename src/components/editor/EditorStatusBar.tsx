import { useAppStore } from '@/store/useAppStore';
import { CheckIcon, AlertIcon } from '../shared/Icon';

export function EditorStatusBar() {
  const error = useAppStore(s => s.error);
  const stats = useAppStore(s => s.stats);
  const dialect = useAppStore(s => s.dialect);
  const parseTimeMs = useAppStore(s => s.parseTimeMs);
  const warnings = useAppStore(s => s.warnings);
  const isParsing = useAppStore(s => s.isParsing);
  const isStale = useAppStore(s => s.isStale);

  return (
    <div
      style={{
        height: 'var(--statusbar-height)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        background: 'var(--color-bg-subtle)',
        borderTop: '1px solid var(--color-border)',
        fontSize: 'var(--text-xs)',
        color: error ? 'var(--color-error)' : 'var(--color-text-secondary)',
        flexShrink: 0,
        gap: 8,
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', minWidth: 0 }}>
        {error ? (
          <>
            <AlertIcon size={12} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {error.message}
              {error.line ? ` (行 ${error.line})` : ''}
            </span>
          </>
        ) : (
          <>
            <CheckIcon size={12} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
            <span title={warnings.map(warning => warning.message).join('\n') || undefined} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isParsing ? '解析中…' : isStale ? '显示上一次有效结果 · ' : '已解析 · '}{stats.tableCount} 表 · {stats.joinCount} 关系
              {stats.cteCount > 0 ? ` · ${stats.cteCount} CTE` : ''}
              {stats.subqueryCount > 0 ? ` · ${stats.subqueryCount} 子查询` : ''}
              {warnings.length > 0 ? ` · ${warnings.length} 条提示` : ''}
              {parseTimeMs != null ? ` · ${parseTimeMs}ms` : ''}
            </span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, color: 'var(--color-text-muted)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{dialect}</span>
      </div>
    </div>
  );
}
