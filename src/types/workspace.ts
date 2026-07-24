import type { DatabaseSchemaSnapshot, ERScope } from './database';
import type { Dialect } from './sql';
import type { Position, ViewMode } from './shared';

export interface WorkspacePositions {
  er: Record<string, Position>;
  dataflow: Record<string, Position>;
}

interface WorkspaceRecordBase {
  id: string;
  name: string;
  sql: string;
  dialect: Dialect;
  viewMode: ViewMode;
  positions: WorkspacePositions;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceRecordV1 extends WorkspaceRecordBase {
  schemaVersion: 1;
}

export interface WorkspaceRecord extends WorkspaceRecordBase {
  schemaVersion: 2;
  databaseProfileId?: string;
  erScope: ERScope;
  selectedTableIds: string[];
  autoSyncSchema: boolean;
  schemaSnapshot?: DatabaseSchemaSnapshot;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  updatedAt: number;
}

export interface WorkspaceFileV1 {
  format: 'sql-visualizer-workspace';
  version: 1;
  workspace: WorkspaceRecordV1;
}

export interface WorkspaceFileV2 {
  format: 'sql-visualizer-workspace';
  version: 2;
  workspace: WorkspaceRecord;
}

export interface SharedWorkspacePayload {
  version: 1;
  name: string;
  sql: string;
  dialect: Dialect;
  viewMode: ViewMode;
  positions: WorkspacePositions;
}
