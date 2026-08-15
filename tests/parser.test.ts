import { describe, expect, it } from 'vitest';
import { parseSQL } from '@/parser';
import { mergeColumnsByPriority } from '@/parser/extractors/columns';
import type { DatabaseSchemaSnapshot } from '@/types/database';
import { buildDatabaseSchemaGraph } from '@/parser/schema-graph';
import { layoutERGraph } from '@/layout/er-layout';

describe('SQL graph parser', () => {
  it('normalizes array table refs and creates FK edges', async () => {
    const result = await parseSQL(`CREATE TABLE users (id INT PRIMARY KEY);
      CREATE TABLE orders (id INT PRIMARY KEY, user_id INT, FOREIGN KEY (user_id) REFERENCES users(id));`, 'mysql');
    expect(result.error).toBeNull();
    expect(result.stats.tableCount).toBe(2);
    expect(result.erGraph.nodes.filter(node => node.kind === 'table').map(node => node.displayName)).toEqual(expect.arrayContaining(['users', 'orders']));
    expect(result.erGraph.edges).toEqual(expect.arrayContaining([expect.objectContaining({ joinType: 'FK', cardinality: 'N:1', source: 'table::orders', target: 'table::users' })]));
  });

  it('keeps ordinary JOIN cardinality unknown', async () => {
    const result = await parseSQL('SELECT * FROM users u JOIN orders o ON u.id = o.user_id', 'mysql');
    expect(result.error).toBeNull();
    expect(result.erGraph.edges[0]).toMatchObject({ source: 'table::users', target: 'table::orders', cardinality: null });
  });

  it('自引用外键生成自环 FK 边且布局不报错', async () => {
    const result = await parseSQL('CREATE TABLE nodes (id INT PRIMARY KEY, parent_id INT, FOREIGN KEY (parent_id) REFERENCES nodes(id))', 'mysql');
    expect(result.error).toBeNull();
    expect(result.erGraph.edges).toEqual(expect.arrayContaining([expect.objectContaining({ joinType: 'FK', source: 'table::nodes', target: 'table::nodes' })]));
    expect(() => layoutERGraph(result.erGraph)).not.toThrow();
  });

  it('自连接生成自环 JOIN 边', async () => {
    const result = await parseSQL('SELECT e.name FROM employees e JOIN employees m ON e.manager_id = m.id', 'mysql');
    expect(result.error).toBeNull();
    expect(result.erGraph.edges).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'table::employees', target: 'table::employees', joinType: 'INNER JOIN' })]));
  });

  it('数据库快照命中时限定名与非限定名合并为同一节点', async () => {
    const snapshot: DatabaseSchemaSnapshot = {
      connectionId: 'db-merge', fetchedAt: 1, tables: [{
        id: 'public.users', schema: 'public', name: 'users', foreignKeys: [],
        columns: [{ name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isUnique: true }],
      }],
    };
    const result = await parseSQL('SELECT a.id, b.id FROM users a JOIN public.users b ON a.id = b.id', 'postgresql', snapshot);
    expect(result.error).toBeNull();
    const tables = result.erGraph.nodes.filter(node => node.kind === 'table');
    expect(tables).toHaveLength(1);
    expect(tables[0]?.id).toBe('table::public.users');
  });

  it('列级 UNIQUE KEY 约束被识别为唯一', async () => {
    const result = await parseSQL('CREATE TABLE t (email VARCHAR(100) UNIQUE KEY)', 'mysql');
    expect(result.error).toBeNull();
    const column = result.erGraph.nodes[0]?.columns.find(item => item.name === 'email');
    expect(column?.isUnique).toBe(true);
  });

  it('adds qualified SELECT, JOIN and filter references as inferred columns', async () => {
    const result = await parseSQL(`SELECT u.id, o.created_at
      FROM users u JOIN orders o ON u.id = o.user_id
      WHERE o.status = 'paid' AND unqualified = 1
      HAVING o.total > 10`, 'mysql');
    const users = result.erGraph.nodes.find(node => node.kind === 'table' && node.tableName === 'users');
    const orders = result.erGraph.nodes.find(node => node.kind === 'table' && node.tableName === 'orders');
    expect(users?.columns).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'id', type: 'unknown', source: 'sql-inferred' })]));
    expect(orders?.columns.map(column => column.name)).toEqual(expect.arrayContaining(['created_at', 'user_id', 'status', 'total']));
    expect(result.erGraph.nodes.flatMap(node => node.columns).some(column => column.name === 'unqualified')).toBe(false);
  });

  it('merges columns with DDL over database over SQL inference priority', () => {
    expect(mergeColumnsByPriority(
      [{ name: 'id', type: 'bigint', source: 'ddl', isPK: true, isFK: false }],
      [{ name: 'id', type: 'integer', source: 'database', isPK: false, isFK: false }, { name: 'email', type: 'text', source: 'database', isPK: false, isFK: false }],
      [{ name: 'id', type: 'unknown', source: 'sql-inferred', isPK: false, isFK: false }, { name: 'email', type: 'unknown', source: 'sql-inferred', isPK: false, isFK: false }, { name: 'name', type: 'unknown', source: 'sql-inferred', isPK: false, isFK: false }],
    )).toEqual([
      expect.objectContaining({ name: 'id', type: 'bigint', source: 'ddl' }),
      expect.objectContaining({ name: 'email', type: 'text', source: 'database' }),
      expect.objectContaining({ name: 'name', type: 'unknown', source: 'sql-inferred' }),
    ]);
  });

  it('uses database metadata to complete SQL tables without overriding DDL', async () => {
    const snapshot: DatabaseSchemaSnapshot = {
      connectionId: 'db-1', fetchedAt: 1, tables: [{
        id: 'public.users', schema: 'public', name: 'users', foreignKeys: [],
        columns: [{ name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isUnique: true }],
      }],
    };
    const fromDatabase = await parseSQL('SELECT u.id FROM users u', 'postgresql', snapshot);
    expect(fromDatabase.erGraph.nodes[0]?.columns[0]).toMatchObject({ name: 'id', type: 'uuid', source: 'database', isPK: true });
    const fromDDL = await parseSQL('CREATE TABLE users (id BIGINT PRIMARY KEY); SELECT u.id FROM users u', 'postgresql', snapshot);
    expect(fromDDL.erGraph.nodes.find(node => node.kind === 'table')?.columns[0]).toMatchObject({ name: 'id', type: 'bigint', source: 'ddl' });
  });

  it('builds database scope from only the selected tables', () => {
    const snapshot: DatabaseSchemaSnapshot = { connectionId: 'db', fetchedAt: 1, tables: [
      { id: 'public.users', schema: 'public', name: 'users', columns: [{ name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isUnique: true }], foreignKeys: [] },
      { id: 'public.orders', schema: 'public', name: 'orders', columns: [{ name: 'user_id', type: 'uuid', nullable: false, isPrimaryKey: false, isUnique: false }], foreignKeys: [{ id: 'orders_user_fk', columns: ['user_id'], referencedTableId: 'public.users', referencedColumns: ['id'] }] },
    ] };
    expect(buildDatabaseSchemaGraph(snapshot, ['public.users', 'public.orders'])).toMatchObject({ nodes: [{ displayName: 'public.users' }, { displayName: 'public.orders' }], edges: [{ cardinality: 'N:1' }] });
    expect(buildDatabaseSchemaGraph(snapshot, ['public.orders']).edges).toHaveLength(0);
  });

  it('does not duplicate CTE as a physical table and models INSERT SELECT', async () => {
    const cte = await parseSQL('WITH recent AS (SELECT id FROM orders) SELECT * FROM recent', 'mysql');
    expect(cte.stats.cteCount).toBe(1);
    expect(cte.erGraph.nodes.filter(node => node.kind === 'table' && node.tableName === 'recent')).toHaveLength(0);
    expect(cte.dfGraph.nodes.filter(node => node.kind === 'cte')).toHaveLength(1);

    const insert = await parseSQL('INSERT INTO archive(id) SELECT id FROM orders', 'mysql');
    expect(insert.dfGraph.edges.some(edge => edge.kind === 'write')).toBe(true);
    expect(insert.erGraph.nodes.filter(node => node.kind === 'table').map(node => node.tableName)).toEqual(expect.arrayContaining(['archive', 'orders']));
  });

  it('models UPDATE and DELETE targets and reports unsupported statements', async () => {
    const update = await parseSQL('UPDATE users SET active = 0 WHERE id = 1', 'mysql');
    const remove = await parseSQL('DELETE FROM users WHERE id = 1', 'mysql');
    expect(update.dfGraph.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'target', operation: 'UPDATE', targetTable: 'users' })]));
    expect(remove.dfGraph.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'target', operation: 'DELETE', targetTable: 'users' })]));
    expect(remove.dfGraph.edges).toHaveLength(1);

    const unsupported = await parseSQL('ALTER TABLE users ADD COLUMN name VARCHAR(20)', 'mysql');
    expect(unsupported.error).toBeNull();
    expect(unsupported.warnings[0]?.code).toBe('unsupported-statement');
  });

  it('keeps valid statements when parsing mixed SQL', async () => {
    const result = await parseSQL('SELECT * FROM users; ALTER TABLE users ADD COLUMN x INT;', 'mysql');
    expect(result.error).toBeNull();
    expect(result.stats.tableCount).toBe(1);
    expect(result.warnings).toHaveLength(1);
  });

  it('handles PostgreSQL nested column identifiers and MySQL UPDATE JOIN', async () => {
    const postgres = await parseSQL('SELECT * FROM users u JOIN orders o ON u.id = o.user_id', 'postgresql');
    expect(postgres.error).toBeNull();
    expect(postgres.erGraph.edges[0]?.conditions[0]).toMatchObject({ leftColumn: 'id', rightColumn: 'user_id' });

    const mysql = await parseSQL('UPDATE users u JOIN orders o ON u.id = o.user_id SET u.active = 0', 'mysql');
    expect(mysql.error).toBeNull();
    expect(mysql.erGraph.nodes.filter(node => node.kind === 'table').map(node => node.tableName)).toEqual(expect.arrayContaining(['users', 'orders']));
    expect(mysql.dfGraph.edges.some(edge => edge.kind === 'join')).toBe(true);
  });
});
