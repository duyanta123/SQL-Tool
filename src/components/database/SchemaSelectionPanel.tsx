import { useMemo, useState } from 'react';
import { disconnectDatabase, refreshDatabaseSchema } from '@/services/database';
import { useAppStore } from '@/store/useAppStore';

export function SchemaSelectionPanel({ onClose, onConnect }: { onClose: () => void; onConnect: () => void }) {
  const snapshot = useAppStore(state => state.schemaSnapshot);
  const selected = useAppStore(state => state.selectedTableIds);
  const setSelected = useAppStore(state => state.setSelectedTableIds);
  const autoSync = useAppStore(state => state.autoSyncSchema);
  const setAutoSync = useAppStore(state => state.setAutoSyncSchema);
  const syncStatus = useAppStore(state => state.schemaSyncStatus);
  const syncError = useAppStore(state => state.schemaSyncError);
  const connected = useAppStore(state => state.isDatabaseConnected);
  const pushToast = useAppStore(state => state.pushToast);
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => (snapshot?.tables ?? []).filter(table => `${table.schema ?? ''}.${table.name}`.toLowerCase().includes(search.toLowerCase())), [snapshot, search]);
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id]);
  const refresh = () => void refreshDatabaseSchema().catch(error => pushToast('error', error instanceof Error ? error.message : String(error)));
  return (
    <aside className="schema-panel" aria-label="数据库 Schema 表选择">
      <header><div><strong>数据库 Schema</strong><span className={`sync-status ${syncStatus}`}>{syncStatus === 'syncing' ? '同步中' : syncStatus === 'stale' ? '已过期' : connected ? '已连接' : '离线快照'}</span></div><button type="button" aria-label="关闭 Schema 面板" onClick={onClose}>×</button></header>
      <div className="schema-panel-actions"><button type="button" onClick={onConnect}>连接…</button><button type="button" disabled={syncStatus === 'syncing'} onClick={refresh}>立即刷新</button><button type="button" disabled={!connected} onClick={() => void disconnectDatabase()}>断开</button></div>
      <label className="checkbox-label"><input type="checkbox" checked={autoSync} onChange={event => setAutoSync(event.target.checked)} />每 30 秒自动同步</label>
      {snapshot && <p className="sync-time">最近同步：{new Date(snapshot.fetchedAt).toLocaleString()}</p>}
      {syncError && <p className="field-error" role="alert">{syncError}（已保留上次有效 Schema）</p>}
      <input className="schema-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索 Schema 或表名" aria-label="搜索 Schema 或表名" />
      <div className="schema-selection-tools"><button type="button" onClick={() => setSelected(snapshot?.tables.map(table => table.id) ?? [])}>全选</button><button type="button" onClick={() => setSelected([])}>全部取消</button><span>{selected.length}/{snapshot?.tables.length ?? 0}</span></div>
      <div className="schema-table-list">
        {filtered.map(table => <label key={table.id}><input type="checkbox" checked={selected.includes(table.id)} onChange={() => toggle(table.id)} /><span><strong>{table.name}</strong>{table.kind === 'view' && <small className="schema-view-badge">视图</small>}{table.schema && <small>{table.schema}</small>}</span><em>{table.columns.length} 列</em></label>)}
        {!filtered.length && <p className="empty-list">没有匹配的表</p>}
      </div>
    </aside>
  );
}
