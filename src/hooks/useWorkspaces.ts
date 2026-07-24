import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { DEFAULT_SQL } from '@/utils/test-sql';
import { getLastWorkspaceId, getWorkspace, listWorkspaces, saveWorkspace, setLastWorkspaceId } from '@/services/workspace-db';
import { createWorkspaceRecord, parseShareHash } from '@/services/workspace-files';
import type { WorkspaceRecord } from '@/types/workspace';
import { flushCurrentWorkspace } from '@/services/workspace-controller';

let initializationPromise: Promise<void> | null = null;

export function useWorkspaces(): void {
  const ready = useAppStore(state => state.workspaceReady);
  const currentWorkspaceId = useAppStore(state => state.currentWorkspaceId);
  const workspaceName = useAppStore(state => state.workspaceName);
  const sql = useAppStore(state => state.sql);
  const dialect = useAppStore(state => state.dialect);
  const viewMode = useAppStore(state => state.viewMode);
  const nodePositions = useAppStore(state => state.nodePositions);
  const databaseProfileId = useAppStore(state => state.databaseProfileId);
  const erScope = useAppStore(state => state.erScope);
  const selectedTableIds = useAppStore(state => state.selectedTableIds);
  const autoSyncSchema = useAppStore(state => state.autoSyncSchema);
  const schemaSnapshot = useAppStore(state => state.schemaSnapshot);

  useEffect(() => {
    let active = true;
    initializationPromise ??= initialize();
    void initializationPromise.then(() => { if (active) useAppStore.getState().setWorkspaceReady(true); }).catch(error => {
      useAppStore.getState().pushToast('error', `工作区初始化失败：${error instanceof Error ? error.message : String(error)}`);
      useAppStore.getState().setWorkspaceReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready || !currentWorkspaceId) return;
    const timer = window.setTimeout(async () => {
      try {
        await flushCurrentWorkspace();
        await refreshWorkspaceList();
      } catch (error) {
        useAppStore.getState().pushToast('error', `自动保存失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [ready, currentWorkspaceId, workspaceName, sql, dialect, viewMode, nodePositions, databaseProfileId, erScope, selectedTableIds, autoSyncSchema, schemaSnapshot]);
}

async function initialize(): Promise<void> {
  const shared = parseShareHash(window.location.hash);
  if (shared) {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    await saveWorkspace(shared);
    await openWorkspace(shared);
    useAppStore.getState().pushToast('success', '已从本地分享链接创建工作区');
    return;
  }
  const all = await listWorkspaces();
  const lastId = await getLastWorkspaceId();
  const selected = (lastId && await getWorkspace(lastId)) || all[0];
  if (selected) await openWorkspace(selected);
  else {
    const initial = createWorkspaceRecord('示例查询', DEFAULT_SQL);
    await saveWorkspace(initial);
    await openWorkspace(initial);
  }
}

export async function openWorkspace(workspace: WorkspaceRecord): Promise<void> {
  useAppStore.getState().loadWorkspace(workspace);
  await setLastWorkspaceId(workspace.id);
  await refreshWorkspaceList();
}

export async function refreshWorkspaceList(): Promise<void> {
  const items = await listWorkspaces();
  useAppStore.getState().setWorkspaces(items.map(({ id, name, updatedAt }) => ({ id, name, updatedAt })));
}
