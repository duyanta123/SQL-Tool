import { Parser } from 'node-sql-parser';
import type { Dialect } from '@/types/sql';

const parserCache = new Map<Dialect, Parser>();

const DATABASE_NAMES: Record<Dialect, string> = {
  mysql: 'MySQL', mariadb: 'MariaDB', postgresql: 'Postgresql', sqlite: 'Sqlite',
  transactsql: 'TransactSQL', bigquery: 'BigQuery', athena: 'Athena', db2: 'DB2',
  hive: 'Hive', redshift: 'Redshift', flinksql: 'FlinkSQL', trino: 'Trino', snowflake: 'Snowflake',
};

export function getParser(dialect: Dialect): Parser {
  let parser = parserCache.get(dialect);
  if (!parser) {
    parser = new Parser();
    parserCache.set(dialect, parser);
  }
  return parser;
}

export function astify(sql: string, dialect: Dialect) {
  const parser = getParser(dialect);
  const opt = { database: DATABASE_NAMES[dialect] };
  const ast = parser.astify(sql.trim(), opt as any);
  return Array.isArray(ast) ? ast : [ast];
}

export function sqlify(ast: any, dialect: Dialect): string {
  const parser = getParser(dialect);
  return parser.sqlify(ast, { database: DATABASE_NAMES[dialect] } as any);
}
