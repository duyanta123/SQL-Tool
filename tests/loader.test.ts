import { describe, expect, it } from 'vitest';
import { DIALECT_IDS } from '@/types/sql';
import { getDialectParser } from '@/parser/loader';

describe('dialect parser loader（与 worker 同一加载路径）', () => {
  it.each([...DIALECT_IDS])('loads %s parser and astify a trivial SELECT', async dialect => {
    const parser = await getDialectParser(dialect);
    const ast = parser.astify('SELECT 1');
    expect(ast).toBeTruthy();
  });

  it('caches parser instances per dialect', async () => {
    const first = await getDialectParser('mysql');
    const second = await getDialectParser('mysql');
    expect(second).toBe(first);
  });

  it('throws a readable error for unknown dialects', async () => {
    await expect(getDialectParser('not-a-dialect' as never)).rejects.toThrow('不支持的方言');
  });
});
