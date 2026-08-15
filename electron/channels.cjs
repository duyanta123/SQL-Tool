/**
 * 经 ipcMain.handle 注册的 invoke 通道清单（tests/electron-database.test.ts 做静态一致性断言）。
 * 另有单向事件通道 update:event（main → renderer，更新进度/状态广播），不走 invoke，不在此列。
 */
module.exports = Object.freeze([
  'database.testConnection',
  'database.introspectSchema',
  'database.disconnect',
  'database.listProfiles',
  'database.saveProfile',
  'update.check',
  'update.download',
  'update.install',
]);
