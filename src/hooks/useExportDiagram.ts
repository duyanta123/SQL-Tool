import { useCallback, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useAppStore } from '@/store/useAppStore';
import { downloadDataUrl, downloadBlob } from '@/utils/download';

export function useExportDiagram() {
  const reactFlowWrapper = useRef<HTMLElement | null>(null);
  const { fitView } = useReactFlow();
  const setExporting = useAppStore(s => s.setExporting);
  const pushToast = useAppStore(s => s.pushToast);

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
        backgroundColor: '#ffffff',
      });
      downloadDataUrl(dataUrl, `sql-diagram-${Date.now()}.png`);
      pushToast('success', 'PNG 已导出');
    } catch (e) {
      console.error('Export PNG failed:', e);
      pushToast('error', 'PNG 导出失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  }, [fitView, getContainer, setExporting, pushToast]);

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
        backgroundColor: '#ffffff',
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
  }, [fitView, getContainer, setExporting, pushToast]);

  return { exportPNG, exportSVG, reactFlowWrapper };
}
