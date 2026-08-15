import type { Dialect } from '@/types/sql';
import { getDialectParser } from './loader';

/** 与 worker 相同的加载路径：per-dialect 懒加载（见 loader.ts） */
export async function astify(sql: string, dialect: Dialect): Promise<unknown[]> {
  const parser = await getDialectParser(dialect);
  const ast = parser.astify(sql.trim());
  return Array.isArray(ast) ? ast : [ast];
}
