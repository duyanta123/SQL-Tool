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
  it('only publishes the five documented IPC channels and validates inputs', () => {
    expect(channels).toEqual([
      'database.testConnection', 'database.introspectSchema', 'database.disconnect',
      'database.listProfiles', 'database.saveProfile',
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
      FOREIGN KEY (user_id) REFERENCES users(id));`);
    writer.close();

    const snapshot = await database.introspect({ id: 'sqlite-test', name: 'Test', kind: 'sqlite', filePath, rememberPassword: false });
    const users = snapshot.tables.find((table: any) => table.name === 'users');
    const orders = snapshot.tables.find((table: any) => table.name === 'orders');
    expect(users.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'id', isPrimaryKey: true }),
      expect.objectContaining({ name: 'email', isUnique: true, nullable: false }),
    ]));
    expect(orders.foreignKeys[0]).toMatchObject({ columns: ['user_id'], referencedTableId: 'users', referencedColumns: ['id'] });
    await database.disconnect('sqlite-test');

    const updater = new BetterSqlite3(filePath);
    updater.exec(`ALTER TABLE orders ADD COLUMN note TEXT;
      CREATE TABLE shipments (id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id));`);
    updater.close();
    const updated = await database.introspect({ id: 'sqlite-test', name: 'Test', kind: 'sqlite', filePath, rememberPassword: false });
    expect(updated.tables.find((table: any) => table.name === 'orders').columns.some((column: any) => column.name === 'note')).toBe(true);
    expect(updated.tables.find((table: any) => table.name === 'shipments').foreignKeys).toHaveLength(1);
    await database.disconnect('sqlite-test');

    const remover = new BetterSqlite3(filePath);
    remover.exec('DROP TABLE shipments; ALTER TABLE orders DROP COLUMN note;');
    remover.close();
    const removed = await database.introspect({ id: 'sqlite-test', name: 'Test', kind: 'sqlite', filePath, rememberPassword: false });
    expect(removed.tables.some((table: any) => table.name === 'shipments')).toBe(false);
    expect(removed.tables.find((table: any) => table.name === 'orders').columns.some((column: any) => column.name === 'note')).toBe(false);
    await database.disconnect('sqlite-test');
  });

  it('uses parameterized metadata queries for MySQL and PostgreSQL drivers', async () => {
    const mysql = { execute: vi.fn()
      .mockResolvedValueOnce([[{ TABLE_SCHEMA: 'app', TABLE_NAME: 'users', COLUMN_NAME: 'id', COLUMN_TYPE: 'int', IS_NULLABLE: 'NO', COLUMN_KEY: 'PRI', COLUMN_DEFAULT: null }]])
      .mockResolvedValueOnce([[]]) };
    const mysqlTables = await database.introspectMySQL(mysql, 'app');
    expect(mysql.execute).toHaveBeenCalledTimes(2);
    expect(mysql.execute.mock.calls.every((call: any[]) => call[1]?.[0] === 'app')).toBe(true);
    expect(mysqlTables[0]).toMatchObject({ id: 'users', columns: [expect.objectContaining({ isPrimaryKey: true })] });

    const postgres = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ table_schema: 'public', table_name: 'users', column_name: 'id', data_type: 'uuid', is_nullable: 'NO', is_primary: true, is_unique: true }] })
      .mockResolvedValueOnce({ rows: [] }) };
    const pgTables = await database.introspectPostgreSQL(postgres, 'public');
    expect(postgres.query).toHaveBeenCalledTimes(2);
    expect(postgres.query.mock.calls.every((call: any[]) => call[1]?.[0] === 'public')).toBe(true);
    expect(pgTables[0]).toMatchObject({ id: 'public.users', columns: [expect.objectContaining({ type: 'uuid' })] });
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
