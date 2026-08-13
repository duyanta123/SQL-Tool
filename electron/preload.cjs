const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sqlVisualizerDesktop', Object.freeze({
  testConnection: input => ipcRenderer.invoke('database.testConnection', input),
  introspectSchema: input => ipcRenderer.invoke('database.introspectSchema', input),
  disconnect: connectionId => ipcRenderer.invoke('database.disconnect', connectionId),
  listProfiles: () => ipcRenderer.invoke('database.listProfiles'),
  saveProfile: input => ipcRenderer.invoke('database.saveProfile', input),
  checkForUpdates: () => ipcRenderer.invoke('update.check'),
  downloadUpdate: () => ipcRenderer.invoke('update.download'),
  installUpdate: () => ipcRenderer.invoke('update.install'),
  onUpdateEvent: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update:event', listener);
    return () => ipcRenderer.removeListener('update:event', listener);
  },
}));
