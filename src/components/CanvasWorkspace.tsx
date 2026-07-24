import { lazy, Suspense, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { DiagramCanvas } from './diagram/DiagramCanvas';
import { Toolbar } from './layout/Toolbar';
import { useExportDiagram } from '@/hooks/useExportDiagram';
import { useDiagramLayout } from '@/hooks/useDiagramLayout';
import { ReactFlowProvider, useReactFlow, type Node, type Edge } from '@xyflow/react';
import { SchemaSelectionPanel } from './database/SchemaSelectionPanel';

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
        <DiagramCanvas nodes={nodes} edges={edges} mode={viewMode} />
        {schemaPanelOpen && <SchemaSelectionPanel onClose={() => setSchemaPanelOpen(false)} onConnect={() => setDatabaseDialogOpen(true)} />}
      </div>
      {databaseDialogOpen && <Suspense fallback={null}><DatabaseConnectionDialog onClose={() => setDatabaseDialogOpen(false)} onConnected={() => { setDatabaseDialogOpen(false); setSchemaPanelOpen(true); }} /></Suspense>}
    </div>
  );
}
