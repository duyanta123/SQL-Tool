import { useAppStore } from '@/store/useAppStore';
import type { DatabaseConnectionInput } from '@/types/database';

let refreshInFlight: Promise<void> | null = null;

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
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const store = useAppStore.getState();
    const profile = explicitProfile ?? store.databaseProfiles.find(item => item.id === store.databaseProfileId);
    if (!profile) throw new Error('请先选择数据库连接');
    store.setSchemaSyncState('syncing');
    try {
      const snapshot = await requireDesktopAPI().introspectSchema(profile);
      useAppStore.getState().setSchemaSnapshot(snapshot, preserveSelection);
      useAppStore.getState().setDatabaseConnected(true);
    } catch (error) {
      const message = readableError(error);
      useAppStore.getState().setSchemaSyncState(useAppStore.getState().schemaSnapshot ? 'stale' : 'idle', message);
      useAppStore.getState().setDatabaseConnected(false);
      throw new Error(message);
    }
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export async function disconnectDatabase(): Promise<void> {
  const store = useAppStore.getState();
  if (store.databaseProfileId) await requireDesktopAPI().disconnect(store.databaseProfileId);
  store.setAutoSyncSchema(false);
  store.setSchemaSyncState('idle');
  store.setDatabaseConnected(false);
}

function requireDesktopAPI() {
  if (!window.sqlVisualizerDesktop) throw new Error('数据库连接仅桌面版可用');
  return window.sqlVisualizerDesktop;
}

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': Error: /, '');
}
