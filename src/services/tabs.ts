import { useAppStore } from '@/store/useAppStore';
import { makeTab } from './workspace-files';
import type { WorkspaceTab } from '@/types/workspace';

/** 把当前单文档字段写回活动标签（切换/关闭/新建前调用） */
function syncActiveTab(tabs: WorkspaceTab[], state: ReturnType<typeof useAppStore.getState>): WorkspaceTab[] {
  return tabs.map(tab => tab.id === state.activeTabId
    ? { ...tab, sql: state.sql, dialect: state.dialect, viewMode: state.viewMode, positions: state.nodePositions, erScope: state.erScope, selectedTableIds: [...state.selectedTableIds] }
    : tab);
}

function applyTab(state: ReturnType<typeof useAppStore.getState>, tab: WorkspaceTab): void {
  // 标签装载不产生画布撤销历史
  state.setHistorySuppressed(true);
  try {
    state.setSQL(tab.sql);
    state.setDialect(tab.dialect);
    state.setViewMode(tab.viewMode);
    state.setNodePositions(tab.positions);
    state.setERScope(tab.erScope);
    state.setSelectedTableIds(tab.selectedTableIds);
  } finally {
    state.setHistorySuppressed(false);
  }
}

export function switchTab(id: string): void {
  const state = useAppStore.getState();
  if (id === state.activeTabId) return;
  const target = state.tabs.find(tab => tab.id === id);
  if (!target) return;
  state.setTabs(syncActiveTab(state.tabs, state));
  applyTab(state, target);
  state.setActiveTabId(id);
}

export function newTab(): void {
  const state = useAppStore.getState();
  const tabs = syncActiveTab(state.tabs, state);
  const names = new Set(tabs.map(tab => tab.name));
  let n = 1;
  while (names.has(`查询 ${n}`)) n += 1;
  const tab = makeTab({ name: `查询 ${n}`, dialect: state.dialect });
  state.setTabs([...tabs, tab]);
  applyTab(state, tab);
  state.setActiveTabId(tab.id);
}

export function closeTab(id: string): void {
  const state = useAppStore.getState();
  const index = state.tabs.findIndex(tab => tab.id === id);
  if (index < 0) return;
  let tabs = syncActiveTab(state.tabs, state).filter(tab => tab.id !== id);
  if (tabs.length === 0) {
    tabs = [makeTab({ name: '查询 1', dialect: state.dialect })];
  }
  const wasActive = state.activeTabId === id;
  const neighbor = state.tabs[index + 1] ?? state.tabs[index - 1];
  const nextActiveId = wasActive
    ? (tabs.find(tab => tab.id === neighbor?.id)?.id ?? tabs[0]?.id ?? null)
    : state.activeTabId;
  const nextTab = tabs.find(tab => tab.id === nextActiveId) ?? tabs[0];
  state.setTabs(tabs);
  if (wasActive && nextTab) applyTab(state, nextTab);
  state.setActiveTabId(nextTab?.id ?? null);
}

export function renameTab(id: string, name: string): void {
  const state = useAppStore.getState();
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) return;
  state.setTabs(state.tabs.map(tab => tab.id === id ? { ...tab, name: trimmed } : tab));
}
