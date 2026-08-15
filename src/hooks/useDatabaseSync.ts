import { useEffect, useRef } from 'react';
import { disconnectProfile, loadDatabaseProfiles, refreshDatabaseSchema } from '@/services/database';
import { useAppStore } from '@/store/useAppStore';

export function useDatabaseSync(): void {
  const workspaceReady = useAppStore(state => state.workspaceReady);
  const profileId = useAppStore(state => state.databaseProfileId);
  const autoSync = useAppStore(state => state.autoSyncSchema);
  const previousProfileId = useRef<string | undefined>(undefined);

  useEffect(() => {
    void loadDatabaseProfiles().catch(error => useAppStore.getState().pushToast('error', error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(() => {
    const previous = previousProfileId.current;
    previousProfileId.current = profileId;
    if (previous && previous !== profileId && window.sqlVisualizerDesktop) {
      void disconnectProfile(previous).catch(error => useAppStore.getState().pushToast('error', `断开旧连接失败：${error instanceof Error ? error.message : String(error)}`));
    }
  }, [profileId]);

  useEffect(() => {
    // profiles 校验在 effect 内经 getState 读取，避免 profiles 引用变化触发计划外的额外同步
    if (!workspaceReady || !profileId || !autoSync || !window.sqlVisualizerDesktop) return;
    if (!useAppStore.getState().databaseProfiles.some(profile => profile.id === profileId)) return;
    const synchronize = () => void refreshDatabaseSchema().catch(error => {
      useAppStore.getState().pushToast('error', `Schema 同步失败：${error instanceof Error ? error.message : String(error)}`);
    });
    synchronize();
    const timer = window.setInterval(synchronize, 30_000);
    return () => window.clearInterval(timer);
  }, [workspaceReady, profileId, autoSync]);
}
