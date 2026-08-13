import { format, type SqlLanguage } from 'sql-formatter';
import type { Dialect } from '@/types/sql';

/**
 * 应用方言 → sql-formatter 语言映射。
 * Athena 使用 Trino 语法族；Flink SQL 没有专属 formatter，退回通用 SQL。
 */
const LANGUAGE_BY_DIALECT: Record<Dialect, SqlLanguage> = {
  mysql: 'mysql',
  mariadb: 'mariadb',
  postgresql: 'postgresql',
  sqlite: 'sqlite',
  transactsql: 'transactsql',
  bigquery: 'bigquery',
  athena: 'trino',
  db2: 'db2',
  hive: 'hive',
  redshift: 'redshift',
  flinksql: 'sql',
  trino: 'trino',
  snowflake: 'snowflake',
};

export function formatSQLText(sql: string, dialect: Dialect): string {
  return format(sql, {
    language: LANGUAGE_BY_DIALECT[dialect],
    tabWidth: 2,
    keywordCase: 'upper',
    linesBetweenQueries: 1,
  });
}

export function tryFormatSQL(sql: string, dialect: Dialect): { sql: string; error: string | null } {
  try {
    return { sql: formatSQLText(sql, dialect), error: null };
  } catch (error) {
    return { sql, error: error instanceof Error ? error.message : String(error) };
  }
}
