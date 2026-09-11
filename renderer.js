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
  tags: {},
  activeTag: null,
  manualQueue: [],
  activeWatchTab: 'folder',
  activePlaylistForQueue: null,
  activeNoteTag: null,
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
let activeWorkers = 0;
const MAX_CONCURRENT_WORKERS = 3;

async function processThumbQueue() {
  if (thumbQueue.length === 0 || activeWorkers >= MAX_CONCURRENT_WORKERS) return;
  activeWorkers++;

  const item = thumbQueue.shift();
  try {
    let cached = null;
    if (window.api && window.api.getThumbnail) {
      try {
        cached = await window.api.getThumbnail(item.id);
      } catch (e) {
        cached = null;
      }
    } else {
      cached = await getThumbFromIDB(item.id);
    }

    if (cached) {
      item.thumbnailUrl = cached;
      updateCardThumbnail(item.id, cached);
      if (!item.durationSec) {
        await probeDuration(item);
      }
    } else {
      const generated = await generateVideoThumbnail(item);
      if (generated) {
        if (generated.duration) {
          item.durationSec = generated.duration;
          updateCardDuration(item.id, generated.duration);
        }
        if (generated.thumb) {
          let savedUrl = null;
          if (window.api && window.api.saveThumbnail) {
            try {
              savedUrl = await window.api.saveThumbnail(item.id, generated.thumb);
            } catch (e) {
              savedUrl = null;
            }
          } else {
            await saveThumbToIDB(item.id, generated.thumb);
          }
          item.thumbnailUrl = savedUrl || generated.thumb;
          updateCardThumbnail(item.id, item.thumbnailUrl);
        }
        saveStateToDisk();
      }
    }
  } catch (err) {
    console.warn('Thumb generation error:', err);
  } finally {
    activeWorkers--;
    if (thumbQueue.length > 0) {
      setTimeout(processThumbQueue, 20);
    }
  }
}

function probeDuration(item) {
  return new Promise((resolve) => {
    const el = document.createElement(item.type === 'audio' ? 'audio' : 'video');
    el.src = item.fileUri;
    el.preload = 'metadata';
    el.style.cssText = 'position:fixed; top:-9999px; left:-9999px; width:1px; height:1px; opacity:0; pointer-events:none;';
    document.body.appendChild(el);
    el.load();
    const timer = setTimeout(() => { el.remove(); resolve(); }, 3000);
    el.onloadedmetadata = () => {
      clearTimeout(timer);
      if (el.duration && !isNaN(el.duration)) {
        item.durationSec = el.duration;
        updateCardDuration(item.id, el.duration);
        saveStateToDisk();
      }
      el.remove();
      resolve();
    };
    el.onerror = () => { clearTimeout(timer); el.remove(); resolve(); };
  });
}

function generateVideoThumbnail(item) {
  return new Promise((resolve) => {
    if (item.type === 'audio') {
      const audio = document.createElement('audio');
      audio.src = item.fileUri;
      audio.preload = 'metadata';
      audio.style.cssText = 'position:fixed; top:-9999px; left:-9999px; width:1px; height:1px; opacity:0; pointer-events:none;';
      document.body.appendChild(audio);
      audio.load();
      const audioTimeout = setTimeout(() => {
        audio.remove();
        resolve(null);
      }, 3500);

      audio.onloadedmetadata = () => {
        clearTimeout(audioTimeout);
        if (audio.duration && !isNaN(audio.duration)) {
          item.durationSec = audio.duration;
          updateCardDuration(item.id, audio.duration);
          saveStateToDisk();
        }
        audio.remove();
        resolve({ thumb: null, duration: audio.duration });
      };

      audio.onerror = () => {
        clearTimeout(audioTimeout);
        audio.remove();
        resolve(null);
      };
      return;
    }

    const video = document.createElement('video');
    video.src = item.fileUri;
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = 'position:fixed; top:-9999px; left:-9999px; width:1px; height:1px; opacity:0; pointer-events:none;';
    document.body.appendChild(video);
    video.load();

    let finished = false;
    const cleanup = () => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        video.onloadedmetadata = null;
        video.onseeked = null;
        video.onerror = null;
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.remove();
      }
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 5000);

    const captureFrame = () => {
      let thumb = null;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 360;
        canvas.height = 202;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        thumb = canvas.toDataURL('image/jpeg', 0.75);
      } catch (e) {
        console.warn('Thumbnail canvas export error:', e);
        thumb = null;
      }
      const duration = video.duration || item.durationSec;
      cleanup();
      resolve({ thumb, duration });
    };

    video.onloadedmetadata = () => {
      if (video.duration && !isNaN(video.duration) && video.duration > 0) {
        item.durationSec = video.duration;
        updateCardDuration(item.id, video.duration);
        saveStateToDisk();
      }
      const seekTarget = Math.min(1.0, (video.duration || 1) * 0.1);
      if (video.currentTime !== seekTarget) {
        video.currentTime = seekTarget;
      } else {
        captureFrame();
      }
    };

    video.onseeked = () => {
      captureFrame();
    };

    video.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}

function updateCardThumbnail(id, url) {
  if (!url) return;
  document.querySelectorAll(`.card-thumb-${id}`).forEach(img => {
    img.src = url;
    img.style.display = 'block';
  });
  document.querySelectorAll(`.card-skeleton-${id}, .card-placeholder-${id}`).forEach(ph => {
    ph.style.display = 'none';
  });
}

function updateCardDuration(id, duration) {
  if (!duration) return;
  document.querySelectorAll(`.card-dur-${id}`).forEach(pill => {
    pill.textContent = formatDuration(duration);
  });
}

// IndexedDB Storage for Browser Mode (Persists File objects & Thumbnails across reloads)
const idbPromise = new Promise((resolve) => {
  const req = indexedDB.open('LocalVancedYT_FilesDB', 2);
  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains('files')) {
      db.createObjectStore('files');
    }
    if (!db.objectStoreNames.contains('thumbnails')) {
      db.createObjectStore('thumbnails');
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

async function saveThumbToIDB(id, thumbDataUrl) {
  try {
    const db = await idbPromise;
    if (!db) return;
    const tx = db.transaction('thumbnails', 'readwrite');
    tx.objectStore('thumbnails').put(thumbDataUrl, id);
  } catch (e) {
    console.warn('IDB saveThumb error:', e);
  }
}

async function getThumbFromIDB(id) {
  try {
    const db = await idbPromise;
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction('thumbnails', 'readonly');
      const req = tx.objectStore('thumbnails').get(id);
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
      state.tags = data.tags || {};
      state.theme = data.theme || 'dark';
      document.documentElement.setAttribute('data-theme', state.theme);

      // Re-encode and fix any local file URIs in Electron
      if (window.api && state.media.length > 0) {
        state.media.forEach(m => {
          if (m.filePath && (!m.fileUri || m.fileUri.startsWith('file://C:') || m.fileUri.includes(' '))) {
            m.fileUri = 'file:///' + encodeURI(m.filePath.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
          }
        });
      }

      // Re-hydrate browser blob URLs & thumbnails from IndexedDB
      if (!window.api && state.media.length > 0) {
        for (const m of state.media) {
          const file = await getFileFromIDB(m.id);
          if (file) {
            state.browserFiles.set(m.id, file);
            m.fileUri = URL.createObjectURL(file);
          }
          if (!m.thumbnailUrl) {
            const cachedThumb = await getThumbFromIDB(m.id);
            if (cachedThumb) {
              m.thumbnailUrl = cachedThumb;
              updateCardThumbnail(m.id, cachedThumb);
            }
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
  // In browser mode, strip large base64 data URLs from state.media before saving to localStorage
  // because localStorage is capped at 5MB across the entire domain in Chrome!
  const mediaToSave = state.media.map(m => {
    if (!window.api && m.thumbnailUrl && m.thumbnailUrl.startsWith('data:')) {
      const { thumbnailUrl, ...rest } = m;
      return rest;
    }
    return m;
  });

  const payload = {
    media: mediaToSave,
    folders: state.folders,
    history: state.history,
    favorites: Array.from(state.favorites),
    playlists: state.playlists,
    notes: state.notes,
    tags: state.tags,
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
  // Rather than flooding the decoder with 1,000 items all at once,
  // lazyThumbObserver queues on-screen visible cards as the user views them!
  for (let i = 0; i < MAX_CONCURRENT_WORKERS; i++) {
    processThumbQueue();
  }
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
  let reconnectedCount = 0;

  files.forEach(file => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (supportedExts.has(ext)) {
      const parts = file.webkitRelativePath ? file.webkitRelativePath.split('/') : [file.name];
      let folderName = parts[0] || 'Browser Uploads';
      if (parts.length > 2) {
        folderName = parts.slice(1, -1).join(' / ');
      }
      const parentDir = parts.length > 1 ? parts.slice(0, -1).join('/') : folderName;
      const isAudio = ['mp3', 'wav', 'm4a', 'flac', 'ogg'].includes(ext);
      const fileId = 'b_' + file.name + '_' + file.size;

      state.browserFiles.set(fileId, file);
      saveFileToIDB(fileId, file);

      const existing = state.media.find(m => m.id === fileId || m.fileName === file.name);
      if (existing) {
        existing.id = fileId;
        existing.fileUri = URL.createObjectURL(file);
        existing.filePath = file.webkitRelativePath || file.name;
        existing.folderName = folderName;
        existing.folderPath = parentDir;
        reconnectedCount++;
      } else {
        state.media.push({
          id: fileId,
          title: file.name.replace(/\.[^/.]+$/, ''),
          fileName: file.name,
          filePath: file.webkitRelativePath || file.name,
          fileUri: URL.createObjectURL(file),
          folderPath: parentDir,
          folderName: folderName,
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

  if (reconnectedCount > 0) {
    logMessage('SUCCESS', `Reconnected ${reconnectedCount} media files from browser.`);
    showToast(`Reconnected ${reconnectedCount} media files!`, 'success');
  } else {
    logMessage('SUCCESS', `Indexed ${addedCount} media files from browser.`);
    showToast(`Indexed ${addedCount} media files!`, 'success');
  }
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

  // Search filter (Matches title, folder, or #tags)
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    const cleanQ = q.replace(/^#/, '');
    list = list.filter(m => {
      const matchTitle = m.title.toLowerCase().includes(q);
      const matchFolder = m.folderName.toLowerCase().includes(q);
      const mediaTags = state.tags[m.id] || [];
      const matchTag = mediaTags.some(t => t.toLowerCase().includes(cleanQ));
      return matchTitle || matchFolder || matchTag;
    });
  }

  // Category Tag filter (via dynamic chips or tag clicking)
  if (state.activeTag) {
    list = list.filter(m => {
      const mediaTags = state.tags[m.id] || [];
      return mediaTags.includes(state.activeTag);
    });
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
  renderFilterChips();
  renderFeed();
}

function renderFilterChips() {
  const container = document.getElementById('filterChips');
  if (!container) return;

  const allTags = new Set();
  Object.values(state.tags).forEach(tagsArr => {
    if (Array.isArray(tagsArr)) {
      tagsArr.forEach(t => allTags.add(t));
    }
  });

  const baseChips = [
    { filter: 'all', label: 'All' },
    { filter: 'video', label: 'Videos' },
    { filter: 'audio', label: 'Audio' },
    { filter: 'resume', label: 'Continue Watching' },
    { filter: 'unwatched', label: 'Unwatched' },
    { filter: 'short', label: '< 5 mins' },
    { filter: 'medium', label: '5 - 20 mins' },
    { filter: 'long', label: '> 20 mins' }
  ];

  let html = '';
  baseChips.forEach(c => {
    const isActive = !state.activeTag && state.activeFilter === c.filter;
    html += `<div class="chip ${isActive ? 'active' : ''}" data-filter="${c.filter}">${c.label}</div>`;
  });

  Array.from(allTags).sort().forEach(tag => {
    const isActive = state.activeTag === tag;
    html += `<div class="chip ${isActive ? 'active' : ''}" data-tag="${tag}">🏷️ #${tag}</div>`;
  });

  container.innerHTML = html;

  container.querySelectorAll('.chip').forEach(chip => {
    chip.onclick = () => {
      if (chip.dataset.tag) {
        const clickedTag = chip.dataset.tag;
        state.activeTag = (state.activeTag === clickedTag) ? null : clickedTag;
        state.activeFilter = 'all';
      } else {
        state.activeTag = null;
        state.activeFilter = chip.dataset.filter || 'all';
      }
      renderFilterChips();
      renderFeed();
    };
  });
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

  // Browser Mode Reconnect Banner (Chrome file revocation workaround)
  if (!window.api && state.media.length > 0 && state.browserFiles.size === 0) {
    const reconnectBanner = document.createElement('div');
    reconnectBanner.style.cssText = 'background:rgba(255, 170, 0, 0.12); border:1px solid #ffaa00; border-radius:10px; padding:14px 18px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;';
    reconnectBanner.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-size:24px;">🔄</span>
        <div>
          <div style="font-weight:700; font-size:14px; color:var(--on-surface);">Browser Session Notice (Chrome Sandbox)</div>
          <div style="font-size:12.5px; color:var(--on-surface-muted); margin-top:2px;">
            Chrome revokes temporary file handles upon page reload. Click <strong>Reconnect Folder</strong> to restore instant playback for your ${state.media.length} videos without losing playlists, notes, or history!
          </div>
        </div>
      </div>
      <button class="btn btn-accent" id="btnBannerReconnect" style="font-size:13px; padding:6px 14px;">🔄 Reconnect Folder</button>
    `;
    container.appendChild(reconnectBanner);
    reconnectBanner.querySelector('#btnBannerReconnect').onclick = () => {
      document.getElementById('browserFolderInput')?.click();
    };
  }

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
  const countLabel = state.activeChannel ? `📁 Folder: ${state.activeChannel}` : 'All Media';
  const clearBtn = state.activeChannel ? `<button class="btn btn-accent" id="btnClearActiveChannel" style="font-size:11px; padding:2px 8px; margin-left:10px;">✕ Show All Folders</button>` : '';
  gridSection.innerHTML = `
    <div class="shelf-title">
      <div style="display:flex; align-items:center;">
        <span>${countLabel}</span>
        ${clearBtn}
      </div>
      <span style="font-size:12px; color:var(--on-surface-muted);">${filteredMedia.length} results</span>
    </div>
    <div class="media-grid" id="mainMediaGrid"></div>
  `;
  const gridEl = gridSection.querySelector('#mainMediaGrid');

  gridSection.querySelector('#btnClearActiveChannel')?.addEventListener('click', () => {
    state.activeChannel = null;
    document.querySelectorAll('.sidebar .nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('.sidebar .nav-item[data-view="home"]')?.classList.add('active');
    renderAll();
  });

  if (filteredMedia.length === 0) {
    gridEl.innerHTML = `<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--on-surface-muted);">No files match your filter/search criteria.</div>`;
  } else {
    const PAGE_SIZE = 36;
    let renderedCount = 0;

    if (window.feedSentinelObserver) {
      window.feedSentinelObserver.disconnect();
    }

    const renderNextBatch = () => {
      const nextBatch = filteredMedia.slice(renderedCount, renderedCount + PAGE_SIZE);
      nextBatch.forEach(item => {
        gridEl.appendChild(createVideoCard(item, false));
      });
      renderedCount += nextBatch.length;

      const oldSentinel = document.getElementById('gridSentinel');
      if (oldSentinel) oldSentinel.remove();

      if (renderedCount < filteredMedia.length) {
        const sentinel = document.createElement('div');
        sentinel.id = 'gridSentinel';
        sentinel.style.cssText = 'grid-column: 1/-1; padding: 20px; text-align: center; color: var(--on-surface-muted); font-size: 13px;';
        sentinel.innerHTML = `<span>Loading more videos (${renderedCount} of ${filteredMedia.length})...</span>`;
        gridEl.appendChild(sentinel);
        window.feedSentinelObserver.observe(sentinel);
      }
    };

    window.feedSentinelObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        window.feedSentinelObserver.unobserve(entries[0].target);
        renderNextBatch();
      }
    }, { rootMargin: '400px' });

    renderNextBatch();
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

// Viewport-Only Lazy Thumbnail Observer (Prioritizes on-screen cards)
const lazyThumbObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const card = entry.target;
      const mediaId = card.dataset.id;
      observer.unobserve(card);

      const item = state.media.find(m => m.id === mediaId);
      if (item && (!item.thumbnailUrl || !item.durationSec)) {
        if (!thumbQueue.some(q => q.id === item.id)) {
          thumbQueue.unshift(item);
          processThumbQueue();
        }
      }
    }
  });
}, {
  rootMargin: '250px 0px'
});

function createVideoCard(item, isShelf) {
  const card = document.createElement('div');
  card.className = 'video-card';
  card.dataset.id = item.id;
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
      <div class="thumbnail-skeleton card-skeleton-${item.id}" style="${thumbSrc ? 'display:none;' : 'display:flex;'}">
        <span class="skeleton-icon">${item.type === 'audio' ? '🎵' : '🎬'}</span>
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
        <div class="card-tags" id="cardTags-${item.id}">
          ${(state.tags[item.id] || []).map(t => `<span class="tag-badge" data-tag="${t}">#${t}</span>`).join('')}
          <button class="btn-add-tag" title="Add category tag">+ Tag</button>
          <button class="btn-add-tag btn-queue-card" title="Add to playback queue" style="color:var(--accent); border-color:var(--accent);">+ Queue</button>
        </div>
      </div>
    </div>
  `;

  card.onclick = () => openWatchPage(item);

  card.querySelectorAll('.tag-badge').forEach(badge => {
    badge.onclick = (e) => {
      e.stopPropagation();
      const tag = badge.dataset.tag;
      state.activeTag = (state.activeTag === tag) ? null : tag;
      state.activeFilter = 'all';
      renderFilterChips();
      renderFeed();
    };
  });

  const btnAdd = card.querySelector('.btn-add-tag');
  if (btnAdd) {
    btnAdd.onclick = (e) => {
      e.stopPropagation();
      promptCategoryTag(item.id);
    };
  }

  const btnQueue = card.querySelector('.btn-queue-card');
  if (btnQueue) {
    btnQueue.onclick = (e) => {
      e.stopPropagation();
      addToManualQueue(item);
    };
  }

  if (!item.thumbnailUrl || !item.durationSec) {
    lazyThumbObserver.observe(card);
  }

  return card;
}

// Category Tag Management Engine
function promptCategoryTag(mediaId) {
  const item = state.media.find(m => m.id === mediaId);
  if (!item) return;
  const currentTags = state.tags[mediaId] || [];
  const input = prompt(
    `Manage Category Tags for:\n"${item.title}"\n\nEnter comma-separated tags (e.g. Tutorial, Music, Gaming, Lecture):`,
    currentTags.join(', ')
  );
  if (input === null) return;
  const newTags = input.split(',')
    .map(t => t.trim().replace(/^#/, '').toLowerCase())
    .filter(t => t.length > 0);

  if (newTags.length === 0) {
    delete state.tags[mediaId];
  } else {
    state.tags[mediaId] = Array.from(new Set(newTags));
  }
  saveStateToDisk();
  renderFilterChips();
  renderFeed();
  renderWatchTags(mediaId);
  showToast(`Updated tags for "${item.title}"`, 'success');
}

function renderWatchTags(mediaId) {
  const container = document.getElementById('watchTags');
  if (!container) return;
  const tags = state.tags[mediaId] || [];
  container.innerHTML = tags.map(t => `<span class="tag-badge" data-tag="${t}">#${t}</span>`).join('') +
    `<button class="btn-add-tag" id="btnAddWatchTag" style="margin-left:4px;">+ Tag</button>`;

  container.querySelectorAll('.tag-badge').forEach(badge => {
    badge.onclick = () => {
      const tag = badge.dataset.tag;
      state.activeTag = tag;
      state.activeFilter = 'all';
      closeWatchPage(true);
      renderAll();
    };
  });

  const btnAdd = container.querySelector('#btnAddWatchTag');
  if (btnAdd) {
    btnAdd.onclick = () => promptCategoryTag(mediaId);
  }
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
  renderWatchTags(item.id);

  const btnManageTags = document.getElementById('btnManageWatchTags');
  if (btnManageTags) {
    btnManageTags.onclick = () => promptCategoryTag(item.id);
  }

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
  renderWatchTabs(item);

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

// --- Watch Page 4-Tab Sidebar Engine ---

function addToManualQueue(item, playNext = false) {
  if (playNext) {
    state.manualQueue.unshift(item);
    showToast(`Queued "${item.title}" to play next!`, 'success');
  } else {
    state.manualQueue.push(item);
    showToast(`Added "${item.title}" to queue!`, 'success');
  }
  updateQueueBadge();
  if (state.activeWatchTab === 'manual') {
    renderManualQueue();
  }
}

function updateQueueBadge() {
  const badge = document.getElementById('badgeQueueCount');
  if (!badge) return;
  if (state.manualQueue.length > 0) {
    badge.textContent = state.manualQueue.length;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function renderWatchTabs(currentItem) {
  updateQueueBadge();
  const tabsHeader = document.getElementById('watchTabsHeader');
  if (tabsHeader) {
    tabsHeader.querySelectorAll('.watch-tab-btn').forEach(btn => {
      btn.onclick = () => {
        tabsHeader.querySelectorAll('.watch-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeWatchTab = btn.dataset.tab;
        
        document.getElementById('tabContentFolder').style.display = (state.activeWatchTab === 'folder') ? 'flex' : 'none';
        document.getElementById('tabContentPlaylist').style.display = (state.activeWatchTab === 'playlist') ? 'flex' : 'none';
        document.getElementById('tabContentManual').style.display = (state.activeWatchTab === 'manual') ? 'flex' : 'none';
        document.getElementById('tabContentNotes').style.display = (state.activeWatchTab === 'notes') ? 'flex' : 'none';
        
        renderActiveWatchTab(currentItem);
      };
    });
  }

  // Ensure active tab view is displayed correctly
  document.getElementById('tabContentFolder').style.display = (state.activeWatchTab === 'folder') ? 'flex' : 'none';
  document.getElementById('tabContentPlaylist').style.display = (state.activeWatchTab === 'playlist') ? 'flex' : 'none';
  document.getElementById('tabContentManual').style.display = (state.activeWatchTab === 'manual') ? 'flex' : 'none';
  document.getElementById('tabContentNotes').style.display = (state.activeWatchTab === 'notes') ? 'flex' : 'none';

  renderActiveWatchTab(currentItem);
}

function renderActiveWatchTab(currentItem) {
  if (state.activeWatchTab === 'folder') {
    renderFolderQueue(currentItem);
  } else if (state.activeWatchTab === 'playlist') {
    renderPlaylistQueue(currentItem);
  } else if (state.activeWatchTab === 'manual') {
    renderManualQueue();
  } else if (state.activeWatchTab === 'notes') {
    renderSideNotes(currentItem.id);
  }
}

// Tab 1: Same Folder Queue
function renderFolderQueue(currentItem) {
  const container = document.getElementById('upNextList');
  if (!container) return;
  container.innerHTML = '';

  const related = state.media.filter(m => m.folderPath === currentItem.folderPath);
  const titleEl = document.getElementById('folderQueueTitle');
  const countEl = document.getElementById('folderQueueCount');
  if (titleEl) titleEl.textContent = currentItem.folderName || 'Current Folder';
  if (countEl) countEl.textContent = `${related.length} videos`;

  if (related.length === 0) {
    container.innerHTML = `<span style="color:var(--on-surface-muted); font-size:13px;">No other media in this folder.</span>`;
    return;
  }

  related.forEach(item => {
    const isCurrent = item.id === currentItem.id;
    const row = document.createElement('div');
    row.className = `queue-item-row ${isCurrent ? 'active' : ''}`;
    row.innerHTML = `
      <div style="width:110px; aspect-ratio:16/9; background:#000; border-radius:6px; overflow:hidden; position:relative; flex-shrink:0;">
        <img src="${item.thumbnailUrl || ''}" class="card-thumb-${item.id}" style="${item.thumbnailUrl ? '' : 'display:none;'} width:100%; height:100%; object-fit:cover;">
        <span class="duration-pill card-dur-${item.id}">${formatDuration(item.durationSec)}</span>
        ${isCurrent ? `<div style="position:absolute; top:4px; left:4px; background:var(--accent); color:#fff; font-size:9px; font-weight:700; padding:1px 4px; border-radius:3px;">PLAYING</div>` : ''}
      </div>
      <div style="display:flex; flex-direction:column; gap:2px; overflow:hidden; flex:1;">
        <div style="font-size:12.5px; font-weight:600; color:${isCurrent ? 'var(--accent)' : 'var(--on-surface)'}; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${item.title}</div>
        <div style="font-size:11px; color:var(--on-surface-muted);">${formatBytes(item.sizeBytes)}</div>
      </div>
      <button class="btn btn-add-tag" title="Add to queue" style="font-size:10px; padding:2px 6px;">+ Queue</button>
    `;

    row.onclick = (e) => {
      if (e.target.tagName === 'BUTTON') return;
      openWatchPage(item);
    };

    row.querySelector('button')?.addEventListener('click', (e) => {
      e.stopPropagation();
      addToManualQueue(item);
    });

    container.appendChild(row);
  });
}

// Tab 2: Playlist Queue
function renderPlaylistQueue(currentItem) {
  const container = document.getElementById('playlistQueueList');
  const dropdown = document.getElementById('playlistSelectDropdown');
  if (!container || !dropdown) return;

  const playlistNames = Object.keys(state.playlists);
  if (playlistNames.length === 0) {
    dropdown.innerHTML = `<option value="">No playlists created</option>`;
    container.innerHTML = `<div style="padding:24px; text-align:center; color:var(--on-surface-muted); font-size:13px;">You have not created any playlists yet.<br><br><button class="btn btn-accent" style="font-size:11px;" onclick="document.getElementById('btnAddToPlaylist').click()">+ Create or Add Playlist</button></div>`;
    return;
  }

  if (!state.activePlaylistForQueue || !state.playlists[state.activePlaylistForQueue]) {
    state.activePlaylistForQueue = playlistNames[0];
  }

  dropdown.innerHTML = playlistNames.map(name => `
    <option value="${name}" ${state.activePlaylistForQueue === name ? 'selected' : ''}>${name} (${state.playlists[name].length} tracks)</option>
  `).join('');

  dropdown.onchange = (e) => {
    state.activePlaylistForQueue = e.target.value;
    state.activePlaylistName = e.target.value;
    renderPlaylistQueue(currentItem);
  };

  const plItems = state.playlists[state.activePlaylistForQueue] || [];
  container.innerHTML = '';

  if (plItems.length === 0) {
    container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--on-surface-muted); font-size:13px;">This playlist is empty.</div>`;
    return;
  }

  plItems.forEach((mediaId, idx) => {
    const item = state.media.find(m => m.id === mediaId);
    if (!item) return;

    const isCurrent = currentItem && item.id === currentItem.id;
    const row = document.createElement('div');
    row.className = `queue-item-row ${isCurrent ? 'active' : ''}`;
    row.innerHTML = `
      <span style="font-size:12px; font-weight:700; color:var(--on-surface-muted); width:18px; text-align:center;">#${idx + 1}</span>
      <div style="width:90px; aspect-ratio:16/9; background:#000; border-radius:6px; overflow:hidden; position:relative; flex-shrink:0;">
        <img src="${item.thumbnailUrl || ''}" class="card-thumb-${item.id}" style="${item.thumbnailUrl ? '' : 'display:none;'} width:100%; height:100%; object-fit:cover;">
        <span class="duration-pill card-dur-${item.id}">${formatDuration(item.durationSec)}</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:2px; overflow:hidden; flex:1;">
        <div style="font-size:12.5px; font-weight:600; color:${isCurrent ? 'var(--accent)' : 'var(--on-surface)'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</div>
        <div style="font-size:11px; color:var(--on-surface-muted);">${item.folderName}</div>
      </div>
      <button class="btn" title="Remove from playlist" style="padding:2px 6px; font-size:11px; color:var(--danger);">✕</button>
    `;

    row.onclick = (e) => {
      if (e.target.tagName === 'BUTTON') return;
      state.activePlaylistName = state.activePlaylistForQueue;
      openWatchPage(item);
    };

    row.querySelector('button').onclick = (e) => {
      e.stopPropagation();
      state.playlists[state.activePlaylistForQueue].splice(idx, 1);
      saveStateToDisk();
      renderPlaylistQueue(currentItem);
      showToast(`Removed from "${state.activePlaylistForQueue}"`, 'info');
    };

    container.appendChild(row);
  });
}

// Tab 3: Manual Queue
function renderManualQueue() {
  const container = document.getElementById('manualQueueList');
  if (!container) return;
  container.innerHTML = '';

  updateQueueBadge();

  if (state.manualQueue.length === 0) {
    container.innerHTML = `
      <div style="padding:32px 16px; text-align:center; color:var(--on-surface-muted); font-size:13px;">
        <div style="font-size:28px; margin-bottom:6px;">⏳</div>
        <div>Your playback queue is empty.</div>
        <div style="font-size:11.5px; margin-top:4px; opacity:0.8;">Click <strong>+ Queue</strong> on any video to line up your watch session.</div>
      </div>
    `;
    return;
  }

  state.manualQueue.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'queue-item-row';
    row.innerHTML = `
      <span style="font-size:12px; font-weight:700; color:var(--on-surface-muted); width:18px; text-align:center;">${idx + 1}</span>
      <div style="width:90px; aspect-ratio:16/9; background:#000; border-radius:6px; overflow:hidden; position:relative; flex-shrink:0;">
        <img src="${item.thumbnailUrl || ''}" class="card-thumb-${item.id}" style="${item.thumbnailUrl ? '' : 'display:none;'} width:100%; height:100%; object-fit:cover;">
        <span class="duration-pill card-dur-${item.id}">${formatDuration(item.durationSec)}</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:2px; overflow:hidden; flex:1;">
        <div style="font-size:12.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</div>
        <div style="font-size:11px; color:var(--on-surface-muted);">${item.folderName}</div>
      </div>
      <div style="display:flex; gap:2px;">
        <button class="btn btn-up" title="Move Up" style="padding:2px 5px; font-size:10px;" ${idx === 0 ? 'disabled' : ''}>▲</button>
        <button class="btn btn-down" title="Move Down" style="padding:2px 5px; font-size:10px;" ${idx === state.manualQueue.length - 1 ? 'disabled' : ''}>▼</button>
        <button class="btn btn-del" title="Remove" style="padding:2px 5px; font-size:10px; color:var(--danger);">✕</button>
      </div>
    `;

    row.onclick = (e) => {
      if (e.target.tagName === 'BUTTON') return;
      state.manualQueue.splice(idx, 1);
      updateQueueBadge();
      openWatchPage(item);
    };

    row.querySelector('.btn-up')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (idx > 0) {
        const temp = state.manualQueue[idx];
        state.manualQueue[idx] = state.manualQueue[idx - 1];
        state.manualQueue[idx - 1] = temp;
        renderManualQueue();
      }
    });

    row.querySelector('.btn-down')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (idx < state.manualQueue.length - 1) {
        const temp = state.manualQueue[idx];
        state.manualQueue[idx] = state.manualQueue[idx + 1];
        state.manualQueue[idx + 1] = temp;
        renderManualQueue();
      }
    });

    row.querySelector('.btn-del')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.manualQueue.splice(idx, 1);
      renderManualQueue();
      showToast('Removed from queue.', 'info');
    });

    container.appendChild(row);
  });
}

document.getElementById('btnClearManualQueue')?.addEventListener('click', () => {
  if (state.manualQueue.length === 0) return;
  state.manualQueue = [];
  renderManualQueue();
  showToast('Queue cleared.', 'info');
});

// Tab 4: Tagged Notes & Bookmarks
function renderSideNotes(mediaId) {
  const container = document.getElementById('notesListSide');
  const tagFiltersEl = document.getElementById('notesTagFilters');
  if (!container) return;

  const notes = state.notes[mediaId] || [];

  // Extract all hashtags from notes
  const hashtags = new Set();
  notes.forEach(n => {
    const matches = n.text.match(/#[a-zA-Z0-9_-]+/g);
    if (matches) {
      matches.forEach(tag => hashtags.add(tag.toLowerCase()));
    }
  });

  // Render hashtag filter chips
  if (tagFiltersEl) {
    if (hashtags.size > 0) {
      tagFiltersEl.innerHTML = Array.from(hashtags).map(tag => `
        <span class="tag-badge ${state.activeNoteTag === tag ? 'active' : ''}" data-tag="${tag}">${tag}</span>
      `).join('') + (state.activeNoteTag ? `<span class="tag-badge" id="btnClearNoteTag" style="color:var(--danger);">✕ Clear</span>` : '');

      tagFiltersEl.querySelectorAll('.tag-badge').forEach(badge => {
        badge.onclick = () => {
          if (badge.id === 'btnClearNoteTag') {
            state.activeNoteTag = null;
          } else {
            const tag = badge.dataset.tag;
            state.activeNoteTag = (state.activeNoteTag === tag) ? null : tag;
          }
          renderSideNotes(mediaId);
        };
      });
    } else {
      tagFiltersEl.innerHTML = '';
    }
  }

  let displayedNotes = notes;
  if (state.activeNoteTag) {
    displayedNotes = notes.filter(n => n.text.toLowerCase().includes(state.activeNoteTag));
  }

  container.innerHTML = '';

  if (displayedNotes.length === 0) {
    container.innerHTML = `
      <div style="padding:24px; text-align:center; color:var(--on-surface-muted); font-size:12.5px;">
        No timestamped notes yet.<br>Click <strong>+ Note</strong> to save a thought or key moment!
      </div>
    `;
    return;
  }

  displayedNotes.forEach((n, idx) => {
    const originalIdx = notes.indexOf(n);
    const row = document.createElement('div');
    row.style.cssText = 'background:var(--surface-elevated); border:1px solid var(--divider); border-radius:6px; padding:8px 10px; display:flex; flex-direction:column; gap:4px;';
    
    const highlightedText = n.text.replace(/(#[a-zA-Z0-9_-]+)/g, '<span style="color:var(--accent); font-weight:600;">$1</span>');

    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <button class="btn" style="padding:1px 6px; font-size:11px; font-family:monospace; color:var(--accent);">${formatDuration(n.timeSec)}</button>
        <button class="btn" title="Delete note" style="padding:1px 5px; font-size:10px; color:var(--danger);">✕</button>
      </div>
      <div style="font-size:12.5px; line-height:1.4; word-break:break-word;">${highlightedText}</div>
    `;

    row.querySelector('button').onclick = () => {
      videoPlayer.currentTime = n.timeSec;
    };

    row.querySelector('button[title="Delete note"]').onclick = () => {
      state.notes[mediaId].splice(originalIdx, 1);
      saveStateToDisk();
      renderSideNotes(mediaId);
      renderNotes(mediaId);
      showToast('Note deleted.', 'info');
    };

    container.appendChild(row);
  });
}

document.getElementById('btnAddNoteSide')?.addEventListener('click', () => {
  if (!state.currentMedia) return;
  const text = prompt('Enter note / bookmark (you can use #tags like #important or #summary):');
  if (!text || !text.trim()) return;
  if (!state.notes[state.currentMedia.id]) state.notes[state.currentMedia.id] = [];
  state.notes[state.currentMedia.id].push({
    timeSec: Math.floor(videoPlayer.currentTime),
    text: text.trim(),
    createdAt: Date.now()
  });
  saveStateToDisk();
  renderSideNotes(state.currentMedia.id);
  renderNotes(state.currentMedia.id);
  showToast('Note added!', 'success');
});

document.getElementById('btnExportNotesSide')?.addEventListener('click', () => {
  document.getElementById('btnExportNotes')?.click();
});

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

// Previous & Next Video Navigation (Manual Queue -> Playlist -> Folder)
function playPreviousVideo() {
  if (!state.currentMedia) return;
  if (state.activePlaylistName && state.playlists[state.activePlaylistName]) {
    const pl = state.playlists[state.activePlaylistName];
    const curIdx = pl.indexOf(state.currentMedia.id);
    if (curIdx > 0) {
      const prevMedia = state.media.find(m => m.id === pl[curIdx - 1]);
      if (prevMedia) {
        openWatchPage(prevMedia);
        return;
      }
    }
  }
  const sameFolder = state.media.filter(m => m.folderPath === state.currentMedia.folderPath);
  const curIdx = sameFolder.findIndex(m => m.id === state.currentMedia.id);
  if (curIdx > 0) {
    openWatchPage(sameFolder[curIdx - 1]);
  } else {
    showToast('Already at the first video.', 'info');
  }
}

function playNextVideo() {
  // 1. Manual Queue has highest priority
  if (state.manualQueue.length > 0) {
    const nextItem = state.manualQueue.shift();
    updateQueueBadge();
    renderManualQueue();
    openWatchPage(nextItem);
    return;
  }

  // 2. Active Playlist
  if (state.activePlaylistName && state.playlists[state.activePlaylistName]) {
    const pl = state.playlists[state.activePlaylistName];
    const curIdx = pl.indexOf(state.currentMedia?.id);
    if (curIdx !== -1 && curIdx + 1 < pl.length) {
      const nextMedia = state.media.find(m => m.id === pl[curIdx + 1]);
      if (nextMedia) {
        openWatchPage(nextMedia);
        return;
      }
    }
  }

  // 3. Fallback to same folder
  if (!state.currentMedia) return;
  const sameFolder = state.media.filter(m => m.folderPath === state.currentMedia.folderPath);
  const curIdx = sameFolder.findIndex(m => m.id === state.currentMedia.id);
  if (curIdx !== -1 && curIdx + 1 < sameFolder.length) {
    openWatchPage(sameFolder[curIdx + 1]);
  } else {
    showToast('Reached the end of the folder/queue.', 'info');
  }
}

ctrlPrev.onclick = playPreviousVideo;
ctrlNext.onclick = playNextVideo;

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

// Auto-play Next upon completion
videoPlayer.onended = playNextVideo;

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
