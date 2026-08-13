const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, safeStorage, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const database = require('./database.cjs');
const { createProfileStore } = require('./profiles.cjs');
const { validateConnectionId, validateProfile } = require('./validation.cjs');
const CHANNELS = require('./channels.cjs');

function registerUpdateIPC() {
  const portable = !!process.env.PORTABLE_EXECUTABLE_DIR;
  const send = (type, payload) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('update:event', { type, ...payload });
    }
  };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', info => send('available', { version: info.version }));
  autoUpdater.on('update-not-available', info => send('not-available', { version: info.version }));
  autoUpdater.on('download-progress', progress => send('progress', { percent: Math.round(progress.percent ?? 0) }));
  autoUpdater.on('update-downloaded', info => send('downloaded', { version: info.version }));
  autoUpdater.on('error', error => send('error', { message: error?.message ?? String(error) }));

  ipcMain.handle('update.check', async () => {
    if (!app.isPackaged) return { available: false, dev: true };
    if (portable) return { available: false, portable: true };
    const result = await autoUpdater.checkForUpdates();
    if (!result) return { available: false, version: app.getVersion() };
    return { available: true, version: result.updateInfo.version };
  });
  ipcMain.handle('update.download', async () => {
    if (!app.isPackaged) return { ok: false, message: '开发模式不支持自动更新' };
    if (portable) return { ok: false, message: '便携版不支持自动更新' };
    await autoUpdater.downloadUpdate();
    return { ok: true };
  });
  ipcMain.handle('update.install', () => {
    autoUpdater.quitAndInstall();
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#17181c' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.once('ready-to-show', () => { if (!process.argv.includes('--smoke-hidden')) window.show(); });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', event => event.preventDefault());
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  if (developmentUrl) void window.loadURL(developmentUrl);
  else void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function registerDatabaseIPC() {
  const profileStore = createProfileStore(app.getPath('userData'), safeStorage);
  ipcMain.handle('database.listProfiles', async () => profileStore.listProfiles());
  ipcMain.handle('database.saveProfile', async (_event, raw) => {
    const profile = validateProfile(raw);
    return profileStore.saveProfile(profile);
  });
  ipcMain.handle('database.disconnect', async (_event, rawId) => {
    await database.disconnect(validateConnectionId(rawId));
  });
  ipcMain.handle('database.testConnection', async (_event, raw) => {
    const wrapped = raw?.profile && typeof raw.profile === 'object';
    let input = wrapped ? raw.profile : raw;
    if (wrapped && raw.chooseFile === true) {
      const result = await dialog.showOpenDialog({
        title: '选择 SQLite 数据库',
        properties: ['openFile'],
        filters: [{ name: 'SQLite 数据库', extensions: ['sqlite', 'sqlite3', 'db', 'db3'] }, { name: '所有文件', extensions: ['*'] }],
      });
      if (result.canceled || !result.filePaths[0]) throw new Error('已取消选择 SQLite 文件');
      input = { ...input, filePath: result.filePaths[0] };
      if (raw.selectOnly === true) return { ok: true, message: '已选择数据库文件', filePath: result.filePaths[0] };
    }
    const profile = validateProfile(input);
    const password = profile.password || await profileStore.passwordFor(profile.id);
    return database.testConnection(profile, password);
  });
  ipcMain.handle('database.introspectSchema', async (_event, raw) => {
    const profile = validateProfile(raw);
    const password = profile.password || await profileStore.passwordFor(profile.id);
    return database.introspect(profile, password);
  });
}

app.whenReady().then(() => {
  registerDatabaseIPC();
  registerUpdateIPC();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  // 跟随系统主题更新窗口底色，避免暗色下切换时白闪
  nativeTheme.on('updated', () => {
    const color = nativeTheme.shouldUseDarkColors ? '#17181c' : '#ffffff';
    for (const window of BrowserWindow.getAllWindows()) window.setBackgroundColor(color);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

module.exports = { CHANNELS, createWindow, registerDatabaseIPC };
