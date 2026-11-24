const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  refreshDict: () => ipcRenderer.invoke('dict:refresh'),
  close: () => ipcRenderer.invoke('window:close'),
});
