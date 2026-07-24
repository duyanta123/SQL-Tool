export const DIALECT_IDS = [
  'mysql', 'mariadb', 'postgresql', 'sqlite', 'transactsql', 'bigquery',
  'athena', 'db2', 'hive', 'redshift', 'flinksql', 'trino', 'snowflake',
] as const;

export type Dialect = typeof DIALECT_IDS[number];
export type StatementType = 'select' | 'insert' | 'update' | 'delete' | 'create';

export interface DialectDefinition {
  id: Dialect;
  label: string;
  parserModule: string;
  editorDialect: 'mysql' | 'mariadb' | 'postgresql' | 'mssql' | 'sqlite' | 'standard';
  experimental?: boolean;
}

export interface ParseError {
  message: string;
  line?: number;
  offset?: number;
}

export interface ParseWarning {
  code: 'unsupported-statement' | 'partial-statement' | 'unsupported-dialect';
  message: string;
  statementIndex?: number;
}

export interface ParseStats {
  tableCount: number;
  joinCount: number;
  cteCount: number;
  subqueryCount: number;
}

export interface ParseRequest {
  id: number;
  sql: string;
  dialect: Dialect;
  schemaSnapshot?: import('./database').DatabaseSchemaSnapshot | null;
}

export interface ParseResponse {
  id: number;
  result?: unknown;
  error?: ParseError;
  durationMs: number;
}
