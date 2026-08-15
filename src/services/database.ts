import { useAppStore } from '@/store/useAppStore';
import type { DatabaseConnectionInput } from '@/types/database';

let refreshInFlight: Promise<void> | null = null;
let refreshKey: string | null = null;
let refreshGeneration = 0;

export function desktopDatabaseAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.sqlVisualizerDesktop;
}

export async function loadDatabaseProfiles(): Promise<void> {
  const api = window.sqlVisualizerDesktop;
  if (!api) return;
  useAppStore.getState().setDatabaseProfiles(await api.listProfiles());
}

export async function chooseSQLiteFile(profile: DatabaseConnectionInput): Promise<string> {
  const api = requireDesktopAPI();
  const result = await api.testConnection({ profile, chooseFile: true, selectOnly: true });
  if (!result.filePath) throw new Error('未选择 SQLite 文件');
  return result.filePath;
}

export async function testDatabaseConnection(profile: DatabaseConnectionInput): Promise<void> {
  await requireDesktopAPI().testConnection(profile);
}

export async function saveAndConnectDatabase(profile: DatabaseConnectionInput): Promise<void> {
  const api = requireDesktopAPI();
  await api.testConnection(profile);
  const saved = await api.saveProfile(profile);
  const store = useAppStore.getState();
  store.setDatabaseProfiles([...store.databaseProfiles.filter(item => item.id !== saved.id), saved]);
  store.setDatabaseProfileId(saved.id);
  store.setDatabaseConnected(true);
  await refreshDatabaseSchema(profile, false);
}

export async function refreshDatabaseSchema(explicitProfile?: DatabaseConnectionInput, preserveSelection = true): Promise<void> {
  const store = useAppStore.getState();
  const profile = explicitProfile ?? store.databaseProfiles.find(item => item.id === store.databaseProfileId);
  if (!profile) throw new Error('请先选择数据库连接');
  // 仅同 profile 且同 preserveSelection 语义的并发调用才去重，避免参数被静默忽略
  const key = `${profile.id}|${preserveSelection}`;
  if (refreshInFlight && refreshKey === key) return refreshInFlight;
  const generation = ++refreshGeneration;
  refreshKey = key;
  refreshInFlight = (async () => {
    useAppStore.getState().setSchemaSyncState('syncing');
    try {
      const snapshot = await requireDesktopAPI().introspectSchema(profile);
      if (generation !== refreshGeneration) return; // 已被断开或被更新的刷新取代，丢弃过期结果
      useAppStore.getState().setSchemaSnapshot(snapshot, preserveSelection);
      useAppStore.getState().setDatabaseConnected(true);
    } catch (error) {
      if (generation !== refreshGeneration) return;
      const message = readableError(error);
      useAppStore.getState().setSchemaSyncState(useAppStore.getState().schemaSnapshot ? 'stale' : 'idle', message);
      useAppStore.getState().setDatabaseConnected(false);
      throw new Error(message);
    }
  })().finally(() => { if (refreshKey === key) { refreshInFlight = null; refreshKey = null; } });
  return refreshInFlight;
}

export async function disconnectDatabase(): Promise<void> {
  refreshGeneration += 1; // 作废在飞的刷新，防止其完成后把状态改回“已连接”
  refreshInFlight = null;
  refreshKey = null;
  const store = useAppStore.getState();
  if (store.databaseProfileId) await requireDesktopAPI().disconnect(store.databaseProfileId);
  store.setAutoSyncSchema(false);
  store.setSchemaSyncState('idle');
  store.setDatabaseConnected(false);
}

/** 断开指定 profile 的桌面端连接（供 profile 切换时清理旧连接） */
export async function disconnectProfile(id: string): Promise<void> {
  await requireDesktopAPI().disconnect(id);
}

function requireDesktopAPI() {
  if (!window.sqlVisualizerDesktop) throw new Error('数据库连接仅桌面版可用');
  return window.sqlVisualizerDesktop;
}

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': Error: /, '');
}
