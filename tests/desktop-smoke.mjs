import { _electron as electron } from '@playwright/test';
import path from 'node:path';

const [executablePath, databasePath] = process.argv.slice(2).map(value => path.resolve(value));
if (!executablePath || !databasePath) throw new Error('用法：node tests/desktop-smoke.mjs <exe> <sqlite-file>');

const application = await electron.launch({ executablePath, args: ['--smoke-hidden'] });
try {
  const window = await application.firstWindow();
  await window.waitForSelector('[aria-label="SQL 编辑器"]');
  const result = await window.evaluate(async input => {
    if (!window.sqlVisualizerDesktop) throw new Error('preload API 不可用');
    const profile = { id: 'packaged-smoke', name: 'Packaged smoke', kind: 'sqlite', filePath: input, rememberPassword: false };
    const connection = await window.sqlVisualizerDesktop.testConnection(profile);
    const snapshot = await window.sqlVisualizerDesktop.introspectSchema(profile);
    await window.sqlVisualizerDesktop.disconnect(profile.id);
    return { connection, snapshot, nodeType: typeof window.require };
  }, databasePath);
  if (!result.connection.ok) throw new Error('打包应用未能连接 SQLite');
  const users = result.snapshot.tables.find(table => table.name === 'users');
  if (!users?.columns.some(column => column.name === 'id' && column.isPrimaryKey)) throw new Error('打包应用未正确读取 SQLite 主键');
  if (result.nodeType !== 'undefined') throw new Error('渲染进程意外暴露了 Node require');
  console.log(`desktop-smoke: ok (${result.snapshot.tables.length} tables, preload isolated)`);
} finally {
  await application.close();
}
