import { describe, expect, it } from 'vitest';
import { buildShareHash, createWorkspaceRecord, importWorkspaceFile, MAX_SHARE_HASH_LENGTH, migrateWorkspace, parseShareHash, serializeWorkspaceFile } from '@/services/workspace-files';

describe('workspace exchange', () => {
  it('round trips a local share hash', () => {
    const original = createWorkspaceRecord('Query', 'SELECT * FROM users', 'postgresql');
    original.viewMode = 'dataflow';
    const hash = buildShareHash(original);
    expect(hash.length).toBeLessThanOrEqual(MAX_SHARE_HASH_LENGTH);
    const restored = parseShareHash(hash);
    expect(restored).toMatchObject({ name: 'Query（分享）', sql: original.sql, dialect: 'postgresql', viewMode: 'dataflow' });
    expect(restored?.id).not.toBe(original.id);
  });

  it('rejects overlong share links and invalid workspace files', async () => {
    const workspace = createWorkspaceRecord('Large', Array.from({ length: 12000 }, (_, i) => `SELECT '${i}-${Math.random()}';`).join('\n'));
    expect(() => buildShareHash(workspace)).toThrow(/内容过长/);
    const invalid = new File(['{}'], 'broken.sqlviz', { type: 'application/json' });
    await expect(importWorkspaceFile(invalid, 'mysql')).rejects.toThrow(/版本/);
  });

  it('imports UTF-8 SQL as a fresh workspace', async () => {
    const workspace = await importWorkspaceFile(new File(['SELECT 1'], 'demo.sql'), 'sqlite');
    expect(workspace).toMatchObject({ name: 'demo', sql: 'SELECT 1', dialect: 'sqlite' });
  });

  it('restores v2 Schema snapshots and table selections from sqlviz', async () => {
    const workspace = createWorkspaceRecord('Schema', 'SELECT * FROM users');
    workspace.databaseProfileId = 'profile-1';
    workspace.erScope = 'database-schema';
    workspace.selectedTableIds = ['users'];
    workspace.autoSyncSchema = true;
    workspace.schemaSnapshot = { connectionId: 'profile-1', fetchedAt: 10, tables: [{ id: 'users', name: 'users', columns: [], foreignKeys: [] }] };
    const restored = await importWorkspaceFile(new File([serializeWorkspaceFile(workspace)], 'schema.sqlviz'), 'mysql');
    expect(restored).toMatchObject({ erScope: 'database-schema', selectedTableIds: ['users'], autoSyncSchema: true, schemaSnapshot: { connectionId: 'profile-1' } });
  });

  it('migrates v1 workspaces and keeps desktop state out of share links', () => {
    const migrated = migrateWorkspace({
      schemaVersion: 1, id: 'old', name: 'Old', sql: 'SELECT 1', dialect: 'mysql', viewMode: 'er',
      positions: { er: {}, dataflow: {} }, createdAt: 1, updatedAt: 1,
    });
    expect(migrated).toMatchObject({ schemaVersion: 2, erScope: 'current-sql', selectedTableIds: [], autoSyncSchema: false });
    const workspace = createWorkspaceRecord('Desktop', 'SELECT 1');
    workspace.databaseProfileId = 'private-profile';
    workspace.schemaSnapshot = { connectionId: 'private-profile', fetchedAt: 1, tables: [] };
    const hash = buildShareHash(workspace);
    expect(decodeURIComponent(hash)).not.toContain('private-profile');
    (workspace as any).password = 'top-secret';
    (workspace.schemaSnapshot as any).rememberedPassword = 'nested-secret';
    const file = serializeWorkspaceFile(workspace);
    expect(file).not.toContain('top-secret');
    expect(file).not.toContain('nested-secret');
    expect(file).not.toMatch(/password/i);
  });
});
