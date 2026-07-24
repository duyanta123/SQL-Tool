import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { DIALECT_IDS, type Dialect } from '@/types/sql';
import type { SharedWorkspacePayload, WorkspaceFileV1, WorkspaceFileV2, WorkspacePositions, WorkspaceRecord, WorkspaceRecordV1 } from '@/types/workspace';
import { downloadBlob } from '@/utils/download';

export const MAX_WORKSPACE_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_SHARE_HASH_LENGTH = 8000;

const emptyPositions = (): WorkspacePositions => ({ er: {}, dataflow: {} });

export function createWorkspaceRecord(name: string, sql = '', dialect: Dialect = 'mysql'): WorkspaceRecord {
  const now = Date.now();
  return {
    schemaVersion: 2,
    id: crypto.randomUUID(),
    name: normalizeName(name),
    sql,
    dialect,
    viewMode: 'er',
    positions: emptyPositions(),
    erScope: 'current-sql',
    selectedTableIds: [],
    autoSyncSchema: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function importWorkspaceFile(file: File, currentDialect: Dialect): Promise<WorkspaceRecord> {
  if (file.size > MAX_WORKSPACE_FILE_SIZE) throw new Error('文件超过 10MB 上限');
  const text = await file.text();
  if (file.name.toLowerCase().endsWith('.sql')) return createWorkspaceRecord(file.name.replace(/\.sql$/i, ''), text, currentDialect);
  if (!file.name.toLowerCase().endsWith('.sqlviz')) throw new Error('仅支持 .sql 和 .sqlviz 文件');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('工作区文件不是有效 JSON'); }
  const container = parsed as Partial<WorkspaceFileV1 | WorkspaceFileV2>;
  if (container.format !== 'sql-visualizer-workspace' || (container.version !== 1 && container.version !== 2) || !container.workspace) throw new Error('不支持的工作区文件版本');
  return normalizeImportedWorkspace(container.workspace);
}

export function exportWorkspaceFile(workspace: WorkspaceRecord): void {
  downloadBlob(new Blob([serializeWorkspaceFile(workspace)], { type: 'application/json' }), `${safeFilename(workspace.name)}.sqlviz`);
}

export function serializeWorkspaceFile(workspace: WorkspaceRecord): string {
  const file: WorkspaceFileV2 = { format: 'sql-visualizer-workspace', version: 2, workspace };
  return JSON.stringify(file, (key, value) => key.toLowerCase().includes('password') ? undefined : value, 2);
}

export function exportSQLFile(workspace: WorkspaceRecord): void {
  downloadBlob(new Blob([workspace.sql], { type: 'text/sql;charset=utf-8' }), `${safeFilename(workspace.name)}.sql`);
}

export function buildShareHash(workspace: WorkspaceRecord): string {
  const payload: SharedWorkspacePayload = {
    version: 1,
    name: workspace.name,
    sql: workspace.sql,
    dialect: workspace.dialect,
    viewMode: workspace.viewMode,
    positions: workspace.positions,
  };
  const hash = `#share=${compressToEncodedURIComponent(JSON.stringify(payload))}`;
  if (hash.length > MAX_SHARE_HASH_LENGTH) throw new Error('内容过长，无法生成本地分享链接，请改用 .sqlviz 文件');
  return hash;
}

export function parseShareHash(hash: string): WorkspaceRecord | null {
  if (!hash.startsWith('#share=')) return null;
  try {
    const json = decompressFromEncodedURIComponent(hash.slice(7));
    if (!json) return null;
    const payload = JSON.parse(json) as Partial<SharedWorkspacePayload>;
    if (payload.version !== 1 || typeof payload.sql !== 'string' || typeof payload.name !== 'string' || !isDialect(payload.dialect)) return null;
    const workspace = createWorkspaceRecord(`${payload.name}（分享）`, payload.sql, payload.dialect);
    workspace.viewMode = payload.viewMode === 'dataflow' ? 'dataflow' : 'er';
    workspace.positions = normalizePositions(payload.positions);
    return workspace;
  } catch { return null; }
}

export function snapshotWorkspace(state: {
  currentWorkspaceId: string | null; workspaceName: string; sql: string; dialect: Dialect;
  viewMode: 'er' | 'dataflow'; nodePositions: WorkspacePositions; databaseProfileId?: string;
  erScope: WorkspaceRecord['erScope']; selectedTableIds: string[]; autoSyncSchema: boolean;
  schemaSnapshot: WorkspaceRecord['schemaSnapshot'] | null;
}, createdAt = Date.now()): WorkspaceRecord | null {
  if (!state.currentWorkspaceId) return null;
  return {
    schemaVersion: 2, id: state.currentWorkspaceId, name: normalizeName(state.workspaceName), sql: state.sql,
    dialect: state.dialect, viewMode: state.viewMode, positions: state.nodePositions,
    databaseProfileId: state.databaseProfileId, erScope: state.erScope,
    selectedTableIds: [...state.selectedTableIds], autoSyncSchema: state.autoSyncSchema,
    schemaSnapshot: state.schemaSnapshot ?? undefined, createdAt, updatedAt: Date.now(),
  };
}

function normalizeImportedWorkspace(value: WorkspaceRecord | WorkspaceRecordV1): WorkspaceRecord {
  if (!value || typeof value.sql !== 'string' || !isDialect(value.dialect)) throw new Error('工作区内容缺少 SQL 或有效方言');
  const migrated = migrateWorkspace(value);
  return {
    ...createWorkspaceRecord(migrated.name || '导入的工作区', migrated.sql, migrated.dialect),
    viewMode: migrated.viewMode === 'dataflow' ? 'dataflow' : 'er',
    positions: normalizePositions(migrated.positions),
    databaseProfileId: migrated.databaseProfileId,
    erScope: migrated.erScope,
    selectedTableIds: [...migrated.selectedTableIds],
    autoSyncSchema: migrated.autoSyncSchema,
    schemaSnapshot: migrated.schemaSnapshot,
  };
}

export function migrateWorkspace(value: WorkspaceRecord | WorkspaceRecordV1): WorkspaceRecord {
  if (value.schemaVersion === 2) {
    return {
      ...value,
      erScope: value.erScope === 'database-schema' ? 'database-schema' : 'current-sql',
      selectedTableIds: Array.isArray(value.selectedTableIds) ? value.selectedTableIds.filter(id => typeof id === 'string') : [],
      autoSyncSchema: value.autoSyncSchema === true,
    };
  }
  return {
    ...value,
    schemaVersion: 2,
    erScope: 'current-sql',
    selectedTableIds: [],
    autoSyncSchema: false,
  };
}


function normalizePositions(value: unknown): WorkspacePositions {
  const positions = value as Partial<WorkspacePositions> | null;
  return { er: positions?.er ?? {}, dataflow: positions?.dataflow ?? {} };
}

function isDialect(value: unknown): value is Dialect { return typeof value === 'string' && (DIALECT_IDS as readonly string[]).includes(value); }
function normalizeName(value: string): string { return value.trim().slice(0, 80) || '未命名查询'; }
function safeFilename(value: string): string { return normalizeName(value).replace(/[<>:"/\\|?*]/g, '_'); }
