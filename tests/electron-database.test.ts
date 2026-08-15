import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const database = require('../electron/database.cjs');
const { validateProfile } = require('../electron/validation.cjs');
const channels = require('../electron/channels.cjs');
const { createProfileStore } = require('../electron/profiles.cjs');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('Electron database boundary', () => {
  it('only publishes the documented IPC channels and validates inputs', () => {
    expect(channels).toEqual([
      'database.testConnection', 'database.introspectSchema', 'database.disconnect',
      'database.listProfiles', 'database.saveProfile',
      'update.check', 'update.download', 'update.install',
    ]);
    expect(() => validateProfile({ id: '../bad', name: 'Bad', kind: 'sqlite', filePath: 'relative.db' })).toThrow();
    expect(() => validateProfile({ id: 'db', name: 'DB', kind: 'mysql', host: 'localhost', port: 99999, database: 'app', username: 'me' })).toThrow(/端口/);
  });

  it('introspects SQLite columns, primary keys, unique keys and foreign keys', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sqlviz-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'schema.sqlite');
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const writer = new BetterSqlite3(filePath);
    writer.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL);
      CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, total NUMERIC,
      FOREIGN KEY (user_id) REFERENCES users(id));
      CREATE INDEX idx_orders_total ON orders(total);
      CREATE VIEW order_summary AS SELECT id, total FROM orders;`);
    writer.close();

    const snapshot = await database.introspect({ id: 'sqlite-test', name: 'Test', kind: 'sqlite', filePath, rememberPassword: false });
    const users = snapshot.tables.find((table: { name: string }) => table.name === 'users');
    const orders = snapshot.tables.find((table: { name: string }) => table.name === 'orders');
    expect(users.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'id', isPrimaryKey: true }),
      expect.objectContaining({ name: 'email', isUnique: true, nullable: false }),
    ]));
    expect(orders.foreignKeys[0]).toMatchObject({ columns: ['user_id'], referencedTableId: 'users', referencedColumns: ['id'] });
    expect(orders.indexes).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'idx_orders_total', columns: ['total'], unique: false })]));
    const view = snapshot.tables.find((table: { name: string }) => table.name === 'order_summary');
    expect(view?.kind).toBe('view');
    expect(view?.columns.map(column => column.name)).toEqual(['id', 'total']);
    await database.disconnect('sqlite-test');

    const updater = new BetterSqlite3(filePath);
    updater.exec(`ALTER TABLE orders ADD COLUMN note TEXT;
      CREATE TABLE shipments (id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id));`);
    updater.close();
    const updated = await database.introspect({ id: 'sqlite-test', name: 'Test', kind: 'sqlite', filePath, rememberPassword: false });
    expect(updated.tables.find((table: { name: string }) => table.name === 'orders').columns.some((column: { name: string }) => column.name === 'note')).toBe(true);
    expect(updated.tables.find((table: { name: string }) => table.name === 'shipments').foreignKeys).toHaveLength(1);
    await database.disconnect('sqlite-test');

    const remover = new BetterSqlite3(filePath);
    remover.exec('DROP TABLE shipments; ALTER TABLE orders DROP COLUMN note;');
    remover.close();
    const removed = await database.introspect({ id: 'sqlite-test', name: 'Test', kind: 'sqlite', filePath, rememberPassword: false });
    expect(removed.tables.some((table: { name: string }) => table.name === 'shipments')).toBe(false);
    expect(removed.tables.find((table: { name: string }) => table.name === 'orders').columns.some((column: { name: string }) => column.name === 'note')).toBe(false);
    await database.disconnect('sqlite-test');
  });

  it('uses parameterized metadata queries for MySQL and PostgreSQL drivers', async () => {
    const mysql = { execute: vi.fn()
      .mockResolvedValueOnce([[{ TABLE_SCHEMA: 'app', TABLE_NAME: 'users', COLUMN_NAME: 'id', COLUMN_TYPE: 'int', IS_NULLABLE: 'NO', COLUMN_KEY: 'PRI', COLUMN_DEFAULT: null, COLUMN_COMMENT: '用户主键' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ TABLE_NAME: 'users', TABLE_COMMENT: '用户表' }]])
      .mockResolvedValueOnce([[{ TABLE_NAME: 'users', INDEX_NAME: 'idx_users_email', COLUMN_NAME: 'email', NON_UNIQUE: 1, SEQ_IN_INDEX: 1 }]])
      .mockResolvedValueOnce([[]]) };
    const mysqlTables = await database.introspectMySQL(mysql, 'app');
    expect(mysql.execute).toHaveBeenCalledTimes(5);
    expect(mysql.execute.mock.calls.every((call: unknown[]) => (call[1] as unknown[] | undefined)?.[0] === 'app')).toBe(true);
    expect(mysqlTables[0]).toMatchObject({
      id: 'users',
      comment: '用户表',
      columns: [expect.objectContaining({ isPrimaryKey: true, comment: '用户主键' })],
      indexes: [expect.objectContaining({ name: 'idx_users_email', columns: ['email'], unique: false })],
    });

    const postgres = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ table_schema: 'public', table_name: 'users', column_name: 'id', data_type: 'uuid', is_nullable: 'NO', is_primary: true, is_unique: true }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ table_schema: 'public', table_name: 'users', column_name: 'id', comment: '用户主键' }] })
      .mockResolvedValueOnce({ rows: [{ table_schema: 'public', table_name: 'users', comment: '用户表' }] })
      .mockResolvedValueOnce({ rows: [{ schemaname: 'public', tablename: 'users', indexname: 'idx_users_email', indexdef: 'CREATE INDEX idx_users_email ON public.users USING btree (email)' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ constraint_name: 'users_id_check', table_schema: 'public', table_name: 'users', column_name: 'id', check_clause: '(id > 0)' }] }) };
    const pgTables = await database.introspectPostgreSQL(postgres, 'public');
    expect(postgres.query).toHaveBeenCalledTimes(7);
    expect(postgres.query.mock.calls.every((call: unknown[]) => (call[1] as unknown[] | undefined)?.[0] === 'public')).toBe(true);
    expect(pgTables[0]).toMatchObject({
      id: 'public.users',
      comment: '用户表',
      columns: [expect.objectContaining({ type: 'uuid', comment: '用户主键' })],
      indexes: [expect.objectContaining({ name: 'idx_users_email', unique: false })],
      checkConstraints: [expect.objectContaining({ name: 'users_id_check', column: 'id', definition: '(id > 0)' })],
    });
  });

  it('introspects SQL Server schema via parameterized INFORMATION_SCHEMA queries', async () => {
    const request = {
      input: vi.fn(function () { return this; }),
      query: vi.fn()
        .mockResolvedValueOnce({ recordset: [
          { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'users', COLUMN_NAME: 'id', DATA_TYPE: 'int', IS_NULLABLE: 'NO', COLUMN_DEFAULT: null },
          { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'users', COLUMN_NAME: 'name', DATA_TYPE: 'nvarchar', IS_NULLABLE: 'YES', COLUMN_DEFAULT: null },
        ] })
        .mockResolvedValueOnce({ recordset: [
          { CONSTRAINT_NAME: 'FK_users_role', TABLE_SCHEMA: 'dbo', TABLE_NAME: 'users', COLUMN_NAME: 'role_id', ORDINAL_POSITION: 1, REFERENCED_TABLE_SCHEMA: 'dbo', REFERENCED_TABLE_NAME: 'roles', REFERENCED_COLUMN_NAME: 'id' },
        ] })
        .mockResolvedValueOnce({ recordset: [
          { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'users', COLUMN_NAME: 'id', CONSTRAINT_TYPE: 'PRIMARY KEY' },
        ] }),
    };
    const pool = { request: vi.fn(() => request), close: vi.fn() };
    const tables = await database.introspectMSSQL(pool, 'dbo');
    expect(request.query).toHaveBeenCalledTimes(3);
    expect(request.input).toHaveBeenCalledTimes(3);
    expect(tables[0]).toMatchObject({
      id: 'users',
      columns: expect.arrayContaining([
        expect.objectContaining({ name: 'id', isPrimaryKey: true, isUnique: true }),
        expect.objectContaining({ name: 'name', nullable: true }),
      ]),
      foreignKeys: [expect.objectContaining({ columns: ['role_id'], referencedTableId: 'roles', referencedColumns: ['id'] })],
    });
  });

  it('maps driver errors to readable messages', () => {
    expect(database.readableDatabaseError(new Error('connect ECONNREFUSED 127.0.0.1:5432'), 'postgresql')).toContain('ECONNREFUSED');
    expect(database.readableDatabaseError(new Error('ETIMEDOUT'), 'mysql')).toContain('超时');
    expect(database.readableDatabaseError(new Error('password authentication failed'), 'postgresql')).toContain('认证失败');
    expect(database.readableDatabaseError(new Error('unable to open database file'), 'sqlite')).toContain('无法打开数据库文件');
    expect(database.readableDatabaseError(new Error('some other failure'), 'mysql')).toBe('some other failure');
  });

  it('validates SSL mode whitelist and mssql certificate options', () => {
    const mysqlProfile = { id: 'db', name: 'DB', kind: 'mysql', host: 'localhost', port: 3306, database: 'app', username: 'me' };
    expect(validateProfile({ ...mysqlProfile, sslMode: 'tls' }).sslMode).toBe('tls');
    expect(validateProfile({ ...mysqlProfile, sslMode: 'verify' }).sslMode).toBe('verify');
    expect(validateProfile(mysqlProfile).sslMode).toBeUndefined();
    expect(() => validateProfile({ ...mysqlProfile, sslMode: 'unsafe-mode' })).toThrow(/SSL/);

    const mssqlProfile = { id: 'db2', name: 'DB', kind: 'mssql', host: 'localhost', port: 1433, database: 'app', username: 'me' };
    expect(validateProfile(mssqlProfile)).toMatchObject({ encrypt: true, trustServerCertificate: true });
    expect(validateProfile({ ...mssqlProfile, trustServerCertificate: false })).toMatchObject({ trustServerCertificate: false });
    expect(validateProfile({ ...mssqlProfile, encrypt: false })).toMatchObject({ encrypt: false });
  });

  it('testConnection closes the connection after probing (no leaked entries)', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sqlviz-testconn-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'probe.sqlite');
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const writer = new BetterSqlite3(filePath);
    writer.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    writer.close();

    const before = database.connectionCount();
    const result = await database.testConnection({ id: 'probe-db', name: 'Probe', kind: 'sqlite', filePath, rememberPassword: false });
    expect(result).toEqual({ ok: true, message: '连接成功' });
    expect(database.connectionCount()).toBe(before);
  });

  it('never persists a plaintext password and decrypts only through safe storage', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sqlviz-profile-'));
    temporaryDirectories.push(directory);
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
      decryptString: (value: Buffer) => value.toString().replace('encrypted:', ''),
    };
    const store = createProfileStore(directory, safeStorage);
    const base = { id: 'profile', name: 'Local', kind: 'mysql', host: '127.0.0.1', port: 3306, database: 'app', username: 'me' };
    await store.saveProfile({ ...base, rememberPassword: false, password: 'do-not-save' });
    expect(await readFile(join(directory, 'database-profiles.json'), 'utf8')).not.toContain('do-not-save');
    await store.saveProfile({ ...base, rememberPassword: true, password: 'system-secret' });
    const saved = await readFile(join(directory, 'database-profiles.json'), 'utf8');
    expect(saved).not.toContain('system-secret');
    expect(await store.passwordFor('profile')).toBe('system-secret');
    expect(await store.listProfiles()).toEqual([expect.not.objectContaining({ password: expect.anything(), encryptedPassword: expect.anything() })]);
  });
});
