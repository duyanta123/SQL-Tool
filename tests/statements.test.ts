import { describe, expect, it } from 'vitest';
import { parseSQL } from '@/parser';
import type { DataFlowEdge, DFColumnMapping } from '@/types/dataflow';

function mappingsFor(edge: DataFlowEdge | undefined): DFColumnMapping[] {
  return edge?.columnMapping ?? [];
}

describe('语句覆盖 statement coverage', () => {
  it('支持递归 CTE 且自引用回到 CTE 节点', () => {
    const result = parseSQL(
      'WITH RECURSIVE tree AS (SELECT id, parent_id FROM nodes WHERE parent_id IS NULL UNION ALL SELECT n.id, n.parent_id FROM nodes n JOIN tree t ON n.parent_id = t.id) SELECT * FROM tree',
      'mysql',
    );
    expect(result.error).toBeNull();
    const cte = result.dfGraph.nodes.find(node => node.kind === 'cte' && node.cteName === 'tree');
    expect(cte).toBeDefined();
    const selfJoin = result.dfGraph.edges.find(edge => edge.kind === 'join' && edge.source === cte?.id);
    expect(selfJoin).toBeDefined();
    expect(result.erGraph.nodes.some(node => node.kind === 'cte' && node.name === 'tree')).toBe(true);
  });

  it('CREATE VIEW 在 ER 图生成视图节点并在数据流图生成写边', () => {
    const result = parseSQL('CREATE VIEW active_users AS SELECT id, name FROM users WHERE active = 1', 'mysql');
    expect(result.error).toBeNull();
    expect(result.warnings).toEqual([]);
    const view = result.erGraph.nodes.find(node => node.kind === 'table' && node.tableType === 'view');
    expect(view).toBeDefined();
    expect(view?.displayName).toBe('active_users');
    expect(view?.columns.map(column => column.name)).toEqual(['id', 'name']);
    const target = result.dfGraph.nodes.find(node => node.kind === 'target' && node.operation === 'CREATE' && node.targetTable === 'active_users');
    expect(target).toBeDefined();
    const writeEdge = result.dfGraph.edges.find(edge => edge.target === target?.id && edge.kind === 'write');
    expect(writeEdge?.label).toBe('VIEW');
  });

  it('CREATE VIEW 使用显式列清单（SQLite）', () => {
    const result = parseSQL('CREATE VIEW v (a, b) AS SELECT id, name FROM users', 'sqlite');
    expect(result.error).toBeNull();
    const view = result.erGraph.nodes.find(node => node.kind === 'table' && node.tableType === 'view' && node.tableName === 'v');
    expect(view?.columns.map(column => column.name)).toEqual(['a', 'b']);
  });

  it('PostgreSQL ON CONFLICT 标记为 UPSERT', () => {
    const result = parseSQL("INSERT INTO stats (day, cnt) VALUES ('2026-01-01', 1) ON CONFLICT (day) DO UPDATE SET cnt = stats.cnt + 1", 'postgresql');
    expect(result.error).toBeNull();
    const target = result.dfGraph.nodes.find(node => node.kind === 'target' && node.operation === 'UPSERT');
    expect(target).toBeDefined();
    expect(target?.targetTable).toBe('stats');
    const writeEdge = result.dfGraph.edges.find(edge => edge.target === target?.id && edge.kind === 'write');
    expect(writeEdge?.label).toBe('UPSERT');
  });

  it('MySQL ON DUPLICATE KEY 标记为 UPSERT', () => {
    const result = parseSQL("INSERT INTO stats (day, cnt) VALUES ('2026-01-01', 1) ON DUPLICATE KEY UPDATE cnt = cnt + 1", 'mysql');
    expect(result.error).toBeNull();
    const target = result.dfGraph.nodes.find(node => node.kind === 'target' && node.operation === 'UPSERT');
    expect(target).toBeDefined();
    expect(result.dfGraph.edges.some(edge => edge.target === target?.id && edge.label === 'UPSERT')).toBe(true);
  });

  it('PostgreSQL DISTINCT ON 正常解析', () => {
    const result = parseSQL('SELECT DISTINCT ON (u.id) u.id, o.total FROM users u JOIN orders o ON o.user_id = u.id', 'postgresql');
    expect(result.error).toBeNull();
    expect(result.stats.tableCount).toBe(2);
    expect(result.stats.joinCount).toBe(1);
  });

  it('PostgreSQL FILTER 聚合记录表达式与引用列', () => {
    const result = parseSQL("SELECT COUNT(*) FILTER (WHERE status = 'paid') AS paid_cnt FROM orders", 'postgresql');
    expect(result.error).toBeNull();
    const aggregate = result.dfGraph.nodes.find(node => node.kind === 'aggregate');
    const edge = result.dfGraph.edges.find(item => item.target === aggregate?.id && item.kind === 'read');
    const mappings = mappingsFor(edge);
    const paid = mappings.find(mapping => mapping.target.column === 'paid_cnt');
    expect(paid).toBeDefined();
    expect(paid?.expression).toContain('COUNT');
    expect(mappings.some(mapping => mapping.source.column === 'status')).toBe(true);
  });

  it('PostgreSQL :: 类型转换记录表达式', () => {
    const result = parseSQL('SELECT u.created_at::date AS d FROM users u', 'postgresql');
    expect(result.error).toBeNull();
    const target = result.dfGraph.nodes.find(node => node.kind === 'target' && node.operation === 'SELECT');
    const edge = result.dfGraph.edges.find(item => item.target === target?.id && item.kind === 'read');
    const mapping = mappingsFor(edge).find(item => item.target.column === 'd');
    expect(mapping?.expression?.toLowerCase()).toContain('date');
  });

  it('MySQL CAST 记录表达式', () => {
    const result = parseSQL('SELECT CAST(u.id AS UNSIGNED) AS uid FROM users u', 'mysql');
    expect(result.error).toBeNull();
    const target = result.dfGraph.nodes.find(node => node.kind === 'target' && node.operation === 'SELECT');
    const edge = result.dfGraph.edges.find(item => item.target === target?.id && item.kind === 'read');
    const mapping = mappingsFor(edge).find(item => item.target.column === 'uid');
    expect(mapping?.expression).toContain('UNSIGNED');
  });

  it('TSQL MERGE 属于解析器暂不支持的范围（报错并保留上一次有效图）', () => {
    const result = parseSQL(
      'MERGE INTO target t USING source s ON t.id = s.id WHEN MATCHED THEN UPDATE SET t.name = s.name WHEN NOT MATCHED THEN INSERT (id, name) VALUES (s.id, s.name);',
      'transactsql',
    );
    expect(result.error).not.toBeNull();
    expect(result.erGraph.nodes).toEqual([]);
  });

  it('PostgreSQL CREATE MATERIALIZED VIEW 属于解析器暂不支持的范围', () => {
    const result = parseSQL('CREATE MATERIALIZED VIEW mv AS SELECT id FROM users', 'postgresql');
    expect(result.error).not.toBeNull();
  });
});
