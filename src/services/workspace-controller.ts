import { getWorkspace, saveWorkspace, setLastWorkspaceId } from './workspace-db';
import { snapshotWorkspace } from './workspace-files';
import { useAppStore } from '@/store/useAppStore';
import type { WorkspaceRecord } from '@/types/workspace';

export async function flushCurrentWorkspace(): Promise<WorkspaceRecord | null> {
  const state = useAppStore.getState();
  const current = state.currentWorkspaceId ? await getWorkspace(state.currentWorkspaceId) : undefined;
  const workspace = snapshotWorkspace(state, current?.createdAt);
  if (!workspace) return null;
  await saveWorkspace(workspace);
  await setLastWorkspaceId(workspace.id);
  return workspace;
}
