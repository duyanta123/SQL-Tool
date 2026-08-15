import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useAppStore } from '@/store/useAppStore';
import { downloadDataUrl, downloadBlob } from '@/utils/download';

export function useExportDiagram() {
  const { fitView } = useReactFlow();
  const setExporting = useAppStore(s => s.setExporting);
  const pushToast = useAppStore(s => s.pushToast);
  const resolvedTheme = useAppStore(s => s.resolvedTheme);
  // 导出背景跟随主题（与 Electron 窗口底色一致）
  const backgroundColor = resolvedTheme === 'dark' ? '#17181c' : '#ffffff';

  const getContainer = useCallback((): HTMLElement | null => {
    return document.querySelector('.react-flow') as HTMLElement | null;
  }, []);

  const exportPNG = useCallback(async () => {
    const container = getContainer();
    if (!container) return;

    await fitView({ duration: 200 });
    await new Promise(r => setTimeout(r, 300));

    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      await document.fonts.ready;
      const dataUrl = await toPng(container, {
        pixelRatio: 2,
        backgroundColor,
      });
      downloadDataUrl(dataUrl, `sql-diagram-${Date.now()}.png`);
      pushToast('success', 'PNG 已导出');
    } catch (e) {
      console.error('Export PNG failed:', e);
      pushToast('error', 'PNG 导出失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  }, [fitView, getContainer, setExporting, pushToast, backgroundColor]);

  const exportSVG = useCallback(async () => {
    const container = getContainer();
    if (!container) return;

    await fitView({ duration: 200 });
    await new Promise(r => setTimeout(r, 300));

    setExporting(true);
    try {
      const { toSvg } = await import('html-to-image');
      await document.fonts.ready;
      const svgStr = await toSvg(container, {
        backgroundColor,
      });
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      downloadBlob(blob, `sql-diagram-${Date.now()}.svg`);
      pushToast('success', 'SVG 已导出');
    } catch (e) {
      console.error('Export SVG failed:', e);
      pushToast('error', 'SVG 导出失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  }, [fitView, getContainer, setExporting, pushToast, backgroundColor]);

  return { exportPNG, exportSVG };
}
