import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { switchTab } from '@/services/tabs';
import { makeTab } from '@/services/workspace-files';

function resetCanvasState() {
  const store = useAppStore.getState();
  store.setHistorySuppressed(true);
  store.setNodePositions({ er: {}, dataflow: {} });
  store.setViewMode('er');
  store.setERScope('current-sql');
  store.setSelectedTableIds([]);
  store.setHistorySuppressed(false);
  useAppStore.setState({ past: [], future: [] });
}

describe('画布撤销/重做 history', () => {
  beforeEach(() => {
    useAppStore.getState().setTabs([]);
    useAppStore.getState().setActiveTabId(null);
    useAppStore.getState().setSQL('');
    resetCanvasState();
  });

  it('节点拖动进入历史并可撤销/重做', () => {
    const store = useAppStore.getState();
    store.setNodePosition('table::users', { x: 10, y: 20 });
    expect(useAppStore.getState().nodePositions.er['table::users']).toEqual({ x: 10, y: 20 });
    expect(useAppStore.getState().past).toHaveLength(1);

    useAppStore.getState().undoCanvas();
    expect(useAppStore.getState().nodePositions.er['table::users']).toBeUndefined();
    expect(useAppStore.getState().future).toHaveLength(1);

    useAppStore.getState().redoCanvas();
    expect(useAppStore.getState().nodePositions.er['table::users']).toEqual({ x: 10, y: 20 });
  });

  it('视图切换、范围与表选择都进入历史', () => {
    const store = useAppStore.getState();
    store.setViewMode('dataflow');
    store.setERScope('database-schema');
    store.setSelectedTableIds(['users']);
    const state = useAppStore.getState();
    expect(state.past).toHaveLength(3);
    state.undoCanvas();
    expect(useAppStore.getState().selectedTableIds).toEqual([]);
    useAppStore.getState().undoCanvas();
    expect(useAppStore.getState().erScope).toBe('current-sql');
    useAppStore.getState().undoCanvas();
    expect(useAppStore.getState().viewMode).toBe('er');
  });

  it('历史抑制标志跳过记录（标签装载路径）', () => {
    const store = useAppStore.getState();
    store.setHistorySuppressed(true);
    store.setViewMode('dataflow');
    store.setNodePosition('table::a', { x: 1, y: 1 });
    store.setHistorySuppressed(false);
    expect(useAppStore.getState().past).toHaveLength(0);
  });

  it('切换标签页不产生画布历史', () => {
    const tabA = makeTab({ name: 'A', sql: 'SELECT 1', dialect: 'mysql' });
    const tabB = makeTab({ name: 'B', sql: 'SELECT 2', dialect: 'postgresql', viewMode: 'dataflow' });
    const store = useAppStore.getState();
    store.setTabs([tabA, tabB]);
    store.setActiveTabId(tabA.id);
    store.setSQL(tabA.sql);
    store.setDialect(tabA.dialect);
    resetCanvasState();
    switchTab(tabB.id);
    expect(useAppStore.getState().viewMode).toBe('dataflow');
    expect(useAppStore.getState().past).toHaveLength(0);
  });

  it('历史栈上限为 50 条', () => {
    const store = useAppStore.getState();
    for (let i = 0; i < 60; i++) store.setNodePosition('node-' + String(i), { x: i, y: 0 });
    expect(useAppStore.getState().past).toHaveLength(50);
  });
});
