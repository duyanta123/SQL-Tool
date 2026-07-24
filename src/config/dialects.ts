import type { DialectDefinition } from '@/types/sql';

export const DIALECTS: readonly DialectDefinition[] = [
  { id: 'mysql', label: 'MySQL', parserModule: 'mysql', editorDialect: 'mysql' },
  { id: 'mariadb', label: 'MariaDB', parserModule: 'mariadb', editorDialect: 'mariadb' },
  { id: 'postgresql', label: 'PostgreSQL', parserModule: 'postgresql', editorDialect: 'postgresql' },
  { id: 'sqlite', label: 'SQLite', parserModule: 'sqlite', editorDialect: 'sqlite' },
  { id: 'transactsql', label: 'SQL Server', parserModule: 'transactsql', editorDialect: 'mssql' },
  { id: 'bigquery', label: 'BigQuery', parserModule: 'bigquery', editorDialect: 'standard' },
  { id: 'athena', label: 'Athena', parserModule: 'athena', editorDialect: 'standard' },
  { id: 'db2', label: 'DB2', parserModule: 'db2', editorDialect: 'standard' },
  { id: 'hive', label: 'Hive', parserModule: 'hive', editorDialect: 'standard' },
  { id: 'redshift', label: 'Redshift', parserModule: 'redshift', editorDialect: 'standard' },
  { id: 'flinksql', label: 'Flink SQL', parserModule: 'flinksql', editorDialect: 'standard' },
  { id: 'trino', label: 'Trino', parserModule: 'trino', editorDialect: 'standard' },
  { id: 'snowflake', label: 'Snowflake', parserModule: 'snowflake', editorDialect: 'standard', experimental: true },
] as const;

export const DIALECT_BY_ID = Object.fromEntries(DIALECTS.map(dialect => [dialect.id, dialect])) as Record<(typeof DIALECTS)[number]['id'], DialectDefinition>;
