import { openDB, type DBSchema } from 'idb';
import type { WorkspaceRecord, WorkspaceRecordV1 } from '@/types/workspace';
import { migrateWorkspace } from './workspace-files';

interface WorkspaceDatabase extends DBSchema {
  workspaces: { key: string; value: WorkspaceRecord | WorkspaceRecordV1; indexes: { 'by-updated': number } };
  meta: { key: string; value: string };
}

const dbPromise = openDB<WorkspaceDatabase>('sql-visualizer', 1, {
  upgrade(db) {
    const workspaces = db.createObjectStore('workspaces', { keyPath: 'id' });
    workspaces.createIndex('by-updated', 'updatedAt');
    db.createObjectStore('meta');
  },
});

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  const db = await dbPromise;
  return (await db.getAll('workspaces')).map(migrateWorkspace).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getWorkspace(id: string): Promise<WorkspaceRecord | undefined> {
  const workspace = await (await dbPromise).get('workspaces', id);
  return workspace ? migrateWorkspace(workspace) : undefined;
}

export async function saveWorkspace(workspace: WorkspaceRecord): Promise<void> {
  await (await dbPromise).put('workspaces', workspace);
}

export async function removeWorkspace(id: string): Promise<void> {
  await (await dbPromise).delete('workspaces', id);
}

export async function getLastWorkspaceId(): Promise<string | undefined> {
  return (await dbPromise).get('meta', 'last-workspace');
}

export async function setLastWorkspaceId(id: string): Promise<void> {
  await (await dbPromise).put('meta', id, 'last-workspace');
}
