/// <reference lib="webworker" />
import type { Dialect, ParseRequest, ParseResponse } from '@/types/sql';
import { createParseResult } from '@/parser/result-builder';

type ParserInstance = { astify(sql: string): unknown };
type ParserConstructor = new () => ParserInstance;
type ParserModule = { Parser?: ParserConstructor; default?: { Parser?: ParserConstructor } | ParserConstructor };

const LOADERS: Record<Dialect, () => Promise<ParserModule>> = {
  mysql: () => import('node-sql-parser/build/mysql'),
  mariadb: () => import('node-sql-parser/build/mariadb'),
  postgresql: () => import('node-sql-parser/build/postgresql'),
  sqlite: () => import('node-sql-parser/build/sqlite'),
  transactsql: () => import('node-sql-parser/build/transactsql'),
  bigquery: () => import('node-sql-parser/build/bigquery'),
  athena: () => import('node-sql-parser/build/athena'),
  db2: () => import('node-sql-parser/build/db2'),
  hive: () => import('node-sql-parser/build/hive'),
  redshift: () => import('node-sql-parser/build/redshift'),
  flinksql: () => import('node-sql-parser/build/flinksql'),
  trino: () => import('node-sql-parser/build/trino'),
  snowflake: () => import('node-sql-parser/build/snowflake'),
};

const parsers = new Map<Dialect, ParserInstance>();

async function getParser(dialect: Dialect): Promise<ParserInstance> {
  const cached = parsers.get(dialect);
  if (cached) return cached;
  const module = await LOADERS[dialect]();
  const nestedDefault = typeof module.default === 'object' ? module.default.Parser : undefined;
  const directDefault = typeof module.default === 'function' ? module.default : undefined;
  const Parser = module.Parser ?? nestedDefault ?? directDefault;
  if (!Parser) throw new Error(`无法加载 ${dialect} 解析器`);
  const parser = new Parser();
  parsers.set(dialect, parser);
  return parser;
}

self.onmessage = async (event: MessageEvent<ParseRequest>) => {
  const request = event.data;
  const startedAt = performance.now();
  const response: ParseResponse = { id: request.id, durationMs: 0 };
  try {
    const parser = await getParser(request.dialect);
    const ast = parser.astify(request.sql.trim());
    response.result = createParseResult(Array.isArray(ast) ? ast : [ast], request.schemaSnapshot);
  } catch (error) {
    const detail = error as { message?: string; location?: { start?: { line?: number; offset?: number } } };
    response.error = {
      message: detail.message ?? String(error),
      line: detail.location?.start?.line,
      offset: detail.location?.start?.offset,
    };
  }
  response.durationMs = Math.round(performance.now() - startedAt);
  self.postMessage(response);
};
