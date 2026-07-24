export type DatabaseKind = 'sqlite' | 'mysql' | 'postgresql';
export type ERScope = 'current-sql' | 'database-schema';

export interface DatabaseConnectionProfile {
  id: string;
  name: string;
  kind: DatabaseKind;
  filePath?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  schema?: string;
  rememberPassword: boolean;
}

export interface DatabaseConnectionInput extends DatabaseConnectionProfile {
  password?: string;
}

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  defaultValue?: string | null;
}

export interface SchemaForeignKey {
  id: string;
  columns: string[];
  referencedTableId: string;
  referencedColumns: string[];
}

export interface SchemaTable {
  id: string;
  schema?: string;
  name: string;
  columns: SchemaColumn[];
  foreignKeys: SchemaForeignKey[];
}

export interface DatabaseSchemaSnapshot {
  connectionId: string;
  fetchedAt: number;
  tables: SchemaTable[];
}

export interface DatabaseTestResult {
  ok: true;
  message: string;
  filePath?: string;
}

export interface DesktopDatabaseAPI {
  testConnection(input: DatabaseConnectionInput | { profile: DatabaseConnectionInput; chooseFile?: boolean; selectOnly?: boolean }): Promise<DatabaseTestResult>;
  introspectSchema(input: DatabaseConnectionInput): Promise<DatabaseSchemaSnapshot>;
  disconnect(connectionId: string): Promise<void>;
  listProfiles(): Promise<DatabaseConnectionProfile[]>;
  saveProfile(input: DatabaseConnectionInput): Promise<DatabaseConnectionProfile>;
}

declare global {
  interface Window {
    sqlVisualizerDesktop?: DesktopDatabaseAPI;
  }
}
