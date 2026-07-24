const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');
const database = require('./database.cjs');
const { createProfileStore } = require('./profiles.cjs');
const { validateConnectionId, validateProfile } = require('./validation.cjs');
const CHANNELS = require('./channels.cjs');

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: '#ffffff',
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
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

module.exports = { CHANNELS, createWindow, registerDatabaseIPC };
