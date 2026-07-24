import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type { Dialect, ParseError, ParseStats, ParseWarning } from '@/types/sql';
import type { ViewMode } from '@/types/shared';
import type { ParseResult } from '@/parser';
import type { WorkspacePositions, WorkspaceRecord, WorkspaceSummary } from '@/types/workspace';
import type { DatabaseConnectionProfile, DatabaseSchemaSnapshot, ERScope } from '@/types/database';

export interface ToastMessage { id: number; type: 'success' | 'error' | 'info'; message: string }

interface AppState {
  sql: string;
  dialect: Dialect;
  viewMode: ViewMode;
  parseResult: ParseResult | null;
  erNodes: Node[];
  erEdges: Edge[];
  dfNodes: Node[];
  dfEdges: Edge[];
  hoveredEdgeId: string | null;
  hoveredNodeId: string | null;
  selectedEdgeId: string | null;
  nodePositions: WorkspacePositions;
  error: ParseError | null;
  warnings: ParseWarning[];
  stats: ParseStats;
  parseTimeMs: number | null;
  isParsing: boolean;
  isStale: boolean;
  isExporting: boolean;
  currentWorkspaceId: string | null;
  workspaceName: string;
  workspaces: WorkspaceSummary[];
  workspaceReady: boolean;
  editorWidth: number;
  mobilePanel: 'editor' | 'diagram';
  isEditorCollapsed: boolean;
  databaseProfiles: DatabaseConnectionProfile[];
  databaseProfileId?: string;
  erScope: ERScope;
  selectedTableIds: string[];
  autoSyncSchema: boolean;
  schemaSnapshot: DatabaseSchemaSnapshot | null;
  schemaSyncStatus: 'idle' | 'syncing' | 'fresh' | 'stale';
  schemaSyncError: string | null;
  isDatabaseConnected: boolean;
  toasts: ToastMessage[];

  setSQL: (sql: string) => void;
  setDialect: (dialect: Dialect) => void;
  setViewMode: (mode: ViewMode) => void;
  setParseResult: (result: ParseResult, parseTimeMs?: number) => void;
  setParseFailure: (error: ParseError, parseTimeMs?: number) => void;
  setParsing: (parsing: boolean) => void;
  setERElements: (nodes: Node[], edges: Edge[]) => void;
  setDFElements: (nodes: Node[], edges: Edge[]) => void;
  setHoveredEdge: (edgeId: string | null) => void;
  setHoveredNode: (nodeId: string | null) => void;
  setSelectedEdge: (edgeId: string | null) => void;
  setNodePosition: (nodeId: string, pos: { x: number; y: number }) => void;
  clearNodePositions: (mode?: ViewMode) => void;
  setExporting: (exporting: boolean) => void;
  loadWorkspace: (workspace: WorkspaceRecord) => void;
  setWorkspaceName: (name: string) => void;
  setWorkspaces: (items: WorkspaceSummary[]) => void;
  setWorkspaceReady: (ready: boolean) => void;
  setEditorWidth: (width: number) => void;
  setMobilePanel: (panel: 'editor' | 'diagram') => void;
  setEditorCollapsed: (collapsed: boolean) => void;
  setDatabaseProfiles: (profiles: DatabaseConnectionProfile[]) => void;
  setDatabaseProfileId: (id?: string) => void;
  setERScope: (scope: ERScope) => void;
  setSelectedTableIds: (ids: string[]) => void;
  setAutoSyncSchema: (enabled: boolean) => void;
  setSchemaSnapshot: (snapshot: DatabaseSchemaSnapshot, preserveSelection?: boolean) => void;
  clearSchemaSnapshot: () => void;
  setSchemaSyncState: (status: AppState['schemaSyncStatus'], error?: string | null) => void;
  setDatabaseConnected: (connected: boolean) => void;
  pushToast: (type: ToastMessage['type'], message: string) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const useAppStore = create<AppState>((set) => ({
  sql: '',
  dialect: 'mysql',
  viewMode: 'er',
  parseResult: null,
  erNodes: [],
  erEdges: [],
  dfNodes: [],
  dfEdges: [],
  hoveredEdgeId: null,
  hoveredNodeId: null,
  selectedEdgeId: null,
  nodePositions: { er: {}, dataflow: {} },
  error: null,
  warnings: [],
  stats: { tableCount: 0, joinCount: 0, cteCount: 0, subqueryCount: 0 },
  parseTimeMs: null,
  isParsing: false,
  isStale: false,
  isExporting: false,
  currentWorkspaceId: null,
  workspaceName: '未命名查询',
  workspaces: [],
  workspaceReady: false,
  editorWidth: typeof localStorage === 'undefined' ? 420 : Number(localStorage.getItem('sql-visualizer:editor-width')) || 420,
  mobilePanel: 'editor',
  isEditorCollapsed: false,
  databaseProfiles: [],
  databaseProfileId: undefined,
  erScope: 'current-sql',
  selectedTableIds: [],
  autoSyncSchema: false,
  schemaSnapshot: null,
  schemaSyncStatus: 'idle',
  schemaSyncError: null,
  isDatabaseConnected: false,
  toasts: [],

  setSQL: (sql) => set({ sql }),
  setDialect: (dialect) => set({ dialect }),
  setViewMode: (viewMode) => set({ viewMode, selectedEdgeId: null, hoveredEdgeId: null, hoveredNodeId: null }),
  setParseResult: (result, parseTimeMs) =>
    set({
      parseResult: result,
      error: result.error,
      warnings: result.warnings,
      stats: result.stats,
      parseTimeMs: parseTimeMs ?? null,
      isParsing: false,
      isStale: false,
    }),
  setParseFailure: (error, parseTimeMs) => set({ error, parseTimeMs: parseTimeMs ?? null, isParsing: false, isStale: true }),
  setParsing: (isParsing) => set({ isParsing }),
  setERElements: (erNodes, erEdges) => set({ erNodes, erEdges }),
  setDFElements: (dfNodes, dfEdges) => set({ dfNodes, dfEdges }),
  setHoveredEdge: (edgeId) => set({ hoveredEdgeId: edgeId }),
  setHoveredNode: (nodeId) => set({ hoveredNodeId: nodeId }),
  setSelectedEdge: (edgeId) => set({ selectedEdgeId: edgeId }),
  setNodePosition: (nodeId, pos) =>
    set((state) => ({
      nodePositions: { ...state.nodePositions, [state.viewMode]: { ...state.nodePositions[state.viewMode], [nodeId]: pos } },
    })),
  clearNodePositions: (mode) => set(state => ({
    nodePositions: mode
      ? { ...state.nodePositions, [mode]: {} }
      : { er: {}, dataflow: {} },
  })),
  setExporting: (isExporting) => set({ isExporting }),
  loadWorkspace: (workspace) => set({
    currentWorkspaceId: workspace.id,
    workspaceName: workspace.name,
    sql: workspace.sql,
    dialect: workspace.dialect,
    viewMode: workspace.viewMode,
    nodePositions: workspace.positions,
    databaseProfileId: workspace.databaseProfileId,
    erScope: workspace.erScope,
    selectedTableIds: workspace.selectedTableIds,
    autoSyncSchema: workspace.autoSyncSchema,
    schemaSnapshot: workspace.schemaSnapshot ?? null,
    schemaSyncStatus: 'idle',
    schemaSyncError: null,
    isDatabaseConnected: false,
    selectedEdgeId: null,
  }),
  setWorkspaceName: (workspaceName) => set({ workspaceName }),
  setWorkspaces: (workspaces) => set({ workspaces }),
  setWorkspaceReady: (workspaceReady) => set({ workspaceReady }),
  setEditorWidth: (editorWidth) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('sql-visualizer:editor-width', String(editorWidth));
    set({ editorWidth });
  },
  setMobilePanel: (mobilePanel) => set({ mobilePanel }),
  setEditorCollapsed: (isEditorCollapsed) => set({ isEditorCollapsed }),
  setDatabaseProfiles: (databaseProfiles) => set({ databaseProfiles }),
  setDatabaseProfileId: (databaseProfileId) => set({ databaseProfileId }),
  setERScope: (erScope) => set({ erScope }),
  setSelectedTableIds: (selectedTableIds) => set({ selectedTableIds }),
  setAutoSyncSchema: (autoSyncSchema) => set({ autoSyncSchema }),
  setSchemaSnapshot: (schemaSnapshot, preserveSelection = true) => set(state => {
    const available = new Set(schemaSnapshot.tables.map(table => table.id));
    const previousAvailable = new Set(state.schemaSnapshot?.tables.map(table => table.id) ?? []);
    const retained = state.selectedTableIds.filter(id => available.has(id));
    const added = schemaSnapshot.tables.map(table => table.id).filter(id => !previousAvailable.has(id));
    return {
      schemaSnapshot,
      selectedTableIds: preserveSelection && state.schemaSnapshot ? [...new Set([...retained, ...added])] : [...available],
      schemaSyncStatus: 'fresh',
      schemaSyncError: null,
    };
  }),
  clearSchemaSnapshot: () => set({ schemaSnapshot: null, selectedTableIds: [], schemaSyncStatus: 'idle', schemaSyncError: null, isDatabaseConnected: false }),
  setSchemaSyncState: (schemaSyncStatus, schemaSyncError = null) => set({ schemaSyncStatus, schemaSyncError }),
  setDatabaseConnected: (isDatabaseConnected) => set({ isDatabaseConnected }),
  pushToast: (type, message) => set(state => ({ toasts: [...state.toasts, { id: ++toastId, type, message }] })),
  dismissToast: (id) => set(state => ({ toasts: state.toasts.filter(toast => toast.id !== id) })),
}));
