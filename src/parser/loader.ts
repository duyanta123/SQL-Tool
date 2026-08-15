import type { Dialect } from '@/types/sql';

/**
 * 统一的方言解析器加载器：worker 与主线程（测试/parseSQL）共用同一条加载路径，
 * 避免出现"测试绿、生产红"的双实现分叉。
 * 采用 per-dialect 懒加载，保持 worker 产物按需分包。
 */

export type ParserInstance = { astify(sql: string): unknown };
export type ParserConstructor = new () => ParserInstance;
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

export async function getDialectParser(dialect: Dialect): Promise<ParserInstance> {
  const cached = parsers.get(dialect);
  if (cached) return cached;
  const loader = LOADERS[dialect];
  if (!loader) throw new Error(`不支持的方言：${dialect}`);
  const module = await loader();
  // 兼容不同版本的导出形状：命名导出 / default.Parser / default 构造器
  const nestedDefault = typeof module.default === 'object' ? module.default.Parser : undefined;
  const directDefault = typeof module.default === 'function' ? module.default : undefined;
  const Parser = module.Parser ?? nestedDefault ?? directDefault;
  if (!Parser) throw new Error(`无法加载 ${dialect} 解析器`);
  const parser = new Parser();
  parsers.set(dialect, parser);
  return parser;
}
