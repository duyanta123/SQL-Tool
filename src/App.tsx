import { lazy, Suspense } from 'react';
import { AppShell } from './components/layout/AppShell';
import { EditorStatusBar } from './components/editor/EditorStatusBar';
import { ToastViewport } from './components/shared/ToastViewport';
import { useSQLParser } from './hooks/useSQLParser';
import { useWorkspaces } from './hooks/useWorkspaces';
import { useDatabaseSync } from './hooks/useDatabaseSync';
import { useTheme } from './hooks/useTheme';

const SQLEditor = lazy(() => import('./components/editor/SQLEditor').then(module => ({ default: module.SQLEditor })));
const CanvasWorkspace = lazy(() => import('./components/CanvasWorkspace').then(module => ({ default: module.CanvasWorkspace })));

function AppContent() {
  useWorkspaces();
  useSQLParser();
  useDatabaseSync();
  useTheme();
  return <AppShell editor={<Suspense fallback={<div className="panel-loading">正在加载编辑器…</div>}><SQLEditor /></Suspense>} canvas={<Suspense fallback={<div className="panel-loading">正在加载画布…</div>}><CanvasWorkspace /></Suspense>} statusBar={<EditorStatusBar />} />;
}

export default function App() {
  return <><AppContent /><ToastViewport /></>;
}
