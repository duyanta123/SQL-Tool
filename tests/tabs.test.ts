import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { closeTab, newTab, renameTab, switchTab } from '@/services/tabs';
import { makeTab } from '@/services/workspace-files';

function seedTabs() {
  const tabA = makeTab({ name: '查询 1', sql: 'SELECT 1', dialect: 'mysql' });
  const tabB = makeTab({ name: '查询 2', sql: 'SELECT 2', dialect: 'postgresql' });
  const store = useAppStore.getState();
  store.setTabs([tabA, tabB]);
  store.setActiveTabId(tabA.id);
  store.setSQL(tabA.sql);
  store.setDialect(tabA.dialect);
  return { tabA, tabB };
}

describe('多标签页 tabs', () => {
  beforeEach(() => {
    const store = useAppStore.getState();
    store.setTabs([]);
    store.setActiveTabId(null);
    store.setSQL('');
    store.setDialect('mysql');
    store.setNodePositions({ er: {}, dataflow: {} });
    store.setERScope('current-sql');
    store.setSelectedTableIds([]);
  });

  it('切换标签页时保存并恢复各自内容', () => {
    const { tabA, tabB } = seedTabs();
    switchTab(tabB.id);
    const state = useAppStore.getState();
    expect(state.activeTabId).toBe(tabB.id);
    expect(state.sql).toBe('SELECT 2');
    expect(state.dialect).toBe('postgresql');
    // 修改当前标签后切回，A 的内容应保留原样
    state.setSQL('SELECT 99');
    switchTab(tabA.id);
    const after = useAppStore.getState();
    expect(after.sql).toBe('SELECT 1');
    expect(after.tabs.find(tab => tab.id === tabB.id)?.sql).toBe('SELECT 99');
  });

  it('新建标签页默认名称为 查询 N 且内容为空', () => {
    seedTabs();
    newTab();
    const state = useAppStore.getState();
    expect(state.tabs).toHaveLength(3);
    const fresh = state.tabs.find(tab => tab.id === state.activeTabId);
    expect(fresh?.name).toBe('查询 3');
    expect(state.sql).toBe('');
  });

  it('关闭活动标签页后激活相邻标签页', () => {
    const { tabA, tabB } = seedTabs();
    closeTab(tabA.id);
    const state = useAppStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(tabB.id);
    expect(state.sql).toBe('SELECT 2');
  });

  it('关闭最后一个标签页时自动创建空标签页', () => {
    const { tabA } = seedTabs();
    useAppStore.getState().setTabs([tabA]);
    closeTab(tabA.id);
    const state = useAppStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.id).not.toBe(tabA.id);
    expect(state.sql).toBe('');
    expect(state.activeTabId).toBe(state.tabs[0]?.id);
  });

  it('重命名标签页并裁剪空名', () => {
    const { tabA } = seedTabs();
    renameTab(tabA.id, '  主查询  ');
    expect(useAppStore.getState().tabs.find(tab => tab.id === tabA.id)?.name).toBe('主查询');
    renameTab(tabA.id, '   ');
    expect(useAppStore.getState().tabs.find(tab => tab.id === tabA.id)?.name).toBe('主查询');
  });
});
