# 🎬 LocalVancedYT

**LocalVancedYT** is a fully offline, high-performance desktop media player designed with a familiar YouTube-style user experience. Built with **Electron, Node.js, and HTML5/Canvas**, it indexes your local video and audio files directly from your storage with **zero internet connection, no tracking, and zero account requirements**.

---

## ✨ Features

- **📂 Folder-as-Channel System**: Media folders automatically group into channels with metadata, item counts, and storage metrics.
- **🎥 Multi-Format Support**:
  - **Video**: \.mp4\, \.mkv\, \.webm\, \.mov\, \.avi\, \.wmv\, \.m4v\
  - **Audio**: \.mp3\, \.wav\, \.m4a\, \.flac\, \.aac\, \.ogg\
- **⚡ Client-Side Thumbnail Generation**: Fast off-screen canvas frame extraction at 15% duration cached locally on disk.
- **⏮️ " Continue Watching\ Shelf**: Seamlessly resume playback from where you left off with accurate progress bars.
- **🎛️ Custom YouTube Playback Controls**:
 - Hover scrub bar with \mm:ss\ timestamp tooltip and buffer progress
 - Variable speed selector (0.25x – 2.0x)
 - ±10s skip, loop mode, volume slider, mute toggle
 - Native Picture-in-Picture (PiP) and fullscreen
- **🔒 Same-Folder Playback Queue**: The \Up Next\ queue strictly contains media from the exact same directory—no random file mixing.
- **💬 Subtitle / Closed Caption Support**: Load external \.srt\ or \.vtt\ subtitles on the fly with automatic SRT-to-WebVTT parsing.
- **📌 Timestamped Personal Notes & Bookmarks**: Save notes linked to specific seconds in a video, seek on click, and **Export to \.txt\**.
- **📱 Persistent Floating Mini-Player**: Bottom-right mini-player continues playback uninterrupted when browsing your library.
- **🔍 As-You-Type Live Search & Multi-Mode Sort**: Instant search by title or folder name, filter chips by length and status, and sort by date, title, duration, or size.
- **📋 Playlists, Favorites & Watch History**: Organize media into custom playlists, star favorites, and review your watch history.
- **🌓 4 Distinct UI Themes**:
 - 🌙 YouTube Dark (Default)
 - ☀️ Clean Light
 - ⚡ Cyber Minimal
 - 🖤 AMOLED Pure
- **💾 Full Library Backup & Restore**: Export all history, notes, and playlists into a single portable \.json\ file and restore it with one click.
- **🛠️ Diagnostics HUD (\Ctrl+D\)**: Built-in debug and activity console for playback diagnostics.

---

## 🚀 Quick Start & Installation

### Prerequisites
- [Node.js](https://nodejs.org) (v18 or newer recommended)
- Windows 10/11 (or macOS / Linux)

### Setup & Run
1. Clone the repository:
 \\\ash
 git clone https://github.com/fahimarnob113-ctrl/LocalVancedYTXX.git
 cd LocalVancedYTXX
 \\\
2. Install dependencies:
 \\\ash
 npm install
 \\\
3. Start the application:
 \\\ash
 npm start
 \\\

### Standalone Browser Mode (No Node.js required)
You can also open \index.html\ directly in Google Chrome or Microsoft Edge. The app will use HTML5 directory picking and IndexedDB for offline persistence.

---

## ⌨️ Global Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| \Space\ / \K\ | Play / Pause |
| \←\ / \J\ | Rewind 10 seconds |
| \→\ / \L\ | Fast forward 10 seconds |
| \F\ | Toggle Fullscreen |
| \M\ | Mute / Unmute |
| \/\ | Quick focus search bar |
| \Esc\ | Close Watch view / return to browse |
| \Ctrl+D\ | Toggle Diagnostics HUD |

---

## 📖 Walkthrough & Architecture
Detailed walkthrough and architecture notes can be found in [WALKTHROUGH.md](WALKTHROUGH.md) and [BUILD-INSTRUCTIONS.md](BUILD-INSTRUCTIONS.md).

---

## 📄 License
MIT License. Built for offline freedom and local media preservation.
