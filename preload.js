const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  scanFolder: (folderPath) => ipcRenderer.invoke('media:scan-folder', folderPath),
  loadLibrary: () => ipcRenderer.invoke('storage:load-data'),
  saveLibrary: (data) => ipcRenderer.invoke('storage:save-data', data),
  saveThumbnail: (id, dataUrl) => ipcRenderer.invoke('thumbnail:save', { id, dataUrl }),
  getThumbnail: (id) => ipcRenderer.invoke('thumbnail:get', id),
  openInFolder: (filePath) => ipcRenderer.invoke('shell:show-item', filePath),
  trashFile: (filePath) => ipcRenderer.invoke('media:trash-file', filePath),
  trashBatch: (filePaths) => ipcRenderer.invoke('media:trash-batch', filePaths),
  platform: process.platform
});
