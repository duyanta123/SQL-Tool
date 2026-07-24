import { DatabaseIcon } from './Icon';

export function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--color-text-muted)',
        gap: 12,
        padding: 40,
        textAlign: 'center',
      }}
    >
      <DatabaseIcon size={48} style={{ opacity: 0.3 }} />
      <div style={{ fontSize: 'var(--text-md)', color: 'var(--color-text-secondary)' }}>
        在左侧粘贴 SQL 以生成图形
      </div>
      <div style={{ fontSize: 'var(--text-sm)', maxWidth: 320, lineHeight: 1.6 }}>
        支持 SELECT、JOIN、CTE、子查询、CREATE TABLE、INSERT、UPDATE 等语法
      </div>
    </div>
  );
}
