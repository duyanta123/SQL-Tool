import { describe, expect, it } from 'vitest';
import { parseSQL } from '@/parser';
import { mergeColumnsByPriority } from '@/parser/extractors/columns';
import type { DatabaseSchemaSnapshot } from '@/types/database';
import { buildDatabaseSchemaGraph } from '@/parser/schema-graph';

describe('SQL graph parser', () => {
  it('normalizes array table refs and creates FK edges', () => {
    const result = parseSQL(`CREATE TABLE users (id INT PRIMARY KEY);
      CREATE TABLE orders (id INT PRIMARY KEY, user_id INT, FOREIGN KEY (user_id) REFERENCES users(id));`, 'mysql');
    expect(result.error).toBeNull();
    expect(result.stats.tableCount).toBe(2);
    expect(result.erGraph.nodes.filter(node => node.kind === 'table').map(node => node.displayName)).toEqual(expect.arrayContaining(['users', 'orders']));
    expect(result.erGraph.edges).toEqual(expect.arrayContaining([expect.objectContaining({ joinType: 'FK', cardinality: 'N:1', source: 'table::orders', target: 'table::users' })]));
  });

  it('keeps ordinary JOIN cardinality unknown', () => {
    const result = parseSQL('SELECT * FROM users u JOIN orders o ON u.id = o.user_id', 'mysql');
    expect(result.error).toBeNull();
    expect(result.erGraph.edges[0]).toMatchObject({ source: 'table::users', target: 'table::orders', cardinality: null });
  });

  it('adds qualified SELECT, JOIN and filter references as inferred columns', () => {
    const result = parseSQL(`SELECT u.id, o.created_at
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

  it('uses database metadata to complete SQL tables without overriding DDL', () => {
    const snapshot: DatabaseSchemaSnapshot = {
      connectionId: 'db-1', fetchedAt: 1, tables: [{
        id: 'public.users', schema: 'public', name: 'users', foreignKeys: [],
        columns: [{ name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isUnique: true }],
      }],
    };
    const fromDatabase = parseSQL('SELECT u.id FROM users u', 'postgresql', snapshot);
    expect(fromDatabase.erGraph.nodes[0]?.columns[0]).toMatchObject({ name: 'id', type: 'uuid', source: 'database', isPK: true });
    const fromDDL = parseSQL('CREATE TABLE users (id BIGINT PRIMARY KEY); SELECT u.id FROM users u', 'postgresql', snapshot);
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

  it('does not duplicate CTE as a physical table and models INSERT SELECT', () => {
    const cte = parseSQL('WITH recent AS (SELECT id FROM orders) SELECT * FROM recent', 'mysql');
    expect(cte.stats.cteCount).toBe(1);
    expect(cte.erGraph.nodes.filter(node => node.kind === 'table' && node.tableName === 'recent')).toHaveLength(0);
    expect(cte.dfGraph.nodes.filter(node => node.kind === 'cte')).toHaveLength(1);

    const insert = parseSQL('INSERT INTO archive(id) SELECT id FROM orders', 'mysql');
    expect(insert.dfGraph.edges.some(edge => edge.kind === 'write')).toBe(true);
    expect(insert.erGraph.nodes.filter(node => node.kind === 'table').map(node => node.tableName)).toEqual(expect.arrayContaining(['archive', 'orders']));
  });

  it('models UPDATE and DELETE targets and reports unsupported statements', () => {
    const update = parseSQL('UPDATE users SET active = 0 WHERE id = 1', 'mysql');
    const remove = parseSQL('DELETE FROM users WHERE id = 1', 'mysql');
    expect(update.dfGraph.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'target', operation: 'UPDATE', targetTable: 'users' })]));
    expect(remove.dfGraph.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'target', operation: 'DELETE', targetTable: 'users' })]));
    expect(remove.dfGraph.edges).toHaveLength(1);

    const unsupported = parseSQL('ALTER TABLE users ADD COLUMN name VARCHAR(20)', 'mysql');
    expect(unsupported.error).toBeNull();
    expect(unsupported.warnings[0]?.code).toBe('unsupported-statement');
  });

  it('keeps valid statements when parsing mixed SQL', () => {
    const result = parseSQL('SELECT * FROM users; ALTER TABLE users ADD COLUMN x INT;', 'mysql');
    expect(result.error).toBeNull();
    expect(result.stats.tableCount).toBe(1);
    expect(result.warnings).toHaveLength(1);
  });

  it('handles PostgreSQL nested column identifiers and MySQL UPDATE JOIN', () => {
    const postgres = parseSQL('SELECT * FROM users u JOIN orders o ON u.id = o.user_id', 'postgresql');
    expect(postgres.error).toBeNull();
    expect(postgres.erGraph.edges[0]?.conditions[0]).toMatchObject({ leftColumn: 'id', rightColumn: 'user_id' });

    const mysql = parseSQL('UPDATE users u JOIN orders o ON u.id = o.user_id SET u.active = 0', 'mysql');
    expect(mysql.error).toBeNull();
    expect(mysql.erGraph.nodes.filter(node => node.kind === 'table').map(node => node.tableName)).toEqual(expect.arrayContaining(['users', 'orders']));
    expect(mysql.dfGraph.edges.some(edge => edge.kind === 'join')).toBe(true);
  });
});
