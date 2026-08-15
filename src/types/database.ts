export type DatabaseKind = 'sqlite' | 'mysql' | 'postgresql' | 'mssql';
export type MSSQLAuthType = 'sql' | 'windows';
export type ERScope = 'current-sql' | 'database-schema';
/** MySQL/PostgreSQL 的 SSL 模式：off=跟随服务器默认；tls=加密（跳过证书校验）；verify=加密并校验证书 */
export type SSLMode = 'off' | 'tls' | 'verify';

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
  /** MySQL/PostgreSQL：SSL 模式（默认 off） */
  sslMode?: SSLMode;
  /** SQL Server：加密连接（默认开启） */
  encrypt?: boolean;
  /** SQL Server：跳过证书校验（默认开启，兼容自签证书；关闭后启用证书校验） */
  trustServerCertificate?: boolean;
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
