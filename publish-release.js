const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

const REPO_OWNER = 'fahimarnob113-ctrl';
const REPO_NAME = 'LocalVancedYTXX';
const TAG = 'v1.0.0';
const RELEASE_NAME = 'LocalVancedYT v1.0.0 — Official Windows Release';

function getGitHubToken() {
  const creds = execSync('git credential fill', {
    input: 'protocol=https\nhost=github.com\n',
    encoding: 'utf8'
  });
  const match = creds.match(/password=(.+)/);
  if (!match) throw new Error('Could not find GitHub token');
  return match[1].trim();
}

function apiRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`GitHub API Error ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function uploadAsset(uploadUrl, filePath, fileName, token) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(filePath);
    const parsedUrl = new URL(uploadUrl.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`));

    console.log(`Uploading ${fileName} (${(stat.size / (1024 * 1024)).toFixed(1)} MB)...`);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/zip',
        'Content-Length': stat.size,
        'User-Agent': 'LocalVancedYT-Release-Uploader'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Asset Upload Error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);

    const fileStream = fs.createReadStream(filePath);
    let uploadedBytes = 0;
    fileStream.on('data', chunk => {
      uploadedBytes += chunk.length;
      const pct = ((uploadedBytes / stat.size) * 100).toFixed(1);
      process.stdout.write(`\rUpload progress: ${pct}% (${(uploadedBytes / (1024 * 1024)).toFixed(1)} MB / ${(stat.size / (1024 * 1024)).toFixed(1)} MB)`);
    });
    fileStream.on('end', () => {
      console.log('\nFinalizing asset on GitHub...');
    });
    fileStream.pipe(req);
  });
}

async function main() {
  const token = getGitHubToken();
  console.log(`Authenticated with GitHub as ${REPO_OWNER}.`);

  const releaseBody = `## 🎉 LocalVancedYT v1.0.0 — Official Windows Release

**LocalVancedYT** is a complete, offline YouTube-style desktop media player built for Windows. It provides a rich YouTube UI for browsing, organizing, and playing offline video & audio libraries with zero internet connectivity.

---

### 📦 Download & Quick Start
1. Download **\`LocalVancedYT-v1.0.0-win32-x64-portable.zip\`** below.
2. Extract the ZIP to any folder on your computer.
3. Double-click **\`LocalVancedYT.exe\`** to launch immediately (no installation, Node.js, or terminal required)!

---

### ✨ Features Included:
- **Offline YouTube Experience**: 16:9 player with custom YouTube controls, scrub tooltips, ±10s skip, loop, PiP, variable speed (0.25x - 2.0x), and subtitles (.srt/.vtt).
- **Independent Queue & 4-Tab Sidebar**: Same-folder queue, playlist queue, manual queue, and timestamped notes sidebar with isolated scrolling (video stays visible at all times).
- **Spotify-Style Minimized Dock Player**: Bottom 76px persistent player bar with 3-zone layout, live scrubber timeline, and uninterrupted playback.
- **Disk Culling & Cleanup Manager**: Reclaim storage by identifying finished, duplicate, or heavy files and safely moving them to the Windows Recycle Bin.
- **Video Category Tagging & Dynamic Chips**: Tag videos with categories (#gaming, #tutorial, #music) and filter from the Home feed or live search.
- **4 Custom Themes**: YouTube Dark, Clean Light, Cyber Minimal, AMOLED Pure.
- **Full Library Portability**: Portable JSON backup and restore with 1-click.
`;

  let release;
  try {
    console.log(`Checking if release ${TAG} already exists...`);
    release = await apiRequest({
      hostname: 'api.github.com',
      path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${TAG}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'LocalVancedYT-Release-Uploader',
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    console.log(`Found existing release: ${release.name} (ID: ${release.id})`);
  } catch (e) {
    console.log(`Creating new release for ${TAG}...`);
    release = await apiRequest({
      hostname: 'api.github.com',
      path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'LocalVancedYT-Release-Uploader',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      }
    }, JSON.stringify({
      tag_name: TAG,
      target_commitish: 'main',
      name: RELEASE_NAME,
      body: releaseBody,
      draft: false,
      prerelease: false
    }));
    console.log(`Release created successfully! (ID: ${release.id})`);
  }

  const zipPath = path.join(__dirname, 'dist', 'LocalVancedYT-win32-x64-portable.zip');
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Portable zip not found at ${zipPath}`);
  }

  if (release.assets && release.assets.length > 0) {
    const existing = release.assets.find(a => a.name === 'LocalVancedYT-v1.0.0-win32-x64-portable.zip');
    if (existing) {
      console.log(`Deleting existing asset ${existing.name}...`);
      await apiRequest({
        hostname: 'api.github.com',
        path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/assets/${existing.id}`,
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'LocalVancedYT-Release-Uploader',
          'Accept': 'application/vnd.github.v3+json'
        }
      });
    }
  }

  const asset = await uploadAsset(release.upload_url, zipPath, 'LocalVancedYT-v1.0.0-win32-x64-portable.zip', token);
  console.log(`Asset uploaded successfully! Download URL: ${asset.browser_download_url}`);
  console.log(`\n🎉 Release published: ${release.html_url}`);
}

main().catch(err => {
  console.error('Release publication failed:', err);
  process.exit(1);
});
