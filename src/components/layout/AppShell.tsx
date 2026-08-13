import { useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { WorkspaceMenu } from '../workspace/WorkspaceMenu';
import { TabBar } from '../workspace/TabBar';

interface AppShellProps { editor: ReactNode; canvas: ReactNode; statusBar: ReactNode }

export function AppShell({ editor, canvas, statusBar }: AppShellProps) {
  const editorWidth = useAppStore(state => state.editorWidth);
  const setEditorWidth = useAppStore(state => state.setEditorWidth);
  const mobilePanel = useAppStore(state => state.mobilePanel);
  const setMobilePanel = useAppStore(state => state.setMobilePanel);
  const [resizing, setResizing] = useState(false);
  const editorCollapsed = useAppStore(state => state.isEditorCollapsed);

  useEffect(() => {
    if (!resizing) return;
    const move = (event: MouseEvent) => setEditorWidth(Math.max(320, Math.min(720, event.clientX)));
    const stop = () => setResizing(false);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', stop);
    document.body.classList.add('is-resizing');
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', stop);
      document.body.classList.remove('is-resizing');
    };
  }, [resizing, setEditorWidth]);

  return (
    <div className="app-shell">
      <div className="mobile-panel-switcher" role="tablist" aria-label="移动端面板">
        <button role="tab" aria-selected={mobilePanel === 'editor'} onClick={() => setMobilePanel('editor')}>编辑器</button>
        <button role="tab" aria-selected={mobilePanel === 'diagram'} onClick={() => setMobilePanel('diagram')}>图形</button>
      </div>
      <div className="app-body">
        <section className={`editor-panel ${mobilePanel === 'editor' ? 'mobile-active' : ''} ${editorCollapsed ? 'desktop-collapsed' : ''}`} style={{ width: editorWidth }} aria-label="SQL 编辑器">
          <header className="app-brandbar">
            <div className="brand-mark" aria-hidden="true">S</div>
            <span className="brand-name">SQL Visualizer</span>
            <WorkspaceMenu />
          </header>
          <TabBar />
          <div className="editor-content">{editor}</div>
          {statusBar}
        </section>
        <div className={`panel-resizer ${editorCollapsed ? 'desktop-collapsed' : ''}`} role="separator" aria-orientation="vertical" aria-label="调整编辑器宽度" onMouseDown={() => setResizing(true)} />
        <main className={`canvas-panel ${mobilePanel === 'diagram' ? 'mobile-active' : ''}`} aria-label="SQL 图形">{canvas}</main>
      </div>
    </div>
  );
}
