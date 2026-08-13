import { describe, expect, it } from 'vitest';
import { parseSQL } from '@/parser';
import type { ERGraph } from '@/types/er-diagram';

function columnOf(graph: ERGraph, tableName: string, column: string) {
  const node = graph.nodes.find(item => item.kind === 'table' && item.tableName === tableName);
  return node?.columns.find(item => item.name.toLowerCase() === column.toLowerCase());
}

describe('类型推断 type inference', () => {
  it('数值比较与 LIKE 推断 number / string', () => {
    const result = parseSQL("SELECT u.id, u.name FROM users u WHERE u.id > 5 AND u.name LIKE 'A%'", 'mysql');
    expect(result.error).toBeNull();
    expect(columnOf(result.erGraph, 'users', 'id')).toMatchObject({ type: 'number', source: 'sql-inferred' });
    expect(columnOf(result.erGraph, 'users', 'name')).toMatchObject({ type: 'string', source: 'sql-inferred' });
  });

  it('WHERE 数值比较作用到 JOIN 中的表', () => {
    const result = parseSQL('SELECT o.id FROM orders o JOIN users u ON o.user_id = u.id WHERE o.amount >= 100', 'mysql');
    expect(result.error).toBeNull();
    expect(columnOf(result.erGraph, 'orders', 'amount')).toMatchObject({ type: 'number' });
    expect(columnOf(result.erGraph, 'orders', 'user_id')).toMatchObject({ type: 'unknown' });
  });

  it('聚合函数的参数列为 number', () => {
    const result = parseSQL('SELECT user_id, COUNT(o.total) AS c FROM orders o GROUP BY user_id', 'mysql');
    expect(result.error).toBeNull();
    expect(columnOf(result.erGraph, 'orders', 'total')).toMatchObject({ type: 'number' });
    // 未限定的 user_id 不归属任何表（保持“不猜测归属”规则）
    expect(columnOf(result.erGraph, 'orders', 'user_id')).toBeUndefined();
  });

  it('CAST 的目标类型映射为推断类型', () => {
    const result = parseSQL('SELECT CAST(u.id AS UNSIGNED) AS uid FROM users u', 'mysql');
    expect(result.error).toBeNull();
    expect(columnOf(result.erGraph, 'users', 'id')).toMatchObject({ type: 'number' });
  });

  it('布尔字面量比较推断 boolean', () => {
    const result = parseSQL('SELECT u.active FROM users u WHERE u.active = true', 'mysql');
    expect(result.error).toBeNull();
    expect(columnOf(result.erGraph, 'users', 'active')).toMatchObject({ type: 'boolean' });
  });

  it('不覆盖 DDL 声明的真实类型', () => {
    const result = parseSQL("CREATE TABLE users (id INT PRIMARY KEY); SELECT u.id FROM users u WHERE u.id = 'x'", 'mysql');
    expect(result.error).toBeNull();
    expect(columnOf(result.erGraph, 'users', 'id')).toMatchObject({ type: 'int', source: 'ddl' });
  });

  it('类型证据冲突时保持 unknown（不猜测）', () => {
    const result = parseSQL("SELECT u.x FROM users u WHERE u.x = 5 AND u.x = 'a'", 'mysql');
    expect(result.error).toBeNull();
    expect(columnOf(result.erGraph, 'users', 'x')).toMatchObject({ type: 'unknown', source: 'sql-inferred' });
  });
});
