const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('seeEnglish', {
  getCloseBehavior: () => ipcRenderer.invoke('settings:get-close-behavior'),
  setCloseBehavior: (value) => ipcRenderer.invoke('settings:set-close-behavior', value),
});
