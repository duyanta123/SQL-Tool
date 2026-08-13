import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { Dialect } from '@/types/sql';
import { DIALECTS } from '@/config/dialects';
import type { ViewMode } from '@/types/shared';
import { SAMPLE_QUERIES } from '@/utils/test-sql';
import { DatabaseIcon, DownloadIcon, LayoutIcon, MonitorIcon, MoonIcon, PlayIcon, RedoIcon, SparklesIcon, SunIcon, UndoIcon } from '../shared/Icon';
import { desktopDatabaseAvailable } from '@/services/database';
import { checkForUpdates, desktopUpdatesAvailable } from '@/services/updates';

const SupportDialog = lazy(() => import('../shared/SupportDialog').then(module => ({ default: module.SupportDialog })));

interface ToolbarProps {
  onExportPNG: () => void;
  onExportSVG: () => void;
  onAutoLayout: () => void;
  onFitView: () => void;
  onOpenDatabase: () => void;
  onOpenSchema: () => void;
}

export function Toolbar({ onExportPNG, onExportSVG, onAutoLayout, onFitView, onOpenDatabase, onOpenSchema }: ToolbarProps) {
  const viewMode = useAppStore(s => s.viewMode);
  const setViewMode = useAppStore(s => s.setViewMode);
  const dialect = useAppStore(s => s.dialect);
  const setDialect = useAppStore(s => s.setDialect);
  const setSQL = useAppStore(s => s.setSQL);
  const erScope = useAppStore(s => s.erScope);
  const setERScope = useAppStore(s => s.setERScope);
  const schemaSnapshot = useAppStore(s => s.schemaSnapshot);
  const editorCollapsed = useAppStore(s => s.isEditorCollapsed);
  const setEditorCollapsed = useAppStore(s => s.setEditorCollapsed);
  const pushToast = useAppStore(s => s.pushToast);
  const theme = useAppStore(s => s.theme);
  const setTheme = useAppStore(s => s.setTheme);
  const canUndo = useAppStore(s => s.past.length > 0);
  const canRedo = useAppStore(s => s.future.length > 0);
  const undoCanvas = useAppStore(s => s.undoCanvas);
  const redoCanvas = useAppStore(s => s.redoCanvas);
  const [menu, setMenu] = useState<'sample' | 'export' | 'more' | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const desktopAvailable = desktopDatabaseAvailable();

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!toolbarRef.current?.contains(event.target as Node)) setMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const selectSample = (sql: string) => { setSQL(sql); setMenu(null); };
  const themeLabel = theme === 'light' ? '亮色' : theme === 'dark' ? '暗色' : '跟随系统';
  const cycleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
    setMenu(null);
  };
  const updateAction = async () => {
    setMenu(null);
    try { await checkForUpdates(); } catch (error) { pushToast('error', error instanceof Error ? error.message : String(error)); }
  };
  const formatSQL = async () => {
    setMenu(null);
    const { tryFormatSQL } = await import('@/utils/sql-format');
    const state = useAppStore.getState();
    const result = tryFormatSQL(state.sql, state.dialect);
    if (result.error) { pushToast('error', `格式化失败：${result.error}`); return; }
    if (result.sql === state.sql) { pushToast('info', 'SQL 已符合当前格式'); return; }
    state.setSQL(result.sql);
    pushToast('success', '已格式化 SQL');
  };
  const databaseAction = () => {
    setMenu(null);
    if (!desktopAvailable) pushToast('info', '数据库连接仅桌面版可用');
    else onOpenDatabase();
  };
  return (
    <div className="canvas-toolbar" ref={toolbarRef}>
      <div className="view-tabs" role="tablist" aria-label="图形类型">
        {(['er', 'dataflow'] as ViewMode[]).map(mode => <button key={mode} role="tab" aria-selected={viewMode === mode} onClick={() => setViewMode(mode)}><span className="desktop-label">{mode === 'er' ? 'ER 图' : '数据流图'}</span><span className="mobile-label">{mode === 'er' ? 'ER' : '流'}</span></button>)}
      </div>
      {viewMode === 'er' && <div className="scope-tabs" aria-label="ER 图范围">
        <button aria-pressed={erScope === 'current-sql'} onClick={() => setERScope('current-sql')}>SQL</button>
        <button aria-pressed={erScope === 'database-schema'} disabled={!schemaSnapshot} onClick={() => setERScope('database-schema')}>Schema</button>
      </div>}
      <div className="toolbar-spacer" />
      <select className="dialect-select" aria-label="SQL 方言" value={dialect} onChange={event => setDialect(event.target.value as Dialect)}>{DIALECTS.map(item => <option key={item.id} value={item.id}>{item.label}{item.experimental ? '（实验）' : ''}</option>)}</select>

      <div className="desktop-toolbar-actions">
        <button className="toolbar-button" type="button" onClick={cycleTheme} title={`主题：${themeLabel}`} aria-label="切换主题">
          {theme === 'light' ? <SunIcon size={14} /> : theme === 'dark' ? <MoonIcon size={14} /> : <MonitorIcon size={14} />}
        </button>
        <button className="toolbar-button" type="button" onClick={() => void formatSQL()} title="格式化 SQL（Ctrl+Shift+F）"><SparklesIcon size={14} /><span>格式化</span></button>
        <button className="toolbar-button" type="button" onClick={undoCanvas} disabled={!canUndo} title="撤销画布操作（Ctrl+Z）"><UndoIcon size={14} /></button>
        <button className="toolbar-button" type="button" onClick={redoCanvas} disabled={!canRedo} title="重做画布操作（Ctrl+Shift+Z）"><RedoIcon size={14} /></button>
        {desktopUpdatesAvailable() && <button className="toolbar-button" type="button" onClick={() => void updateAction()} title="检查更新（安装版）">检查更新</button>}
        <ToolbarMenu label="示例" icon={<PlayIcon size={13} />} open={menu === 'sample'} onToggle={() => setMenu(menu === 'sample' ? null : 'sample')}>
          {SAMPLE_QUERIES.map(query => <MenuItem key={query.name} onClick={() => selectSample(query.sql)}>{query.name}</MenuItem>)}
        </ToolbarMenu>
        <button className="toolbar-button" type="button" onClick={onFitView} title="适应内容">适应内容</button>
        <button className="toolbar-button" type="button" onClick={onAutoLayout} title="自动布局"><LayoutIcon size={14} /><span>布局</span></button>
        <button className="toolbar-button" type="button" onClick={() => setEditorCollapsed(!editorCollapsed)}>{editorCollapsed ? '显示编辑器' : '专注画布'}</button>
        <button className="toolbar-button" type="button" onClick={databaseAction} title={desktopAvailable ? '连接本机数据库' : '仅桌面版可用'}><DatabaseIcon size={14} /><span>数据库</span></button>
        {schemaSnapshot && <button className="toolbar-button" type="button" onClick={onOpenSchema}>表选择</button>}
        <button className="toolbar-help" type="button" onClick={() => setSupportOpen(true)} aria-label="查看支持范围">?</button>
        <ToolbarMenu label="导出" icon={<DownloadIcon size={14} />} open={menu === 'export'} onToggle={() => setMenu(menu === 'export' ? null : 'export')}>
          <MenuItem onClick={() => { onExportPNG(); setMenu(null); }}>导出为 PNG</MenuItem>
          <MenuItem onClick={() => { onExportSVG(); setMenu(null); }}>导出为 SVG</MenuItem>
        </ToolbarMenu>
      </div>

      <div className="mobile-toolbar-actions menu-anchor">
        <button className="icon-toolbar-button" type="button" aria-label="更多图形操作" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}>⋯</button>
        {menu === 'more' && <div className="toolbar-menu mobile-action-menu">
          <MenuItem onClick={onFitView}>适应内容</MenuItem><MenuItem onClick={onAutoLayout}>自动布局</MenuItem>
          <MenuItem onClick={cycleTheme}>主题：{themeLabel}</MenuItem>
          <MenuItem onClick={() => void formatSQL()}>格式化 SQL</MenuItem>
          {canUndo && <MenuItem onClick={undoCanvas}>撤销画布操作</MenuItem>}
          {canRedo && <MenuItem onClick={redoCanvas}>重做画布操作</MenuItem>}
          {desktopUpdatesAvailable() && <MenuItem onClick={() => void updateAction()}>检查更新</MenuItem>}
          <MenuItem onClick={() => setSupportOpen(true)}>支持范围</MenuItem><MenuItem onClick={databaseAction}>{desktopAvailable ? '连接数据库' : '数据库（仅桌面版）'}</MenuItem>
          {schemaSnapshot && <MenuItem onClick={onOpenSchema}>选择数据库表</MenuItem>}
          {SAMPLE_QUERIES.map(query => <MenuItem key={query.name} onClick={() => selectSample(query.sql)}>示例：{query.name}</MenuItem>)}
          <MenuItem onClick={onExportPNG}>导出 PNG</MenuItem><MenuItem onClick={onExportSVG}>导出 SVG</MenuItem>
        </div>}
      </div>
      {supportOpen && <Suspense fallback={null}><SupportDialog onClose={() => setSupportOpen(false)} /></Suspense>}
    </div>
  );
}

function ToolbarMenu({ label, icon, open, onToggle, children }: { label: string; icon: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <div className="menu-anchor"><button className="toolbar-button" type="button" aria-expanded={open} onClick={onToggle}>{icon}<span>{label}</span></button>{open && <div className="toolbar-menu">{children}</div>}</div>;
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick}>{children}</button>;
}
