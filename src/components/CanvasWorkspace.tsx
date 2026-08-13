import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { DiagramCanvas } from './diagram/DiagramCanvas';
import { Toolbar } from './layout/Toolbar';
import { useExportDiagram } from '@/hooks/useExportDiagram';
import { useDiagramLayout } from '@/hooks/useDiagramLayout';
import { ReactFlowProvider, useReactFlow, type Node, type Edge } from '@xyflow/react';
import { SchemaSelectionPanel } from './database/SchemaSelectionPanel';
import { SearchIcon } from './shared/Icon';

const DatabaseConnectionDialog = lazy(() => import('./database/DatabaseConnectionDialog').then(module => ({ default: module.DatabaseConnectionDialog })));

export function CanvasWorkspace() {
  return <ReactFlowProvider><CanvasWorkspaceContent /></ReactFlowProvider>;
}

function CanvasWorkspaceContent() {
  const viewMode = useAppStore(s => s.viewMode);
  const erNodes = useAppStore(s => s.erNodes);
  const erEdges = useAppStore(s => s.erEdges);
  const dfNodes = useAppStore(s => s.dfNodes);
  const dfEdges = useAppStore(s => s.dfEdges);
  const nodePositions = useAppStore(s => s.nodePositions);
  const { triggerAutoLayout } = useDiagramLayout();
  const { exportPNG, exportSVG } = useExportDiagram();
  const { fitView } = useReactFlow();
  const [databaseDialogOpen, setDatabaseDialogOpen] = useState(false);
  const [schemaPanelOpen, setSchemaPanelOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const nodes = useMemo<Node[]>(() => {
    const rawNodes = viewMode === 'er' ? erNodes : dfNodes;
    return rawNodes.map(n => {
      const pos = nodePositions[viewMode][n.id];
      return pos ? { ...n, position: pos } : n;
    });
  }, [viewMode, erNodes, dfNodes, nodePositions]);

  const edges = useMemo<Edge[]>(() => {
    return viewMode === 'er' ? erEdges : dfEdges;
  }, [viewMode, erEdges, dfEdges]);

  const query = searchText.trim().toLowerCase();
  const matchedIds = useMemo(() => {
    if (!query) return new Set<string>();
    const set = new Set<string>();
    for (const node of nodes) {
      if (JSON.stringify({ id: node.id, data: node.data }).toLowerCase().includes(query)) set.add(node.id);
    }
    return set;
  }, [nodes, query]);

  const focusMatch = useCallback(() => {
    const first = [...matchedIds][0];
    if (first) void fitView({ nodes: [{ id: first }], padding: 0.3, duration: 220 });
  }, [matchedIds, fitView]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inEditor = !!target?.closest?.('.cm-editor');
      const inField = !!target?.closest?.('input, textarea, select, [contenteditable="true"]');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (inEditor || inField) return;
      if (event.key === '1') { event.preventDefault(); useAppStore.getState().setViewMode('er'); return; }
      if (event.key === '2') { event.preventDefault(); useAppStore.getState().setViewMode('dataflow'); return; }
      if (event.key === '0') { event.preventDefault(); void fitView({ padding: 0.08, duration: 220, maxZoom: 1.15 }); return; }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        useAppStore.getState().undoCanvas();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        useAppStore.getState().redoCanvas();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fitView]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
      <Toolbar
        onExportPNG={exportPNG}
        onExportSVG={exportSVG}
        onAutoLayout={triggerAutoLayout}
        onFitView={() => void fitView({ padding: 0.08, duration: 220, maxZoom: 1.15 })}
        onOpenDatabase={() => setDatabaseDialogOpen(true)}
        onOpenSchema={() => setSchemaPanelOpen(true)}
      />
      <div style={{ flex: 1, position: 'relative', minHeight: 0, minWidth: 0 }}>
        <DiagramCanvas nodes={nodes} edges={edges} mode={viewMode} searchMatchedIds={matchedIds} />
        <div className="canvas-search-wrap">
          <div className="canvas-search">
            <SearchIcon size={13} />
            <input
              ref={searchRef}
              value={searchText}
              onChange={event => setSearchText(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') focusMatch();
                if (event.key === 'Escape') { setSearchText(''); event.currentTarget.blur(); }
              }}
              placeholder="搜索表 / 列 / 节点"
              aria-label="搜索图形节点"
            />
            {matchedIds.size > 0 && <span className="canvas-search-count">{matchedIds.size} 个匹配</span>}
          </div>
        </div>
        {schemaPanelOpen && <SchemaSelectionPanel onClose={() => setSchemaPanelOpen(false)} onConnect={() => setDatabaseDialogOpen(true)} />}
      </div>
      {databaseDialogOpen && <Suspense fallback={null}><DatabaseConnectionDialog onClose={() => setDatabaseDialogOpen(false)} onConnected={() => { setDatabaseDialogOpen(false); setSchemaPanelOpen(true); }} /></Suspense>}
    </div>
  );
}
