import { describe, expect, it } from 'vitest';
import { parseSQL } from '@/parser';
import type { DataFlowEdge, DataFlowGraph } from '@/types/dataflow';

function resultNode(graph: DataFlowGraph) {
  return graph.nodes.find(node => node.kind === 'target' && node.operation === 'SELECT');
}

function filtersOf(edge: DataFlowEdge | undefined) {
  return edge?.filters ?? [];
}

describe('表达式级 JOIN/WHERE 可视化 expression display', () => {
  it('JOIN 条件保留 AND/OR 与括号分组并解析别名', async () => {
    const result = await parseSQL("SELECT u.id FROM users u JOIN orders o ON u.id = o.user_id AND (o.amount > 100 OR o.status = 'vip')", 'mysql');
    expect(result.error).toBeNull();
    const edge = result.erGraph.edges[0];
    expect(edge?.conditionSQL).toBe("users.id = orders.user_id AND (orders.amount > 100 OR orders.status = 'vip')");
    // 纯等值 JOIN 不重复展示完整文本（悬浮层仍显示逐条条件）
    expect(edge?.conditions).toHaveLength(1);
  });

  it('OR 中的等值对不进入结构化 conditions（完整语义由 conditionSQL 承载）', async () => {
    const result = await parseSQL('SELECT u.id FROM users u JOIN orders o ON u.id = o.user_id OR u.role = o.status', 'mysql');
    expect(result.error).toBeNull();
    const edge = result.erGraph.edges[0];
    expect(edge?.conditions).toHaveLength(0);
    expect(edge?.conditionSQL).toContain('OR');
  });

  it('结果节点 detail 展示 WHERE 文本', async () => {
    const result = await parseSQL("SELECT u.id FROM users u WHERE u.age > 18 AND u.name LIKE 'A%'", 'mysql');
    expect(result.error).toBeNull();
    const target = resultNode(result.dfGraph);
    expect(target?.detail).toContain('WHERE');
    expect(target?.detail).toContain('u.age > 18');
    expect(target?.detail).toContain("u.name LIKE 'A%'");
  });

  it('read 边上挂 WHERE 引用的过滤列', async () => {
    const result = await parseSQL("SELECT u.id FROM users u WHERE u.age > 18 AND u.name LIKE 'A%'", 'mysql');
    const target = resultNode(result.dfGraph);
    const edge = result.dfGraph.edges.find(item => item.target === target?.id && item.kind === 'read');
    expect(filtersOf(edge)).toEqual([
      { table: 'u', column: 'age' },
      { table: 'u', column: 'name' },
    ]);
  });

  it('WHERE 中的过滤列归属到对应 JOIN 来源', async () => {
    const result = await parseSQL('SELECT u.id FROM users u JOIN orders o ON u.id = o.user_id WHERE o.amount > 5', 'mysql');
    const target = resultNode(result.dfGraph);
    const joinEdge = result.dfGraph.edges.find(item => item.target === target?.id && item.kind === 'join');
    expect(filtersOf(joinEdge)).toEqual([{ table: 'o', column: 'amount' }]);
    const readEdge = result.dfGraph.edges.find(item => item.target === target?.id && item.kind === 'read');
    expect(filtersOf(readEdge)).toEqual([]);
  });

  it('HAVING 文本进入聚合节点 detail', async () => {
    const result = await parseSQL('SELECT user_id FROM orders GROUP BY user_id HAVING COUNT(*) > 1', 'mysql');
    expect(result.error).toBeNull();
    const aggregate = result.dfGraph.nodes.find(node => node.kind === 'aggregate');
    expect(aggregate?.detail).toContain('GROUP BY user_id');
    expect(aggregate?.detail).toContain('HAVING COUNT(*) > 1');
  });

  it('IN 列表渲染为可读文本', async () => {
    const result = await parseSQL('SELECT u.id FROM users u WHERE u.id IN (1, 2, 3)', 'mysql');
    expect(result.error).toBeNull();
    const target = resultNode(result.dfGraph);
    expect(target?.detail).toContain('IN (1, 2, 3)');
  });

  it('未限定的过滤列不归属任何边（不猜测）', async () => {
    const result = await parseSQL("SELECT o.id FROM orders o JOIN users u ON o.user_id = u.id WHERE status = 'paid'", 'mysql');
    expect(result.error).toBeNull();
    const target = resultNode(result.dfGraph);
    const edges = result.dfGraph.edges.filter(item => item.target === target?.id);
    expect(edges.every(edge => filtersOf(edge).every(filter => filter.column !== 'status'))).toBe(true);
  });
});
