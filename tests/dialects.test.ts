import { describe, expect, it } from 'vitest';
import { DIALECTS } from '@/config/dialects';
import { DIALECT_IDS } from '@/types/sql';
import { parseSQL } from '@/parser';

describe('dialect registry', () => {
  it('registers every product dialect once and marks Snowflake experimental', () => {
    expect(DIALECTS.map(dialect => dialect.id)).toEqual([...DIALECT_IDS]);
    expect(new Set(DIALECTS.map(dialect => dialect.parserModule)).size).toBe(DIALECTS.length);
    expect(DIALECTS.find(dialect => dialect.id === 'transactsql')?.label).toBe('SQL Server');
    expect(DIALECTS.find(dialect => dialect.id === 'snowflake')?.experimental).toBe(true);
  });

  it.each(DIALECTS)('parses a basic SELECT with $label', async dialect => {
    const result = await parseSQL('SELECT a.id FROM a', dialect.id);
    expect(result.error).toBeNull();
    expect(result.stats.tableCount).toBe(1);
  });
});
