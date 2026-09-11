# Product Spec: Offline "YouTube-Style" Media Player (Android)

## 1. Overview

**Product name (working title):** LocalTube / OfflineTube (placeholder)

**One-liner:** A fully offline Android media player that indexes local video/audio files and presents them through a familiar YouTube-style browsing and playback experience — no internet, no accounts, no backend.

**Target user:** People with large local video/audio libraries (downloaded lectures, home videos, movies, podcasts, music files) who want a polished, YouTube-familiar way to browse and watch them instead of a bare-bones file explorer or default gallery app.

**Platform:** Android (built via Google AI Studio / Gemini app scaffolding, using Jetpack Compose + Media3/ExoPlayer)

---

## 2. Goals & Non-Goals

**Goals**
- Recreate YouTube's *browsing and playback UX* using 100% local content
- Zero network dependency — works fully offline
- Fast indexing and thumbnail generation for large libraries (500+ files)
- Familiar navigation so users need zero onboarding

**Non-Goals (v1)**
- No streaming, no accounts, no recommendations engine, no cloud sync
- No video editing or transcoding
- No social features (real comments, likes shared with others, subscriptions to other people)

---

## 3. MVP Feature Set (Phase 1)

| Feature | Description | Priority |
|---|---|---|
| Media scanning | Scan device storage via `MediaStore` for video/audio files | P0 |
| Home grid/list feed | Thumbnail cards with title, duration, date | P0 |
| Thumbnail generation | Auto-extract frame + cache locally | P0 |
| Watch page | Full player, title, basic metadata | P0 |
| Playback controls | Play/pause, seek, skip ±10s, speed control | P0 |
| Resume playback | Continue Watching from last position | P0 |
| Mini-player | Persistent bottom player while browsing | P0 |
| Bottom nav | Home / Search / Library / Settings | P0 |
| Search | Filename-based search | P0 |
| Folder-as-channel | Folders auto-map to channels on first scan; user can rename, set custom banner/avatar, or merge folders into one channel | P1 |
| Playlists | User-created, reorderable | P1 |
| Favorites/Watch Later | Star or save items | P1 |
| History | Watch history log | P1 |
| Dark/light theme | YouTube-style dark mode default | P1 |
| Subtitles | Load matching .srt/.vtt | P1 |
| PiP mode | Picture-in-picture support | P2 |
| Background audio | Audio-only background playback | P2 |
| Multi-select file ops | Rename/delete/move in-app | P2 |

## 4. Stretch Features (Phase 2+)

- ~~Vertical swipe "Shorts" feed for clips under 60s~~ — **deferred to Phase 2** (not in v1)
- Local network casting (Chromecast/DLNA)
- Sleep timer + equalizer
- Auto-sync watched folders (new files auto-appear)
- Custom thumbnail picker
- Home screen widget (Continue Watching)
- SMB/network share and USB-OTG support
- Personal "watch stats" analytics page
- Playlist import/export (.m3u)

---

## 5. Screen Breakdown

### 5.1 Home
- Top bar: app logo/name, search icon, settings icon
- Shelf: "Continue Watching" (horizontal scroll)
- Shelf: "Recently Added"
- Shelf: "By Folder" (channel-style groupings)
- Main feed: grid/list toggle of all media, sorted by date added (default)

### 5.2 Search
- Search bar with live filtering as user types
- Filter chips: Video / Audio / Duration / Folder
- Recent searches (local only, stored on-device)

### 5.3 Watch Page
- Player (16:9, expandable to fullscreen, swipe-down to minimize)
- Title, folder/"channel" name, file metadata (resolution, size, date)
- Action row: Favorite, Add to Playlist, Share (local share sheet), Details
- "Up Next" queue (same folder or shuffle logic)
- Notes/bookmarks section (replaces comments) — timestamped personal notes, exportable as `.txt` (copy to clipboard or save to device)

### 5.4 Library
- Tabs: Playlists / History / Watch Later / Folders
- Each folder auto-mapped to a "channel" card on first scan
- User can rename, assign a custom banner/avatar, or merge multiple folders into one channel

### 5.5 Settings
- Storage/folders to include or exclude from scanning
- Channel management: rename folders, assign banners/avatars, merge folders into one channel
- Theme toggle
- Clear cache / rebuild thumbnails
- Default playback speed / quality preferences
- About / storage usage stats

---

## 6. Technical Architecture

**UI layer:** Jetpack Compose, Material 3 components styled to resemble YouTube's visual language (rounded thumbnail cards, bottom nav, chip filters)

**Playback engine:** Media3 (ExoPlayer) — handles PiP, background audio, subtitle rendering, playback speed

**Media indexing:** `MediaStore` API for fast enumeration; fallback manual directory walk for non-standard/user-selected folders (via Storage Access Framework for scoped storage compliance)

**Local persistence:** Room database for:
- Playlists & playlist items
- Watch history & resume positions
- Favorites/tags/custom display names
- Folder "channel" metadata (custom names, banners)

**Thumbnail pipeline:** `MediaMetadataRetriever` to extract a frame (e.g., at 10% duration), cache as compressed JPEG in app-private cache dir, keyed by file URI + last-modified timestamp (to detect changes)

**Permissions required:**
- `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO` (Android 13+)
- `READ_EXTERNAL_STORAGE` (fallback for older versions)
- Optional: `MANAGE_EXTERNAL_STORAGE` if scanning arbitrary folders beyond standard media directories

---

## 7. UI Design Spec — Premium Minimal

**Design direction:** Refined, editorial, less-is-more. High-end feel inspired by Letterboxd and Apple TV+. Generous whitespace, clean typography, no visual clutter.

### Color Tokens

| Token | Value | Usage |
|---|---|---|
| `surface` | `#1A1B1E` | App background |
| `surface-elevated` | `#222428` | Cards, bottom nav, mini-player |
| `on-surface` | `#EAEAEA` | Primary text |
| `on-surface-muted` | `#6B6E76` | Folder/channel name, metadata labels |
| `accent` | `#5BBFB5` | Seek bar, active nav tab, teal highlights |
| `accent-dim` | `#2E5C58` | Resume progress bar overlaid on thumbnails |
| `divider` | `#2A2B2F` | Hairline dividers between sections |

### Typography
- **Font family:** Inter or DM Sans (Google Fonts)
- Video title: `16sp`, weight 500, `on-surface`
- Folder / channel name: `12sp`, weight 400, `on-surface-muted`
- Metadata chips: `11sp`, weight 400, `on-surface-muted`
- Section headers ("Continue Watching" etc.): `13sp`, weight 600, uppercase, tracked

### Cards & Thumbnails
- Thumbnail corners: `8dp` rounded, no border, no drop shadow
- Duration badge: semi-transparent dark pill (`#000000AA`), bottom-right of thumbnail
- Resume progress: thin `accent-dim` bar at bottom edge of thumbnail
- Elevation difference via background color only (`surface` → `surface-elevated`), never box shadows

### Navigation
- Bottom nav: 4 tabs (Home / Search / Library / Settings), icon + label
- Active tab: `accent` tint on icon and label
- Background: `surface-elevated`, thin `divider` hairline on top edge
- Mini-player: slim strip above bottom nav — thumbnail left, title + progress center, play/pause + close right

### Core UI Principles
- Padding: `16–24dp` throughout, never cramped
- Dividers: `0.5dp` hairlines in `divider` color — no heavy card outlines
- Whitespace is a first-class design element
- No glows, no colored borders, no gradient text
- Prefer doing less, visually, but doing it with precision

---

## 8. Data Model (simplified)

```
MediaItem
- id, uri, displayName (editable), folderPath
- durationMs, resolution, fileSizeBytes, dateAdded, dateModified
- thumbnailPath
- isFavorite, customTags[]
- lastPositionMs, playCount

Playlist
- id, name, createdAt
- items: [mediaItemId, order]

Folder ("Channel")
- path, customName, customBannerPath, customAvatarPath, isHidden

WatchHistoryEntry
- mediaItemId, watchedAt, positionMs
```

---

## 8. Success Criteria (v1)

- Cold scan of 500 media files completes indexing + thumbnails in a reasonable time with visible progress
- Playback resumes accurately within 1–2 seconds of last position
- UI navigation requires no explanation for someone familiar with YouTube
- App functions with airplane mode on, zero crashes on missing/corrupt files

---

## 9. Decisions (Resolved)

| Question | Decision |
|---|---|
| How should channels be created? | Auto-created from folders on first scan; user can rename, customize banner/avatar, or merge folders into one channel from Settings |
| Include Shorts vertical feed in v1? | No — deferred to Phase 2 |
| Should notes/bookmarks be exportable? | Yes — export as `.txt` (copy to clipboard or save to device) |
