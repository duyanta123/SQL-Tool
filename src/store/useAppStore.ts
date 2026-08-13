import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type { Dialect, ParseError, ParseStats, ParseWarning } from '@/types/sql';
import type { ViewMode } from '@/types/shared';
import type { ParseResult } from '@/parser';
import type { WorkspacePositions, WorkspaceRecord, WorkspaceSummary, WorkspaceTab } from '@/types/workspace';
import type { DatabaseConnectionProfile, DatabaseSchemaSnapshot, ERScope } from '@/types/database';

export interface ToastMessage { id: number; type: 'success' | 'error' | 'info'; message: string }

/** 画布操作的可撤销快照（只包含画布相关字段，不包含 SQL 与数据库状态） */
export interface CanvasSnapshot {
  nodePositions: WorkspacePositions;
  selectedTableIds: string[];
  erScope: ERScope;
  viewMode: ViewMode;
}

const MAX_HISTORY = 50;

function snapshotCanvas(state: AppState): CanvasSnapshot {
  return {
    nodePositions: state.nodePositions,
    selectedTableIds: state.selectedTableIds,
    erScope: state.erScope,
    viewMode: state.viewMode,
  };
}

function withHistory(state: AppState, patch: Partial<AppState>): Partial<AppState> {
  if (state.historySuppressed) return patch;
  return { ...patch, past: [...state.past.slice(-(MAX_HISTORY - 1)), snapshotCanvas(state)], future: [] };
}

export type ThemePreference = 'light' | 'dark' | 'system';

interface AppState {
  sql: string;
  dialect: Dialect;
  viewMode: ViewMode;
  theme: ThemePreference;
  resolvedTheme: 'light' | 'dark';
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
  tabs: WorkspaceTab[];
  activeTabId: string | null;
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
  setTheme: (theme: ThemePreference) => void;
  setResolvedTheme: (resolvedTheme: 'light' | 'dark') => void;
  setParseResult: (result: ParseResult, parseTimeMs?: number) => void;
  setParseFailure: (error: ParseError, parseTimeMs?: number) => void;
  setParsing: (parsing: boolean) => void;
  setERElements: (nodes: Node[], edges: Edge[]) => void;
  setDFElements: (nodes: Node[], edges: Edge[]) => void;
  setHoveredEdge: (edgeId: string | null) => void;
  setHoveredNode: (nodeId: string | null) => void;
  setSelectedEdge: (edgeId: string | null) => void;
  setNodePosition: (nodeId: string, pos: { x: number; y: number }) => void;
  setNodePositions: (positions: WorkspacePositions) => void;
  clearNodePositions: (mode?: ViewMode) => void;
  setTabs: (tabs: WorkspaceTab[]) => void;
  setActiveTabId: (id: string | null) => void;
  past: CanvasSnapshot[];
  future: CanvasSnapshot[];
  historySuppressed: boolean;
  setHistorySuppressed: (suppressed: boolean) => void;
  undoCanvas: () => void;
  redoCanvas: () => void;
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
  theme: 'system',
  resolvedTheme: 'light',
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
  tabs: [],
  activeTabId: null,
  past: [],
  future: [],
  historySuppressed: false,
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
  setViewMode: (viewMode) => set(state => withHistory(state, { viewMode, selectedEdgeId: null, hoveredEdgeId: null, hoveredNodeId: null })),
  setTheme: (theme) => set({ theme }),
  setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),
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
    set((state) => withHistory(state, {
      nodePositions: { ...state.nodePositions, [state.viewMode]: { ...state.nodePositions[state.viewMode], [nodeId]: pos } },
    })),
  setNodePositions: (nodePositions) => set(state => withHistory(state, { nodePositions })),
  clearNodePositions: (mode) => set(state => withHistory(state, {
    nodePositions: mode
      ? { ...state.nodePositions, [mode]: {} }
      : { er: {}, dataflow: {} },
  })),
  setTabs: (tabs) => set({ tabs }),
  setActiveTabId: (activeTabId) => set({ activeTabId }),
  setHistorySuppressed: (historySuppressed) => set({ historySuppressed }),
  undoCanvas: () => set(state => {
    const previous = state.past[state.past.length - 1];
    if (!previous) return state;
    return {
      ...previous,
      past: state.past.slice(0, -1),
      future: [snapshotCanvas(state), ...state.future],
    };
  }),
  redoCanvas: () => set(state => {
    const next = state.future[0];
    if (!next) return state;
    return {
      ...next,
      past: [...state.past, snapshotCanvas(state)],
      future: state.future.slice(1),
    };
  }),
  setExporting: (isExporting) => set({ isExporting }),
  loadWorkspace: (workspace) => {
    const activeTab = workspace.tabs.find(tab => tab.id === workspace.activeTabId) ?? workspace.tabs[0];
    set({
      currentWorkspaceId: workspace.id,
      workspaceName: workspace.name,
      tabs: workspace.tabs,
      activeTabId: workspace.activeTabId,
      sql: activeTab?.sql ?? workspace.sql,
      dialect: activeTab?.dialect ?? workspace.dialect,
      viewMode: activeTab?.viewMode ?? workspace.viewMode,
      nodePositions: activeTab?.positions ?? workspace.positions,
      databaseProfileId: workspace.databaseProfileId,
      erScope: activeTab?.erScope ?? workspace.erScope,
      selectedTableIds: activeTab?.selectedTableIds ?? workspace.selectedTableIds,
      autoSyncSchema: workspace.autoSyncSchema,
      schemaSnapshot: workspace.schemaSnapshot ?? null,
      schemaSyncStatus: 'idle',
      schemaSyncError: null,
      isDatabaseConnected: false,
      selectedEdgeId: null,
      past: [],
      future: [],
    });
  },
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
  setERScope: (erScope) => set(state => withHistory(state, { erScope })),
  setSelectedTableIds: (selectedTableIds) => set(state => withHistory(state, { selectedTableIds })),
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
