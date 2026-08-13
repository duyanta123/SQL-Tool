import { describe, expect, it } from 'vitest';
import { parseSQL } from '@/parser';
import type { DataFlowEdge, DataFlowGraph, DFColumnMapping } from '@/types/dataflow';

function resultNode(graph: DataFlowGraph, kind: 'target' | 'aggregate') {
  return graph.nodes.find(node => node.kind === kind);
}

function mappingsFor(edge: DataFlowEdge | undefined): DFColumnMapping[] {
  return edge?.columnMapping ?? [];
}

describe('列级血缘 column-level lineage', () => {
  it('把限定字段的投影映射到各自的来源表', () => {
    const result = parseSQL('SELECT u.id, o.total FROM users u JOIN orders o ON u.id = o.user_id', 'mysql');
    expect(result.error).toBeNull();
    const target = resultNode(result.dfGraph, 'target');
    expect(target).toBeDefined();

    const usersEdge = result.dfGraph.edges.find(edge => edge.target === target?.id && edge.kind === 'read');
    const ordersEdge = result.dfGraph.edges.find(edge => edge.target === target?.id && edge.kind === 'join');
    expect(usersEdge).toBeDefined();
    expect(ordersEdge).toBeDefined();

    expect(mappingsFor(usersEdge)).toEqual([{ source: { table: 'u', column: 'id' }, target: { column: 'id' } }]);
    expect(mappingsFor(ordersEdge)).toEqual([{ source: { table: 'o', column: 'total' }, target: { column: 'total' } }]);
  });

  it('在源表节点上记录实际引用的列', () => {
    const result = parseSQL('SELECT u.id, u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id', 'mysql');
    const users = result.dfGraph.nodes.find((node): node is Extract<typeof node, { kind: 'source' }> => node.kind === 'source' && node.tableName === 'users');
    const orders = result.dfGraph.nodes.find((node): node is Extract<typeof node, { kind: 'source' }> => node.kind === 'source' && node.tableName === 'orders');
    expect(users?.outputColumns).toEqual(['id', 'name']);
    expect(orders?.outputColumns).toEqual(['total']);
  });

  it('处理聚合与 GROUP BY 列并记录表达式文本', () => {
    const result = parseSQL("SELECT user_id, COUNT(*) AS cnt FROM orders GROUP BY user_id", 'mysql');
    expect(result.error).toBeNull();
    const aggregate = resultNode(result.dfGraph, 'aggregate');
    expect(aggregate).toBeDefined();
    const edge = result.dfGraph.edges.find(item => item.target === aggregate?.id && item.kind === 'read');
    expect(edge).toBeDefined();
    const mappings = mappingsFor(edge);
    expect(mappings).toEqual(expect.arrayContaining([
      { source: { table: 'orders', column: 'user_id' }, target: { column: 'user_id' } },
      { source: { table: 'orders', column: '' }, target: { column: 'cnt' }, expression: 'COUNT(*)' },
    ]));
  });

  it('为 CASE 表达式记录引用列与表达式文本', () => {
    const result = parseSQL("SELECT CASE WHEN o.status = 'paid' THEN o.total ELSE 0 END AS amount FROM orders o", 'mysql');
    expect(result.error).toBeNull();
    const target = resultNode(result.dfGraph, 'target');
    const edge = result.dfGraph.edges.find(item => item.target === target?.id);
    const mappings = mappingsFor(edge);
    expect(mappings).toHaveLength(2);
    expect(mappings.every(mapping => mapping.target.column === 'amount')).toBe(true);
    expect(mappings[0]?.expression).toContain('CASE');
    expect(mappings.map(mapping => mapping.source.column).sort()).toEqual(['status', 'total']);
  });

  it('跳过无法归属的未限定字段（歧义不猜测）', () => {
    const result = parseSQL('SELECT id FROM users u JOIN orders o ON u.id = o.user_id', 'mysql');
    expect(result.error).toBeNull();
    const target = resultNode(result.dfGraph, 'target');
    const edges = result.dfGraph.edges.filter(edge => edge.target === target?.id);
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(mappingsFor(edge).some(mapping => mapping.target.column === 'id')).toBe(false);
    }
  });

  it('跨 CTE 追踪列映射', () => {
    const result = parseSQL('WITH t AS (SELECT id FROM users) SELECT t.id FROM t', 'mysql');
    expect(result.error).toBeNull();
    const cteEdge = result.dfGraph.edges.find(edge => edge.kind === 'read' && edge.source.includes('::cte::t'));
    expect(mappingsFor(cteEdge)).toEqual(expect.arrayContaining([
      { source: { table: 't', column: 'id' }, target: { column: 'id' } },
    ]));
    const innerEdge = result.dfGraph.edges.find(edge => edge.kind === 'read' && edge.source.includes('source::users'));
    expect(mappingsFor(innerEdge)).toEqual(expect.arrayContaining([
      { source: { table: 'users', column: 'id' }, target: { column: 'id' } },
    ]));
  });

  it('记录窗口函数涉及的列', () => {
    const result = parseSQL('SELECT ROW_NUMBER() OVER (PARTITION BY u.dept ORDER BY u.id) AS rn FROM users u', 'mysql');
    expect(result.error).toBeNull();
    const target = resultNode(result.dfGraph, 'target');
    const edge = result.dfGraph.edges.find(item => item.target === target?.id);
    const mappings = mappingsFor(edge);
    expect(mappings).toHaveLength(2);
    expect(mappings.every(mapping => mapping.target.column === 'rn' && mapping.expression === 'ROW_NUMBER()')).toBe(true);
    expect(mappings.map(mapping => mapping.source.column).sort()).toEqual(['dept', 'id']);
  });

  it('子查询作为来源时映射到子查询别名', () => {
    const result = parseSQL('SELECT s.id FROM (SELECT id FROM users) s', 'mysql');
    expect(result.error).toBeNull();
    const subqueryNode = result.dfGraph.nodes.find(node => node.kind === 'subquery');
    expect(subqueryNode).toBeDefined();
    const outer = result.dfGraph.nodes.find(node => node.kind === 'target'
      && result.dfGraph.edges.some(edge => edge.target === node.id && edge.source === subqueryNode?.id));
    expect(outer).toBeDefined();
    const outerEdge = result.dfGraph.edges.find(edge => edge.target === outer?.id && edge.source === subqueryNode?.id);
    expect(mappingsFor(outerEdge)).toEqual(expect.arrayContaining([
      { source: { table: 's', column: 'id' }, target: { column: 'id' } },
    ]));
    const innerEdge = result.dfGraph.edges.find(edge => edge.kind === 'read' && edge.source.includes('source::users'));
    expect(mappingsFor(innerEdge)).toEqual(expect.arrayContaining([
      { source: { table: 'users', column: 'id' }, target: { column: 'id' } },
    ]));
  });
});
