import { useAppStore } from '@/store/useAppStore';

export function desktopUpdatesAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.sqlVisualizerDesktop?.checkForUpdates === 'function';
}

/** 检查并下载更新；安装版退出应用时自动安装，便携版与开发模式给出提示 */
export async function checkForUpdates(): Promise<void> {
  const api = window.sqlVisualizerDesktop;
  const store = useAppStore.getState();
  if (!api?.checkForUpdates) {
    store.pushToast('error', '自动更新仅 Windows 桌面安装版可用');
    return;
  }
  const result = await api.checkForUpdates();
  if (result.portable) { store.pushToast('info', '便携版不支持自动更新，请到 GitHub Releases 手动下载'); return; }
  if (result.dev) { store.pushToast('info', '开发模式不检查更新'); return; }
  if (!result.available) { store.pushToast('info', `已是最新版本 v${result.version ?? ''}`.trim()); return; }
  store.pushToast('info', `发现新版本 v${result.version ?? '未知'}，正在后台下载…`);
  const download = await api.downloadUpdate();
  if (!download.ok) { store.pushToast('error', download.message ?? '下载更新失败'); return; }
  store.pushToast('success', '新版本已就绪，退出应用时将自动安装');
}
