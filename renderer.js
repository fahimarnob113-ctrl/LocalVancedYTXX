// LocalVancedYT State Engine
const state = {
  media: [],
  folders: [],
  activeFilter: 'all',
  activeSort: 'date-desc',
  activeChannel: null,
  activeNav: 'home',
  searchQuery: '',
  currentMedia: null,
  history: {},
  favorites: new Set(),
  playlists: {},
  notes: {},
  theme: 'dark',
  debugLogs: [],
  browserFiles: new Map()
};

// Logging & Debug HUD System
function logMessage(level, message, details = null) {
  const time = new Date().toLocaleTimeString();
  const entry = { time, level, message, details };
  state.debugLogs.push(entry);

  const logsContainer = document.getElementById('debugLogs');
  if (logsContainer) {
    const row = document.createElement('div');
    row.className = 'log-entry';
    row.innerHTML = `
      <span class="log-time">[${time}]</span>
      <span class="log-level ${level}">[${level}]</span>
      <span class="log-msg">${message}</span>
    `;
    logsContainer.appendChild(row);
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }
  if (level === 'ERROR') {
    console.error(`[LocalVancedYT ${level}]`, message, details);
  } else {
    console.log(`[LocalVancedYT ${level}]`, message, details);
  }
}

// Toast Notifications System
function showToast(message, type = 'info', durationMs = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '✅';
  toast.innerHTML = `
    <span>${icon}</span>
    <span style="flex:1;">${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}

// Format utilities
function formatDuration(sec) {
  if (!sec || isNaN(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  if (h > 0) {
    const remM = m % 60;
    return `${h}:${remM.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Client-side Video Duration & Thumbnail Generator
const thumbQueue = [];
let isProcessingThumbs = false;

async function processThumbQueue() {
  if (isProcessingThumbs || thumbQueue.length === 0) return;
  isProcessingThumbs = true;

  const item = thumbQueue.shift();
  try {
    const cached = await window.api.getThumbnail(item.id);
    if (cached) {
      item.thumbnailUrl = cached;
      updateCardThumbnail(item.id, cached);
    } else {
      const generated = await generateVideoThumbnail(item);
      if (generated && generated.thumb) {
        const savedUrl = await window.api.saveThumbnail(item.id, generated.thumb);
        item.thumbnailUrl = savedUrl || generated.thumb;
        if (generated.duration) {
          item.durationSec = generated.duration;
          updateCardDuration(item.id, generated.duration);
        }
        updateCardThumbnail(item.id, item.thumbnailUrl);
        saveStateToDisk();
      }
    }
  } catch (err) {
    console.warn('Thumb generation error:', err);
  }

  isProcessingThumbs = false;
  setTimeout(processThumbQueue, 40);
}

function generateVideoThumbnail(item) {
  return new Promise((resolve) => {
    if (item.type === 'audio') {
      return resolve({ thumb: null, duration: 0 });
    }
    const video = document.createElement('video');
    video.src = item.fileUri;
    video.preload = 'metadata';
    video.muted = true;

    const timeout = setTimeout(() => {
      video.remove();
      resolve(null);
    }, 4000);

    video.onloadedmetadata = () => {
      item.durationSec = video.duration;
      video.currentTime = Math.min(Math.max(video.duration * 0.15, 1), 30);
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 360;
        canvas.height = 202;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const thumb = canvas.toDataURL('image/jpeg', 0.75);
        video.remove();
        resolve({ thumb, duration: video.duration });
      } catch (e) {
        video.remove();
        resolve(null);
      }
    };

    video.onerror = () => {
      clearTimeout(timeout);
      video.remove();
      resolve(null);
    };
  });
}

function updateCardThumbnail(id, url) {
  const img = document.querySelector(`.card-thumb-${id}`);
  if (img && url) {
    img.src = url;
    img.style.display = 'block';
  }
}

function updateCardDuration(id, duration) {
  const pill = document.querySelector(`.card-dur-${id}`);
  if (pill && duration) {
    pill.textContent = formatDuration(duration);
  }
}

// IndexedDB Storage for Browser Mode (Persists File objects across reloads)
const idbPromise = new Promise((resolve) => {
  const req = indexedDB.open('LocalVancedYT_FilesDB', 1);
  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains('files')) {
      db.createObjectStore('files');
    }
  };
  req.onsuccess = (e) => resolve(e.target.result);
  req.onerror = () => resolve(null);
});

async function saveFileToIDB(id, file) {
  try {
    const db = await idbPromise;
    if (!db) return;
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(file, id);
  } catch (e) {
    console.warn('IDB saveFile error:', e);
  }
}

async function getFileFromIDB(id) {
  try {
    const db = await idbPromise;
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

// Disk & Browser Persistence (Dual-Engine)
async function loadStateFromDisk() {
  try {
    let data = null;
    if (window.api && window.api.loadLibrary) {
      data = await window.api.loadLibrary();
    } else {
      const stored = localStorage.getItem('localvancedyt_db');
      if (stored) data = JSON.parse(stored);
    }
    if (data) {
      state.media = data.media || [];
      state.folders = data.folders || [];
      state.history = data.history || {};
      state.favorites = new Set(data.favorites || []);
      state.playlists = data.playlists || {};
      state.notes = data.notes || {};
      state.theme = data.theme || 'dark';
      document.documentElement.setAttribute('data-theme', state.theme);

      // Re-hydrate browser blob URLs from IndexedDB
      if (!window.api && state.media.length > 0) {
        for (const m of state.media) {
          const file = await getFileFromIDB(m.id);
          if (file) {
            state.browserFiles.set(m.id, file);
            m.fileUri = URL.createObjectURL(file);
          }
        }
      }
    }
    renderAll();
    queueThumbnails();
  } catch (err) {
    logMessage('ERROR', `Failed loading library: ${err.message}`);
  }
}

async function saveStateToDisk() {
  const payload = {
    media: state.media,
    folders: state.folders,
    history: state.history,
    favorites: Array.from(state.favorites),
    playlists: state.playlists,
    notes: state.notes,
    theme: state.theme
  };
  try {
    if (window.api && window.api.saveLibrary) {
      await window.api.saveLibrary(payload);
    } else {
      localStorage.setItem('localvancedyt_db', JSON.stringify(payload));
    }
  } catch (err) {
    logMessage('WARN', `Save state warning: ${err.message}`);
  }
}

function queueThumbnails() {
  state.media.forEach(item => {
    if (!item.thumbnailUrl && item.type === 'video') {
      thumbQueue.push(item);
    }
  });
  processThumbQueue();
}

// Folder Scanning Flow (Electron Native + Web Browser Fallback)
async function handleAddFolder() {
  try {
    // Mode A: Running inside Electron
    if (window.api && window.api.selectFolder) {
      logMessage('INFO', 'Opening desktop folder selection dialog...');
      const folderPath = await window.api.selectFolder();
      if (!folderPath) {
        logMessage('INFO', 'Folder selection cancelled by user.');
        return;
      }

      logMessage('INFO', `Scanning folder: ${folderPath}`);
      showToast(`Scanning folder: ${folderPath.split(/[\\/]/).pop()}...`, 'info', 2500);

      const foundMedia = await window.api.scanFolder(folderPath);
      if (!foundMedia || foundMedia.length === 0) {
        logMessage('WARN', `No supported media found in: ${folderPath}`);
        showToast('No video or audio files found in selected folder.', 'warn');
        return;
      }

      if (!state.folders.includes(folderPath)) {
        state.folders.push(folderPath);
      }

      const existingIds = new Set(state.media.map(m => m.id));
      let addedCount = 0;
      foundMedia.forEach(m => {
        if (!existingIds.has(m.id)) {
          state.media.push(m);
          addedCount++;
        }
      });

      logMessage('SUCCESS', `Scan complete. Found ${foundMedia.length} files (${addedCount} newly indexed).`);
      showToast(`Indexed ${addedCount} new files successfully!`, 'success');

      await saveStateToDisk();
      renderAll();
      queueThumbnails();
      return;
    }

    // Mode B: Running inside standard Web Browser (Chrome/Edge/Firefox)
    logMessage('INFO', 'Browser mode detected: opening folder picker...');
    const folderInput = document.getElementById('browserFolderInput');
    if (folderInput) {
      folderInput.value = '';
      folderInput.click();
    }
  } catch (err) {
    logMessage('ERROR', `Failed scanning folder: ${err.message}`, err);
    showToast('An error occurred while scanning folder. Check debug console.', 'error');
  }
}

// Browser File Input Change Handler
document.getElementById('browserFolderInput')?.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  logMessage('INFO', `Processing ${files.length} selected files from browser...`);
  showToast(`Indexing ${files.length} files...`, 'info', 2500);

  const supportedExts = new Set(['mp4', 'mkv', 'webm', 'mov', 'avi', 'mp3', 'wav', 'm4a', 'flac', 'ogg']);
  let addedCount = 0;

  files.forEach(file => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (supportedExts.has(ext)) {
      const parentDir = file.webkitRelativePath ? file.webkitRelativePath.split('/')[0] : 'Browser Uploads';
      const isAudio = ['mp3', 'wav', 'm4a', 'flac', 'ogg'].includes(ext);
      const fileId = 'b_' + file.name + '_' + file.size;

      if (!state.media.some(m => m.id === fileId)) {
        state.browserFiles.set(fileId, file);
        saveFileToIDB(fileId, file);
        state.media.push({
          id: fileId,
          title: file.name.replace(/\.[^/.]+$/, ''),
          fileName: file.name,
          filePath: file.webkitRelativePath || file.name,
          fileUri: URL.createObjectURL(file),
          folderPath: parentDir,
          folderName: parentDir,
          sizeBytes: file.size,
          mtime: file.lastModified || Date.now(),
          addedAt: Date.now(),
          ext: ext,
          type: isAudio ? 'audio' : 'video'
        });
        addedCount++;
      } else {
        // Update live file handle in memory if already exists
        state.browserFiles.set(fileId, file);
        saveFileToIDB(fileId, file);
      }
    }
  });

  logMessage('SUCCESS', `Indexed ${addedCount} media files from browser.`);
  showToast(`Indexed ${addedCount} media files!`, 'success');
  saveStateToDisk();
  renderAll();
  queueThumbnails();
});

// Browser Individual Files Input Handler
document.getElementById('browserFilesInput')?.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  const supportedExts = new Set(['mp4', 'mkv', 'webm', 'mov', 'avi', 'mp3', 'wav', 'm4a', 'flac', 'ogg']);
  let addedCount = 0;

  files.forEach(file => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (supportedExts.has(ext)) {
      const parentDir = 'Files';
      const isAudio = ['mp3', 'wav', 'm4a', 'flac', 'ogg'].includes(ext);
      const fileId = 'b_' + file.name + '_' + file.size;

      state.browserFiles.set(fileId, file);
      saveFileToIDB(fileId, file);

      if (!state.media.some(m => m.id === fileId)) {
        state.media.push({
          id: fileId,
          title: file.name.replace(/\.[^/.]+$/, ''),
          fileName: file.name,
          filePath: file.name,
          fileUri: URL.createObjectURL(file),
          folderPath: parentDir,
          folderName: parentDir,
          sizeBytes: file.size,
          mtime: file.lastModified || Date.now(),
          addedAt: Date.now(),
          ext: ext,
          type: isAudio ? 'audio' : 'video'
        });
        addedCount++;
      }
    }
  });

  logMessage('SUCCESS', `Loaded ${addedCount} individual files.`);
  showToast(`Loaded ${addedCount} files!`, 'success');
  saveStateToDisk();
  renderAll();
  queueThumbnails();
});

// Reset / Clear Library
document.getElementById('btnClearLibrary')?.addEventListener('click', () => {
  if (confirm('Clear library index and reset state? (Your actual files on disk will NOT be touched).')) {
    state.media = [];
    state.folders = [];
    state.history = {};
    state.favorites.clear();
    state.playlists = {};
    state.notes = {};
    state.browserFiles.clear();
    localStorage.removeItem('localvancedyt_db');
    indexedDB.deleteDatabase('LocalVancedYT_FilesDB');
    if (window.api && window.api.saveLibrary) {
      window.api.saveLibrary({ media: [], folders: [], history: {}, favorites: [], playlists: {}, notes: {} });
    }
    showToast('Library reset.', 'info');
    logMessage('INFO', 'Library reset completed.');
    renderAll();
  }
});

document.getElementById('btnAddFiles')?.addEventListener('click', () => {
  document.getElementById('browserFilesInput')?.click();
});

// Filtering & Sorting Logic
function getFilteredAndSortedMedia() {
  let list = [...state.media];

  // Search filter
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(m => m.title.toLowerCase().includes(q) || m.folderName.toLowerCase().includes(q));
  }

  // Channel filter
  if (state.activeChannel) {
    list = list.filter(m => m.folderName === state.activeChannel);
  }

  // Navigation Filter
  if (state.activeNav === 'videos') {
    list = list.filter(m => m.type === 'video');
  } else if (state.activeNav === 'audio') {
    list = list.filter(m => m.type === 'audio');
  } else if (state.activeNav === 'favorites') {
    list = list.filter(m => state.favorites.has(m.id));
  } else if (state.activeNav === 'history') {
    list = list.filter(m => !!state.history[m.id]);
    list.sort((a, b) => (state.history[b.id]?.watchedAt || 0) - (state.history[a.id]?.watchedAt || 0));
    return list;
  }

  // Filter chips
  if (state.activeFilter === 'video') list = list.filter(m => m.type === 'video');
  if (state.activeFilter === 'audio') list = list.filter(m => m.type === 'audio');
  if (state.activeFilter === 'resume') list = list.filter(m => (state.history[m.id]?.positionSec || 0) > 3);
  if (state.activeFilter === 'unwatched') list = list.filter(m => !state.history[m.id]);
  if (state.activeFilter === 'short') list = list.filter(m => m.durationSec && m.durationSec < 300);
  if (state.activeFilter === 'medium') list = list.filter(m => m.durationSec && m.durationSec >= 300 && m.durationSec <= 1200);
  if (state.activeFilter === 'long') list = list.filter(m => m.durationSec && m.durationSec > 1200);

  // Sorting
  list.sort((a, b) => {
    switch (state.activeSort) {
      case 'date-asc': return a.mtime - b.mtime;
      case 'title-asc': return a.title.localeCompare(b.title);
      case 'title-desc': return b.title.localeCompare(a.title);
      case 'duration-desc': return (b.durationSec || 0) - (a.durationSec || 0);
      case 'duration-asc': return (a.durationSec || 0) - (b.durationSec || 0);
      case 'size-desc': return b.sizeBytes - a.sizeBytes;
      case 'date-desc':
      default: return b.mtime - a.mtime;
    }
  });

  return list;
}

// Rendering UI
function renderAll() {
  renderSidebarChannels();
  renderFeed();
}

function renderSidebarChannels() {
  const container = document.getElementById('sidebarChannelsList');
  const channels = Array.from(new Set(state.media.map(m => m.folderName))).sort();
  container.innerHTML = '';

  channels.forEach(ch => {
    const item = document.createElement('div');
    item.className = `nav-item ${state.activeChannel === ch ? 'active' : ''}`;
    item.style.padding = '8px 14px';
    item.style.fontSize = '12.5px';
    item.innerHTML = `📁 <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${ch}</span>`;
    item.onclick = () => {
      state.activeChannel = (state.activeChannel === ch) ? null : ch;
      renderAll();
    };
    container.appendChild(item);
  });
}

function renderFeed() {
  const container = document.getElementById('feedContent');
  container.innerHTML = '';

  if (state.media.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📁</div>
        <h2 style="font-size:20px; font-weight:700;">No local media scanned yet</h2>
        <p style="color:var(--on-surface-muted); max-width:440px; font-size:14px;">
          Click "Add Folder" to index your videos, lectures, movies, or music collections. Everything remains 100% offline.
        </p>
        <button class="btn btn-accent" id="btnEmptyAddFolder" style="margin-top:8px;">📁 Add Media Folder</button>
      </div>
    `;
    document.getElementById('btnEmptyAddFolder')?.addEventListener('click', handleAddFolder);
    return;
  }

  // Special view: Playlists
  if (state.activeNav === 'playlists') {
    renderPlaylistsView(container);
    return;
  }

  // Special view: Folders / Channels Hub
  if (state.activeNav === 'folders') {
    renderFoldersHubView(container);
    return;
  }

  // Special view: Settings
  if (state.activeNav === 'settings') {
    renderSettingsView(container);
    return;
  }

  const filteredMedia = getFilteredAndSortedMedia();

  // Continue Watching Shelf (only on home tab)
  if (state.activeNav === 'home' && !state.searchQuery && !state.activeChannel) {
    const resumeItems = state.media.filter(m => {
      const hist = state.history[m.id];
      return hist && hist.positionSec > 5 && (!m.durationSec || hist.positionSec < m.durationSec * 0.95);
    });

    if (resumeItems.length > 0) {
      const shelf = document.createElement('div');
      shelf.innerHTML = `
        <div class="shelf-title">
          <span>Continue Watching</span>
          <span style="font-size:12px; color:var(--accent);">${resumeItems.length} items</span>
        </div>
        <div class="shelf-scroll" id="shelfResume"></div>
      `;
      const scrollEl = shelf.querySelector('#shelfResume');
      resumeItems.forEach(item => {
        scrollEl.appendChild(createVideoCard(item, true));
      });
      container.appendChild(shelf);
    }
  }

  // Main Feed Grid
  const gridSection = document.createElement('div');
  const countLabel = state.activeChannel ? `Channel: ${state.activeChannel}` : 'All Media';
  gridSection.innerHTML = `
    <div class="shelf-title">
      <span>${countLabel}</span>
      <span style="font-size:12px; color:var(--on-surface-muted);">${filteredMedia.length} results</span>
    </div>
    <div class="media-grid" id="mainMediaGrid"></div>
  `;
  const gridEl = gridSection.querySelector('#mainMediaGrid');

  if (filteredMedia.length === 0) {
    gridEl.innerHTML = `<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--on-surface-muted);">No files match your filter/search criteria.</div>`;
  } else {
    filteredMedia.forEach(item => {
      gridEl.appendChild(createVideoCard(item, false));
    });
  }

  container.appendChild(gridSection);
}

function renderPlaylistsView(container) {
  const playlistNames = Object.keys(state.playlists);
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.gap = '20px';

  wrapper.innerHTML = `
    <div class="shelf-title">
      <span>📋 Your Playlists (${playlistNames.length})</span>
      <button class="btn btn-accent" id="btnCreateNewPlaylist" style="font-size:12px; padding:4px 12px;">+ Create Playlist</button>
    </div>
    <div id="playlistsListContainer" style="display:flex; flex-direction:column; gap:24px;"></div>
  `;

  container.appendChild(wrapper);

  document.getElementById('btnCreateNewPlaylist').onclick = () => {
    const name = prompt('Enter playlist name:');
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    if (state.playlists[cleanName]) {
      alert('A playlist with this name already exists!');
      return;
    }
    state.playlists[cleanName] = [];
    saveStateToDisk();
    renderFeed();
  };

  const listEl = wrapper.querySelector('#playlistsListContainer');
  if (playlistNames.length === 0) {
    listEl.innerHTML = `
      <div style="padding:40px; text-align:center; color:var(--on-surface-muted);">
        No playlists created yet. Click "+ Create Playlist" or click "➕ Add to Playlist" while watching any video!
      </div>
    `;
    return;
  }

  playlistNames.forEach(name => {
    const itemIds = state.playlists[name] || [];
    const items = itemIds.map(id => state.media.find(m => m.id === id)).filter(Boolean);

    const section = document.createElement('div');
    section.style.background = 'var(--surface-elevated)';
    section.style.border = '1px solid var(--divider)';
    section.style.borderRadius = '10px';
    section.style.padding = '16px';

    section.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <div>
          <h3 style="font-size:16px; font-weight:700;">${name}</h3>
          <span style="font-size:12px; color:var(--on-surface-muted);">${items.length} videos</span>
        </div>
        <button class="btn" style="color:var(--danger); font-size:11px; padding:3px 8px;" onclick="deletePlaylist('${name}')">Delete Playlist</button>
      </div>
      <div class="shelf-scroll" id="pl-scroll-${name.replace(/\s+/g, '-')}"></div>
    `;

    const scrollEl = section.querySelector(`#pl-scroll-${name.replace(/\s+/g, '-')}`);
    if (items.length === 0) {
      scrollEl.innerHTML = `<span style="font-size:12px; color:var(--on-surface-muted);">Playlist is empty. Add videos while watching.</span>`;
    } else {
      items.forEach(it => {
        scrollEl.appendChild(createVideoCard(it, true));
      });
    }

    listEl.appendChild(section);
  });
}

window.deletePlaylist = function(name) {
  if (confirm(`Are you sure you want to delete playlist "${name}"?`)) {
    delete state.playlists[name];
    saveStateToDisk();
    renderFeed();
  }
};

// Folders / Channels Hub View
function renderFoldersHubView(container) {
  const foldersMap = new Map();
  state.media.forEach(m => {
    const key = m.folderName || 'Unsorted';
    if (!foldersMap.has(key)) {
      foldersMap.set(key, { name: key, count: 0, totalSize: 0, items: [] });
    }
    const grp = foldersMap.get(key);
    grp.count++;
    grp.totalSize += (m.sizeBytes || 0);
    grp.items.push(m);
  });

  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.gap = '20px';

  wrapper.innerHTML = `
    <div class="shelf-title">
      <span>📁 Your Channels & Media Directories (${foldersMap.size})</span>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px;" id="foldersGrid"></div>
  `;

  container.appendChild(wrapper);
  const gridEl = wrapper.querySelector('#foldersGrid');

  foldersMap.forEach((grp, channelName) => {
    const card = document.createElement('div');
    card.style.background = 'var(--surface-elevated)';
    card.style.border = '1px solid var(--divider)';
    card.style.borderRadius = '12px';
    card.style.padding = '18px';
    card.style.display = 'flex';
    card.style.alignItems = 'center';
    card.style.gap = '14px';
    card.style.cursor = 'pointer';
    card.style.transition = 'transform 0.15s, border-color 0.15s';

    card.onmouseenter = () => { card.style.borderColor = 'var(--accent)'; card.style.transform = 'translateY(-2px)'; };
    card.onmouseleave = () => { card.style.borderColor = 'var(--divider)'; card.style.transform = 'translateY(0)'; };

    const initial = channelName[0].toUpperCase();
    card.innerHTML = `
      <div style="width:48px; height:48px; border-radius:50%; background:var(--surface-active); color:var(--accent); display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:700; flex-shrink:0;">
        ${initial}
      </div>
      <div style="flex:1; overflow:hidden;">
        <div style="font-size:15px; font-weight:700; color:var(--on-surface); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${channelName}</div>
        <div style="font-size:12px; color:var(--on-surface-muted); margin-top:2px;">${grp.count} files • ${formatBytes(grp.totalSize)}</div>
      </div>
      <span style="color:var(--accent); font-size:14px;">▶</span>
    `;

    card.onclick = () => {
      state.activeChannel = channelName;
      state.activeNav = 'home';
      document.querySelectorAll('.sidebar .nav-item').forEach(n => n.classList.remove('active'));
      document.querySelector('.sidebar .nav-item[data-view="home"]')?.classList.add('active');
      renderAll();
    };

    gridEl.appendChild(card);
  });
}

// Settings & Preferences Hub View
function renderSettingsView(container) {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.gap = '20px';
  wrapper.style.maxWidth = '800px';

  wrapper.innerHTML = `
    <div class="shelf-title">
      <span>⚙️ Settings & Data Portability</span>
    </div>

    <!-- Theme Settings Card -->
    <div style="background:var(--surface-elevated); border:1px solid var(--divider); border-radius:10px; padding:20px; display:flex; flex-direction:column; gap:12px;">
      <h3 style="font-size:15px; font-weight:700;">Appearance & Theme</h3>
      <p style="font-size:12.5px; color:var(--on-surface-muted);">Choose your visual palette for LocalVancedYT.</p>
      <div style="display:flex; gap:10px; margin-top:6px;">
        <button class="btn ${state.theme === 'dark' ? 'btn-accent' : ''}" onclick="switchTheme('dark')">🌙 YouTube Dark</button>
        <button class="btn ${state.theme === 'light' ? 'btn-accent' : ''}" onclick="switchTheme('light')">☀️ Clean Light</button>
        <button class="btn ${state.theme === 'cyber' ? 'btn-accent' : ''}" onclick="switchTheme('cyber')">⚡ Cyber Minimal</button>
        <button class="btn ${state.theme === 'amoled' ? 'btn-accent' : ''}" onclick="switchTheme('amoled')">🖤 AMOLED Pure</button>
      </div>
    </div>

    <!-- Data Portability Card -->
    <div style="background:var(--surface-elevated); border:1px solid var(--divider); border-radius:10px; padding:20px; display:flex; flex-direction:column; gap:12px;">
      <h3 style="font-size:15px; font-weight:700;">Backup & Restore</h3>
      <p style="font-size:12.5px; color:var(--on-surface-muted);">Export your playlists, watch history, bookmarks, and favorite videos into a single portable backup file.</p>
      <div style="display:flex; gap:10px; margin-top:6px;">
        <button class="btn btn-accent" id="btnSettingsBackup">💾 Export Backup (.json)</button>
        <button class="btn" id="btnSettingsRestore">📥 Restore Backup (.json)</button>
      </div>
    </div>

    <!-- Library Statistics Card -->
    <div style="background:var(--surface-elevated); border:1px solid var(--divider); border-radius:10px; padding:20px; display:flex; flex-direction:column; gap:12px;">
      <h3 style="font-size:15px; font-weight:700;">Library Diagnostics</h3>
      <div style="font-size:13px; color:var(--on-surface-muted); display:flex; flex-direction:column; gap:6px;">
        <div>Total Indexed Files: <strong style="color:var(--on-surface);">${state.media.length}</strong></div>
        <div>Total Channels / Folders: <strong style="color:var(--on-surface);">${new Set(state.media.map(m=>m.folderName)).size}</strong></div>
        <div>Favorites Starred: <strong style="color:var(--on-surface);">${state.favorites.size}</strong></div>
        <div>Custom Playlists: <strong style="color:var(--on-surface);">${Object.keys(state.playlists).length}</strong></div>
      </div>
    </div>
  `;

  container.appendChild(wrapper);

  wrapper.querySelector('#btnSettingsBackup').onclick = exportBackup;
  wrapper.querySelector('#btnSettingsRestore').onclick = () => document.getElementById('restoreFileInput')?.click();
}

window.switchTheme = function(themeName) {
  state.theme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);
  saveStateToDisk();
  renderFeed();
  showToast(`Theme switched to ${themeName.toUpperCase()}`, 'info', 1500);
};

// JSON Export & Import Engine
function exportBackup() {
  const backupData = {
    app: 'LocalVancedYT',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    media: state.media,
    folders: state.folders,
    history: state.history,
    favorites: Array.from(state.favorites),
    playlists: state.playlists,
    notes: state.notes,
    theme: state.theme
  };

  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `LocalVancedYT_Backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup exported successfully!', 'success');
  logMessage('SUCCESS', 'Exported library backup JSON file.');
}

function importRestore(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.media) state.media = data.media;
      if (data.folders) state.folders = data.folders;
      if (data.history) state.history = data.history;
      if (data.favorites) state.favorites = new Set(data.favorites);
      if (data.playlists) state.playlists = data.playlists;
      if (data.notes) state.notes = data.notes;
      if (data.theme) {
        state.theme = data.theme;
        document.documentElement.setAttribute('data-theme', state.theme);
      }
      saveStateToDisk();
      renderAll();
      showToast('Library restored successfully!', 'success');
      logMessage('SUCCESS', `Restored ${state.media.length} items from backup JSON.`);
    } catch (err) {
      showToast('Invalid backup JSON file.', 'error');
      logMessage('ERROR', `Backup restore failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

function createVideoCard(item, isShelf) {
  const card = document.createElement('div');
  card.className = 'video-card';
  if (isShelf) card.style.width = '240px';

  const hist = state.history[item.id];
  let progressPct = 0;
  if (hist && item.durationSec) {
    progressPct = Math.min(100, Math.max(0, (hist.positionSec / item.durationSec) * 100));
  }

  const thumbSrc = item.thumbnailUrl || '';
  const initial = (item.folderName || 'C')[0].toUpperCase();

  card.innerHTML = `
    <div class="thumbnail-wrap">
      <img class="thumbnail-img card-thumb-${item.id}" src="${thumbSrc}" style="${thumbSrc ? '' : 'display:none;'}" alt="">
      <div style="${thumbSrc ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center; background:#1e2024; color:var(--on-surface-muted); font-size:24px;">
        ${item.type === 'audio' ? '🎵' : '🎬'}
      </div>
      <span class="duration-pill card-dur-${item.id}">${formatDuration(item.durationSec)}</span>
      ${progressPct > 0 ? `<div class="resume-bar" style="width:${progressPct}%"></div>` : ''}
    </div>
    <div class="card-info">
      <div class="card-avatar">${initial}</div>
      <div class="card-details">
        <div class="card-title" title="${item.title}">${item.title}</div>
        <div class="card-meta">
          <span>${item.folderName}</span> • <span>${formatBytes(item.sizeBytes)}</span>
        </div>
      </div>
    </div>
  `;

  card.onclick = () => openWatchPage(item);
  return card;
}

// Watch Overlay & Playback Engine
const videoPlayer = document.getElementById('mainVideoPlayer');
const watchOverlay = document.getElementById('watchOverlay');
const miniPlayer = document.getElementById('miniPlayerDock');
let saveInterval = null;

async function openWatchPage(item) {
  state.currentMedia = item;
  miniPlayer.classList.remove('active');
  watchOverlay.classList.add('active');

  document.getElementById('watchTitle').textContent = item.title;
  document.getElementById('watchMeta').textContent = `${item.folderName} • ${formatBytes(item.sizeBytes)} • ${item.ext.toUpperCase()}`;
  document.getElementById('btnFavorite').textContent = state.favorites.has(item.id) ? '⭐ Favorited' : '☆ Favorite';

  // Resolve valid video URL from memory or IndexedDB
  if (state.browserFiles.has(item.id)) {
    const liveFile = state.browserFiles.get(item.id);
    item.fileUri = URL.createObjectURL(liveFile);
  } else if (!window.api) {
    const idbFile = await getFileFromIDB(item.id);
    if (idbFile) {
      state.browserFiles.set(item.id, idbFile);
      item.fileUri = URL.createObjectURL(idbFile);
    } else {
      showToast('Browser session expired: click "📁 Add Folder" to re-link this folder for playback.', 'warn', 5000);
      logMessage('WARN', 'Blob URL expired and file not in IDB. Please click Add Folder.');
    }
  }

  videoPlayer.src = item.fileUri;
  videoPlayer.load();
  
  // Resume position if available
  const hist = state.history[item.id];
  if (hist && hist.positionSec > 2) {
    videoPlayer.currentTime = hist.positionSec;
  }

  videoPlayer.play().catch(e => console.log('Autoplay deferred:', e));

  renderNotes(item.id);
  renderUpNext(item);

  // Position Auto-Saver every 3 seconds
  if (saveInterval) clearInterval(saveInterval);
  saveInterval = setInterval(() => {
    if (!videoPlayer.paused && videoPlayer.currentTime > 0) {
      state.history[item.id] = {
        positionSec: videoPlayer.currentTime,
        watchedAt: Date.now()
      };
      saveStateToDisk();
    }
  }, 3000);
}

function closeWatchPage(minimize = false) {
  watchOverlay.classList.remove('active');
  if (saveInterval) clearInterval(saveInterval);

  if (state.currentMedia && !videoPlayer.paused && minimize) {
    // Show mini player
    miniPlayer.classList.add('active');
    document.getElementById('miniTitle').textContent = state.currentMedia.title;
    document.getElementById('miniChannel').textContent = state.currentMedia.folderName;
    const miniThumb = document.getElementById('miniThumb');
    if (state.currentMedia.thumbnailUrl) {
      miniThumb.src = state.currentMedia.thumbnailUrl;
      miniThumb.style.display = 'block';
    } else {
      miniThumb.style.display = 'none';
    }
  } else {
    videoPlayer.pause();
  }
  renderFeed();
}

function renderNotes(mediaId) {
  const listEl = document.getElementById('notesList');
  listEl.innerHTML = '';
  const notes = state.notes[mediaId] || [];

  if (notes.length === 0) {
    listEl.innerHTML = `<span style="color:var(--on-surface-muted);">No notes yet. Click "+ Add at Current Time" to create a bookmark.</span>`;
    return;
  }

  notes.forEach((n, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';
    row.innerHTML = `
      <button class="btn" style="padding:2px 8px; font-size:11px; font-family:monospace; color:var(--accent);" onclick="videoPlayer.currentTime = ${n.timeSec}">${formatDuration(n.timeSec)}</button>
      <span style="flex:1;">${n.text}</span>
      <button class="btn" style="padding:2px 6px; font-size:11px; color:var(--danger);" onclick="deleteNote('${mediaId}', ${idx})">✕</button>
    `;
    listEl.appendChild(row);
  });
}

window.deleteNote = function(mediaId, idx) {
  state.notes[mediaId].splice(idx, 1);
  saveStateToDisk();
  renderNotes(mediaId);
};

function renderUpNext(currentItem) {
  const container = document.getElementById('upNextList');
  container.innerHTML = '';
  // Strictly filter items from the exact same directory/folder
  const related = state.media.filter(m => m.id !== currentItem.id && m.folderPath === currentItem.folderPath);

  if (related.length === 0) {
    container.innerHTML = `<span style="color:var(--on-surface-muted); font-size:13px;">No other media in this folder (${currentItem.folderName}).</span>`;
    return;
  }

  related.slice(0, 10).forEach(item => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.cursor = 'pointer';
    row.innerHTML = `
      <div style="width:120px; aspect-ratio:16/9; background:#000; border-radius:6px; overflow:hidden; position:relative; flex-shrink:0;">
        <img src="${item.thumbnailUrl || ''}" class="card-thumb-${item.id}" style="${item.thumbnailUrl ? '' : 'display:none;'} width:100%; height:100%; object-fit:cover;">
        <span class="duration-pill card-dur-${item.id}">${formatDuration(item.durationSec)}</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:2px; overflow:hidden;">
        <div style="font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${item.title}</div>
        <div style="font-size:11px; color:var(--on-surface-muted);">${formatBytes(item.sizeBytes)}</div>
      </div>
    `;
    row.onclick = () => openWatchPage(item);
    container.appendChild(row);
  });
}

// Event Listeners Wiring
document.getElementById('btnAddFolder').onclick = handleAddFolder;
document.getElementById('btnLogo').onclick = () => {
  state.activeNav = 'home';
  state.activeChannel = null;
  state.searchQuery = '';
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('.nav-item[data-view="home"]')?.classList.add('active');
  closeWatchPage(true);
  renderAll();
};

document.getElementById('btnCloseWatch').onclick = () => closeWatchPage(true);

document.getElementById('btnExportBackup')?.addEventListener('click', exportBackup);

document.getElementById('btnImportRestore')?.addEventListener('click', () => {
  document.getElementById('restoreFileInput')?.click();
});

document.getElementById('restoreFileInput')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) {
    importRestore(file);
    e.target.value = '';
  }
});

document.getElementById('btnToggleTheme').onclick = () => {
  const themes = ['dark', 'light', 'cyber', 'amoled'];
  const nextIdx = (themes.indexOf(state.theme) + 1) % themes.length;
  switchTheme(themes[nextIdx]);
};

document.getElementById('searchInput').oninput = (e) => {
  state.searchQuery = e.target.value;
  renderFeed();
};

document.getElementById('sortSelect').onchange = (e) => {
  state.activeSort = e.target.value;
  renderFeed();
};

document.querySelectorAll('#filterChips .chip').forEach(chip => {
  chip.onclick = () => {
    document.querySelectorAll('#filterChips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.activeFilter = chip.dataset.filter;
    renderFeed();
  };
});

document.querySelectorAll('.sidebar .nav-item[data-view]').forEach(item => {
  item.onclick = () => {
    document.querySelectorAll('.sidebar .nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    state.activeNav = item.dataset.view;
    closeWatchPage(true);
    renderFeed();
  };
});

document.getElementById('btnFavorite').onclick = () => {
  if (!state.currentMedia) return;
  const id = state.currentMedia.id;
  if (state.favorites.has(id)) {
    state.favorites.delete(id);
    document.getElementById('btnFavorite').textContent = '☆ Favorite';
  } else {
    state.favorites.add(id);
    document.getElementById('btnFavorite').textContent = '⭐ Favorited';
  }
  saveStateToDisk();
};

document.getElementById('btnAddToPlaylist').onclick = () => {
  if (!state.currentMedia) return;
  const plNames = Object.keys(state.playlists);
  let promptText = 'Select or enter playlist name:';
  if (plNames.length > 0) {
    promptText += '\nExisting playlists: ' + plNames.join(', ');
  }
  const chosen = prompt(promptText);
  if (!chosen || !chosen.trim()) return;
  const name = chosen.trim();

  if (!state.playlists[name]) {
    state.playlists[name] = [];
  }

  if (!state.playlists[name].includes(state.currentMedia.id)) {
    state.playlists[name].push(state.currentMedia.id);
    saveStateToDisk();
    alert(`Added "${state.currentMedia.title}" to playlist "${name}"!`);
  } else {
    alert(`This video is already in playlist "${name}".`);
  }
};

document.getElementById('btnRevealFile').onclick = () => {
  if (state.currentMedia) {
    window.api.openInFolder(state.currentMedia.filePath);
  }
};

document.getElementById('btnAddNote').onclick = () => {
  if (!state.currentMedia) return;
  const text = prompt('Enter note / bookmark:');
  if (!text) return;
  if (!state.notes[state.currentMedia.id]) state.notes[state.currentMedia.id] = [];
  state.notes[state.currentMedia.id].push({
    timeSec: Math.floor(videoPlayer.currentTime),
    text: text
  });
  saveStateToDisk();
  renderNotes(state.currentMedia.id);
};

// Subtitle & Closed Caption Loader (.srt/.vtt)
function srtToVtt(srtText) {
  return 'WEBVTT\n\n' + srtText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
}

document.getElementById('btnLoadSubtitles')?.addEventListener('click', () => {
  document.getElementById('subtitleFileInput')?.click();
});

document.getElementById('subtitleFileInput')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      let vttContent = event.target.result;
      if (file.name.toLowerCase().endsWith('.srt')) {
        vttContent = srtToVtt(vttContent);
      }
      // Remove any previous tracks
      const oldTracks = videoPlayer.querySelectorAll('track');
      oldTracks.forEach(t => t.remove());

      const trackBlob = new Blob([vttContent], { type: 'text/vtt' });
      const trackUrl = URL.createObjectURL(trackBlob);
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = file.name;
      track.srclang = 'en';
      track.src = trackUrl;
      track.default = true;
      videoPlayer.appendChild(track);

      if (videoPlayer.textTracks && videoPlayer.textTracks[0]) {
        videoPlayer.textTracks[0].mode = 'showing';
      }

      showToast(`Loaded subtitles: ${file.name}`, 'success');
      logMessage('SUCCESS', `Subtitles loaded for "${state.currentMedia?.title}": ${file.name}`);
    } catch (err) {
      showToast('Failed to load subtitle file.', 'error');
      logMessage('ERROR', `Subtitle parsing error: ${err.message}`);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// Export Notes to .txt
document.getElementById('btnExportNotes')?.addEventListener('click', () => {
  if (!state.currentMedia) return;
  const mediaId = state.currentMedia.id;
  const notes = state.notes[mediaId] || [];
  if (notes.length === 0) {
    showToast('No notes to export yet.', 'info');
    return;
  }
  const title = state.currentMedia.title || 'Video';
  let content = `LocalVancedYT Personal Notes\nVideo: ${title}\nExported: ${new Date().toLocaleString()}\n----------------------------------------\n\n`;
  notes.forEach(n => {
    content += `[${formatDuration(n.timeSec)}] ${n.text}\n`;
  });

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[\\/:*?"<>|]/g, '_')}_Notes.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Notes exported to .txt!', 'success');
  logMessage('SUCCESS', `Exported notes for ${title}`);
});

// --- Custom Playback Controls Wiring ---
const ctrlPlayPause = document.getElementById('ctrlPlayPause');
const ctrlPrev = document.getElementById('ctrlPrev');
const ctrlNext = document.getElementById('ctrlNext');
const ctrlRewind = document.getElementById('ctrlRewind');
const ctrlForward = document.getElementById('ctrlForward');
const ctrlMute = document.getElementById('ctrlMute');
const volSlider = document.getElementById('volSlider');
const speedSelect = document.getElementById('speedSelect');
const ctrlLoop = document.getElementById('ctrlLoop');
const ctrlPiP = document.getElementById('ctrlPiP');
const ctrlFullscreen = document.getElementById('ctrlFullscreen');
const progressWrap = document.getElementById('progressWrap');
const progressPlayed = document.getElementById('progressPlayed');
const progressBuffered = document.getElementById('progressBuffered');
const progressScrubber = document.getElementById('progressScrubber');
const scrubTooltip = document.getElementById('scrubTooltip');
const timeDisplay = document.getElementById('timeDisplay');

// Play / Pause Toggle
function togglePlayPause() {
  if (videoPlayer.paused) {
    videoPlayer.play();
  } else {
    videoPlayer.pause();
  }
}

ctrlPlayPause.onclick = togglePlayPause;
videoPlayer.onclick = togglePlayPause;

videoPlayer.onplay = () => {
  ctrlPlayPause.textContent = '⏸';
  document.getElementById('btnMiniPlayPause').textContent = '⏸';
};

videoPlayer.onpause = () => {
  ctrlPlayPause.textContent = '▶';
  document.getElementById('btnMiniPlayPause').textContent = '▶';
};

// Time & Progress Update
videoPlayer.ontimeupdate = () => {
  const cur = videoPlayer.currentTime || 0;
  const dur = videoPlayer.duration || 0;
  timeDisplay.textContent = `${formatDuration(cur)} / ${formatDuration(dur)}`;

  if (dur > 0) {
    const pct = (cur / dur) * 100;
    progressPlayed.style.width = `${pct}%`;
    progressScrubber.style.left = `${pct}%`;
    const miniBar = document.getElementById('miniProgressBar');
    if (miniBar) miniBar.style.width = `${pct}%`;
  }
};

// Buffer Bar Update
videoPlayer.onprogress = () => {
  if (videoPlayer.buffered.length > 0 && videoPlayer.duration > 0) {
    const bufferedEnd = videoPlayer.buffered.end(videoPlayer.buffered.length - 1);
    const pct = (bufferedEnd / videoPlayer.duration) * 100;
    progressBuffered.style.width = `${pct}%`;
  }
};

// Scrubber Click & Drag
progressWrap.onclick = (e) => {
  const rect = progressWrap.getBoundingClientRect();
  const pos = (e.clientX - rect.left) / rect.width;
  if (videoPlayer.duration) {
    videoPlayer.currentTime = pos * videoPlayer.duration;
  }
};

progressWrap.onmousemove = (e) => {
  const rect = progressWrap.getBoundingClientRect();
  const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  if (videoPlayer.duration) {
    scrubTooltip.style.display = 'block';
    scrubTooltip.style.left = `${pos * 100}%`;
    scrubTooltip.textContent = formatDuration(pos * videoPlayer.duration);
  }
};

progressWrap.onmouseleave = () => {
  scrubTooltip.style.display = 'none';
};

// Previous & Next Video in Same Folder
ctrlPrev.onclick = () => {
  if (!state.currentMedia) return;
  const sameFolder = state.media.filter(m => m.folderPath === state.currentMedia.folderPath);
  const curIdx = sameFolder.findIndex(m => m.id === state.currentMedia.id);
  if (curIdx > 0) {
    openWatchPage(sameFolder[curIdx - 1]);
  } else {
    showToast('Already at the first video in this folder.', 'info');
  }
};

ctrlNext.onclick = () => {
  if (!state.currentMedia) return;
  const sameFolder = state.media.filter(m => m.folderPath === state.currentMedia.folderPath);
  const curIdx = sameFolder.findIndex(m => m.id === state.currentMedia.id);
  if (curIdx !== -1 && curIdx + 1 < sameFolder.length) {
    openWatchPage(sameFolder[curIdx + 1]);
  } else {
    showToast('Reached the end of this folder.', 'info');
  }
};

// ±10s Skip
ctrlRewind.onclick = () => {
  videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
};

ctrlForward.onclick = () => {
  videoPlayer.currentTime = Math.min(videoPlayer.duration || Infinity, videoPlayer.currentTime + 10);
};

// Volume / Mute
ctrlMute.onclick = () => {
  videoPlayer.muted = !videoPlayer.muted;
  ctrlMute.textContent = videoPlayer.muted ? '🔇' : '🔊';
  volSlider.value = videoPlayer.muted ? 0 : videoPlayer.volume;
};

volSlider.oninput = (e) => {
  videoPlayer.volume = parseFloat(e.target.value);
  videoPlayer.muted = (videoPlayer.volume === 0);
  ctrlMute.textContent = videoPlayer.muted ? '🔇' : '🔊';
};

// Playback Speed Selector
speedSelect.onchange = (e) => {
  videoPlayer.playbackRate = parseFloat(e.target.value);
  showToast(`Speed: ${e.target.value}x`, 'info', 1500);
};

// Loop Toggle
ctrlLoop.onclick = () => {
  videoPlayer.loop = !videoPlayer.loop;
  ctrlLoop.classList.toggle('active', videoPlayer.loop);
  showToast(videoPlayer.loop ? 'Loop: ON' : 'Loop: OFF', 'info', 1500);
};

// Picture-in-Picture
ctrlPiP.onclick = async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled) {
      await videoPlayer.requestPictureInPicture();
    }
  } catch (err) {
    logMessage('WARN', `PiP failed: ${err.message}`);
  }
};

// Fullscreen
ctrlFullscreen.onclick = () => {
  if (!document.fullscreenElement) {
    videoPlayer.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
};

// Mini Player Controls
document.getElementById('btnMiniRewind')?.addEventListener('click', (e) => {
  e.stopPropagation();
  videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
});

document.getElementById('btnMiniForward')?.addEventListener('click', (e) => {
  e.stopPropagation();
  videoPlayer.currentTime = Math.min(videoPlayer.duration || Infinity, videoPlayer.currentTime + 10);
});

document.getElementById('btnMiniPlayPause').onclick = (e) => {
  e.stopPropagation();
  if (videoPlayer.paused) {
    videoPlayer.play();
    document.getElementById('btnMiniPlayPause').textContent = '⏸';
  } else {
    videoPlayer.pause();
    document.getElementById('btnMiniPlayPause').textContent = '▶';
  }
};

document.getElementById('btnMiniExpand').onclick = () => {
  if (state.currentMedia) openWatchPage(state.currentMedia);
};

document.getElementById('btnMiniClose').onclick = (e) => {
  e.stopPropagation();
  videoPlayer.pause();
  miniPlayer.classList.remove('active');
};

document.getElementById('miniPlayerDock').onclick = () => {
  if (state.currentMedia) openWatchPage(state.currentMedia);
};

// Auto-play Next in Same Folder upon completion
videoPlayer.onended = () => {
  if (!state.currentMedia) return;
  const sameFolder = state.media.filter(m => m.folderPath === state.currentMedia.folderPath);
  const curIdx = sameFolder.findIndex(m => m.id === state.currentMedia.id);
  if (curIdx !== -1 && curIdx + 1 < sameFolder.length) {
    openWatchPage(sameFolder[curIdx + 1]);
  }
};

// YouTube-Style Global Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  // Ignore shortcuts if user is typing in search or an input/textarea
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    if (e.key === 'Escape') document.activeElement.blur();
    return;
  }

  // Escape: Close Watch Page or clear search
  if (e.key === 'Escape') {
    if (watchOverlay.classList.contains('active')) {
      closeWatchPage(true);
    }
    return;
  }

  // /: Focus search input
  if (e.key === '/') {
    e.preventDefault();
    document.getElementById('searchInput').focus();
    return;
  }

  // Video playback controls (when video is loaded)
  if (state.currentMedia) {
    // Space or K: Play / Pause
    if (e.key === ' ' || e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (videoPlayer.paused) {
        videoPlayer.play();
      } else {
        videoPlayer.pause();
      }
    }
    // Left Arrow / J: Rewind 10s (or 5s)
    else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'j') {
      e.preventDefault();
      videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
    }
    // Right Arrow / L: Fast forward 10s
    else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'l') {
      e.preventDefault();
      videoPlayer.currentTime = Math.min(videoPlayer.duration || Infinity, videoPlayer.currentTime + 10);
    }
    // F: Toggle Fullscreen
    else if (e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (!document.fullscreenElement) {
        videoPlayer.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    }
    // M: Toggle Mute
    else if (e.key.toLowerCase() === 'm') {
      e.preventDefault();
      videoPlayer.muted = !videoPlayer.muted;
    }
  }

  // Ctrl+D: Toggle Diagnostics & Debug HUD
  if (e.ctrlKey && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    toggleDebugHud();
  }
});

// Debug HUD Controls
function toggleDebugHud() {
  const hud = document.getElementById('debugHud');
  if (!hud) return;
  hud.classList.toggle('active');
  if (hud.classList.contains('active')) {
    logMessage('INFO', 'Debug HUD opened. Press Ctrl+D to hide.');
  }
}

document.getElementById('btnCloseDebug')?.addEventListener('click', () => {
  document.getElementById('debugHud')?.classList.remove('active');
});

document.getElementById('btnClearLogs')?.addEventListener('click', () => {
  state.debugLogs = [];
  const logBox = document.getElementById('debugLogs');
  if (logBox) logBox.innerHTML = '';
  logMessage('INFO', 'Debug logs cleared.');
});

// Video Playback Error Handling
videoPlayer.addEventListener('error', (e) => {
  const err = videoPlayer.error;
  let errMsg = 'Unknown playback error occurred.';
  if (err) {
    switch (err.code) {
      case err.MEDIA_ERR_ABORTED:
        errMsg = 'Playback aborted by user.';
        break;
      case err.MEDIA_ERR_NETWORK:
        errMsg = 'Disk/read error while accessing video file.';
        break;
      case err.MEDIA_ERR_DECODE:
        errMsg = 'Codec decoding error: this video format or codec is not supported by Chromium.';
        break;
      case err.MEDIA_ERR_SRC_NOT_SUPPORTED:
        errMsg = 'File not found, moved, or format not supported by HTML5 player.';
        break;
    }
  }
  logMessage('ERROR', `Video playback failed for "${state.currentMedia?.title || 'Unknown'}": ${errMsg}`);
  showToast(errMsg, 'error', 5000);
});

// Unhandled Global Error Catchers
window.addEventListener('error', (event) => {
  logMessage('ERROR', `Script Error: ${event.message} at ${event.filename}:${event.lineno}`);
});

window.addEventListener('unhandledrejection', (event) => {
  logMessage('ERROR', `Unhandled Promise Rejection: ${event.reason}`);
});

// Boot
loadStateFromDisk();
logMessage('INFO', 'LocalVancedYT initialized successfully.');
