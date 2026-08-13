import { useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { layoutERGraph } from '@/layout/er-layout';
import { layoutDataFlowGraph } from '@/layout/dataflow-layout';
import type { Node } from '@xyflow/react';
import { buildDatabaseSchemaGraph } from '@/parser/schema-graph';

export function useDiagramLayout() {
  const parseResult = useAppStore(s => s.parseResult);
  const nodePositions = useAppStore(s => s.nodePositions);
  const setERElements = useAppStore(s => s.setERElements);
  const setDFElements = useAppStore(s => s.setDFElements);
  const clearNodePositions = useAppStore(s => s.clearNodePositions);
  const viewMode = useAppStore(s => s.viewMode);
  const setSelectedEdge = useAppStore(s => s.setSelectedEdge);
  const erScope = useAppStore(s => s.erScope);
  const schemaSnapshot = useAppStore(s => s.schemaSnapshot);
  const selectedTableIds = useAppStore(s => s.selectedTableIds);

  useEffect(() => {
    if (!parseResult) return;
    if (parseResult.error) {
      setERElements([], []);
      setDFElements([], []);
      return;
    }

    // Layout ER
    const erGraph = erScope === 'database-schema'
      ? buildDatabaseSchemaGraph(schemaSnapshot, selectedTableIds)
      : parseResult.erGraph;
    const er = layoutERGraph(erGraph);
    const erNodes = applyManualPositions(er.nodes, nodePositions.er);
    setERElements(erNodes, er.edges);

    // Layout DataFlow
    const df = layoutDataFlowGraph(parseResult.dfGraph);
    const dfNodes = applyManualPositions(df.nodes, nodePositions.dataflow);
    setDFElements(dfNodes, df.edges);
  }, [parseResult, nodePositions, erScope, schemaSnapshot, selectedTableIds, setERElements, setDFElements]);

  const triggerAutoLayout = useCallback(() => {
    clearNodePositions(viewMode);
    setSelectedEdge(null);
    if (!parseResult || parseResult.error) return;
    if (viewMode === 'er') {
      const graph = erScope === 'database-schema' ? buildDatabaseSchemaGraph(schemaSnapshot, selectedTableIds) : parseResult.erGraph;
      const er = layoutERGraph(graph);
      setERElements(er.nodes, er.edges);
    } else {
      const df = layoutDataFlowGraph(parseResult.dfGraph);
      setDFElements(df.nodes, df.edges);
    }
  }, [parseResult, clearNodePositions, setERElements, setDFElements, setSelectedEdge, viewMode, erScope, schemaSnapshot, selectedTableIds]);

  return { triggerAutoLayout };
}

function applyManualPositions(nodes: Node[], manual: Record<string, { x: number; y: number }>): Node[] {
  return nodes.map(n => {
    const manualPosition = manual[n.id];
    return manualPosition ? { ...n, position: manualPosition } : n;
  });
}
