export type DatabaseKind = 'sqlite' | 'mysql' | 'postgresql' | 'mssql';
export type MSSQLAuthType = 'sql' | 'windows';
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
  /** SQL Server：加密连接（默认开启） */
  encrypt?: boolean;
  /** SQL Server：SQL 认证或 Windows 集成认证 */
  authType?: MSSQLAuthType;
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
  comment?: string;
}

export interface SchemaForeignKey {
  id: string;
  columns: string[];
  referencedTableId: string;
  referencedColumns: string[];
}

export interface SchemaIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface SchemaCheckConstraint {
  name: string;
  column?: string;
  definition: string;
}

export interface SchemaTable {
  id: string;
  schema?: string;
  name: string;
  /** table（默认）或 view */
  kind?: 'table' | 'view';
  comment?: string;
  columns: SchemaColumn[];
  foreignKeys: SchemaForeignKey[];
  indexes: SchemaIndex[];
  checkConstraints?: SchemaCheckConstraint[];
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

export interface UpdateCheckResult {
  available: boolean;
  version?: string;
  dev?: boolean;
  portable?: boolean;
}

export interface UpdateDownloadResult {
  ok: boolean;
  message?: string;
}

export interface UpdateEvent {
  type: 'checking' | 'available' | 'not-available' | 'progress' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

export interface DesktopDatabaseAPI {
  testConnection(input: DatabaseConnectionInput | { profile: DatabaseConnectionInput; chooseFile?: boolean; selectOnly?: boolean }): Promise<DatabaseTestResult>;
  introspectSchema(input: DatabaseConnectionInput): Promise<DatabaseSchemaSnapshot>;
  disconnect(connectionId: string): Promise<void>;
  listProfiles(): Promise<DatabaseConnectionProfile[]>;
  saveProfile(input: DatabaseConnectionInput): Promise<DatabaseConnectionProfile>;
  checkForUpdates(): Promise<UpdateCheckResult>;
  downloadUpdate(): Promise<UpdateDownloadResult>;
  installUpdate(): Promise<void>;
  onUpdateEvent(callback: (event: UpdateEvent) => void): () => void;
}

declare global {
  interface Window {
    sqlVisualizerDesktop?: DesktopDatabaseAPI;
  }
}
