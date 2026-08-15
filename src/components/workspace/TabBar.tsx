import { useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { closeTab, newTab, renameTab, switchTab } from '@/services/tabs';

export function TabBar() {
  const tabs = useAppStore(s => s.tabs);
  const activeTabId = useAppStore(s => s.activeTabId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  // 区分“提交”与“取消”：Escape 卸载输入框触发的 blur 不应误提交
  const cancelRef = useRef(false);

  const startRename = (id: string, name: string) => { cancelRef.current = false; setEditingId(id); setDraft(name); };
  const commitRename = () => {
    if (!cancelRef.current && editingId) renameTab(editingId, draft);
    cancelRef.current = false;
    setEditingId(null);
  };

  return (
    <div className="tab-bar" role="tablist" aria-label="SQL 标签页">
      {tabs.map(tab => {
        const active = tab.id === activeTabId;
        return (
          <div key={tab.id} className={`tab-item${active ? ' active' : ''}`}>
            {editingId === tab.id ? (
              <input
                className="tab-rename-input"
                value={draft}
                autoFocus
                aria-label="标签页名称"
                onChange={event => setDraft(event.target.value)}
                onBlur={commitRename}
                onClick={event => event.stopPropagation()}
                onKeyDown={event => {
                  if (event.key === 'Enter') commitRename();
                  if (event.key === 'Escape') { cancelRef.current = true; setEditingId(null); }
                }}
              />
            ) : (
              <button
                role="tab"
                aria-selected={active}
                className="tab-select"
                onClick={() => switchTab(tab.id)}
                onDoubleClick={() => startRename(tab.id, tab.name)}
                title="双击重命名"
              >
                <span className="tab-name">{tab.name}</span>
              </button>
            )}
            <button className="tab-close" aria-label={`关闭标签页 ${tab.name}`} onClick={() => closeTab(tab.id)}>×</button>
          </div>
        );
      })}
      <button className="tab-add" aria-label="新建标签页" onClick={() => newTab()}>+</button>
    </div>
  );
}
