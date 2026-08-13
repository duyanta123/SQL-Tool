import { describe, expect, it } from 'vitest';
import { formatSQLText, tryFormatSQL } from '@/utils/sql-format';
import { DIALECTS } from '@/config/dialects';

function squeeze(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('SQL 格式化 sql-format', () => {
  it('格式化幂等且关键字大写', () => {
    const sql = 'select u.id,count(o.total) as cnt from users u join orders o on u.id=o.user_id group by u.id';
    const once = formatSQLText(sql, 'mysql');
    const twice = formatSQLText(once, 'mysql');
    expect(twice).toBe(once);
    expect(once).toContain('SELECT');
    expect(once).toContain('count(o.total) AS cnt');
    expect(once.split('\n').length).toBeGreaterThan(3);
  });

  it('所有方言都有映射且不抛错', () => {
    for (const dialect of DIALECTS) {
      expect(() => formatSQLText('select 1', dialect.id)).not.toThrow();
    }
  });

  it('多语句之间保持分隔', () => {
    const out = squeeze(formatSQLText('select 1; select 2;', 'postgresql'));
    expect(out).toContain('SELECT 1;');
    expect(out).toContain('SELECT 2;');
  });

  it('tryFormatSQL 不因格式化失败而丢失原 SQL', () => {
    const result = tryFormatSQL('select 1', 'mysql');
    expect(result.error).toBeNull();
    expect(squeeze(result.sql)).toContain('SELECT 1');
  });
});
