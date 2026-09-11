const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const crypto = require('crypto');

const SUPPORTED_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.webm', '.mov', '.avi', '.wmv', '.m4v',
  '.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg'
]);

let mainWindow;
const userDataPath = app.getPath('userData');
const dbFilePath = path.join(userDataPath, 'localvancedyt_db.json');
const thumbnailCacheDir = path.join(userDataPath, 'thumbnails');

if (!fs.existsSync(thumbnailCacheDir)) {
  fs.mkdirSync(thumbnailCacheDir, { recursive: true });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1A1B1E',
    autoHideMenuBar: true,
    title: 'LocalVancedYT',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false // Enables smooth direct streaming of local disk media files
    }
  });

  mainWindow.loadFile('index.html');
}

// IPC: Select Folder
ipcMain.handle('dialog:select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Media Directory for LocalVancedYT'
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// IPC: Recursive Media Scanner
async function scanDirectory(dir, rootDir) {
  let mediaList = [];
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip hidden folders and system directories
        if (!entry.name.startsWith('.') && entry.name !== '$RECYCLE.BIN') {
          const subList = await scanDirectory(fullPath, rootDir);
          mediaList = mediaList.concat(subList);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          try {
            const stats = await fs.promises.stat(fullPath);
            const relDir = path.relative(rootDir, path.dirname(fullPath));
            const folderName = relDir ? relDir.replace(/\\/g, ' / ') : path.basename(rootDir);
            const isAudio = ['.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg'].includes(ext);
            const fileId = crypto.createHash('md5').update(fullPath).digest('hex');
            
            mediaList.push({
              id: fileId,
              title: path.basename(entry.name, ext),
              fileName: entry.name,
              filePath: fullPath,
              fileUri: pathToFileURL(fullPath).href,
              folderPath: path.dirname(fullPath),
              folderName: folderName || 'Root',
              rootFolder: path.basename(rootDir),
              sizeBytes: stats.size,
              mtime: stats.mtimeMs,
              addedAt: Date.now(),
              ext: ext.replace('.', ''),
              type: isAudio ? 'audio' : 'video'
            });
          } catch (e) {
            console.error('Error stating file:', fullPath, e);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error scanning directory:', dir, err);
  }
  return mediaList;
}

ipcMain.handle('media:scan-folder', async (event, folderPath) => {
  if (!folderPath || !fs.existsSync(folderPath)) return [];
  return await scanDirectory(folderPath, folderPath);
});

// IPC: Storage (Load & Save database)
ipcMain.handle('storage:load-data', async () => {
  try {
    if (fs.existsSync(dbFilePath)) {
      const data = await fs.promises.readFile(dbFilePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load DB:', err);
  }
  return null;
});

ipcMain.handle('storage:save-data', async (event, data) => {
  try {
    await fs.promises.writeFile(dbFilePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to save DB:', err);
    return false;
  }
});

// IPC: Thumbnail Cache Save & Get
ipcMain.handle('thumbnail:save', async (event, { id, dataUrl }) => {
  try {
    if (!dataUrl) return false;
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const safeId = crypto.createHash('md5').update(id).digest('hex');
    const thumbPath = path.join(thumbnailCacheDir, `${safeId}.jpg`);
    await fs.promises.writeFile(thumbPath, buffer);
    return pathToFileURL(thumbPath).href;
  } catch (err) {
    console.error('Failed to save thumbnail:', err);
    return null;
  }
});

ipcMain.handle('thumbnail:get', async (event, id) => {
  const safeId = crypto.createHash('md5').update(id).digest('hex');
  const thumbPath = path.join(thumbnailCacheDir, `${safeId}.jpg`);
  if (fs.existsSync(thumbPath)) {
    return pathToFileURL(thumbPath).href;
  }
  return null;
});

ipcMain.handle('shell:show-item', async (event, filePath) => {
  if (fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
