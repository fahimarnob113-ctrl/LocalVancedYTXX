# LocalTube PC — Build Instructions

Step-by-step guide for building LocalTube on your PC using Google AI Studio.

---

## What You Need Before Starting

| Tool | Why | Download |
|---|---|---|
| **Node.js** | Runs Electron and npm | [nodejs.org](https://nodejs.org) → download LTS version |
| **Google AI Studio** | Generates the code | [aistudio.google.com](https://aistudio.google.com) |
| **A text editor** | Copying files | VS Code, Notepad++, or even plain Notepad |

> [!IMPORTANT]
> Install Node.js first. After installing, open PowerShell and type `node -v` — if it shows a version number (e.g. `v20.11.0`), you're good.

---

## One-Time Setup

1. Create a folder for the app anywhere on your PC:
   ```
   C:\LocalTube\
   ```
   (You can name it anything you want.)

2. That's it. You don't need to install anything else yet.

---

## Step 1 — Paste the Prompt into AI Studio

1. Open [aistudio.google.com](https://aistudio.google.com)
2. Click **New Prompt** (or **Create New** → **Prompt**)
3. Open [`pc-quick-aistudio-prompt.md`](file:///c:/Users/Gulam%20Mustafa/Games/Prd%20YT/pc-quick-aistudio-prompt.md) in your text editor
4. Copy everything inside the code block (the big block between the triple backticks)
5. Paste it into AI Studio
6. **Before hitting Send**, add this message at the end:

   > *"Start with Stage 1 only. Stop after Stage 1 is complete and wait for my confirmation before continuing."*

7. Hit Send / Run

---

## Step 2 — Copy Stage 1 Files to Your Folder

AI Studio will generate **6 files**. For each one:

1. Copy the file content AI Studio gives you
2. Create a new file with that exact filename inside `C:\LocalTube\`
3. Paste the content and save

After Stage 1, your folder should look exactly like this:
```
C:\LocalTube\
├── package.json
├── main.js
├── preload.js
├── index.html
├── renderer.js
└── styles.css
```

> [!NOTE]
> File names are case-sensitive. Use exactly the names AI Studio gives you.

---

## Step 3 — Install Electron and Launch the App

1. Open **PowerShell** or **Command Prompt**
2. Navigate to your LocalTube folder:
   ```powershell
   cd C:\LocalTube
   ```
3. Install Electron (only needed once):
   ```powershell
   npm install
   ```
   > This downloads Electron (~100 MB). It may take a minute or two.
   > A `node_modules` folder will appear — that's normal, don't touch it.

4. Start the app:
   ```powershell
   npm start
   ```
   A desktop window should open. If it does — ✅ Stage 1 is working.

---

## Step 4 — Confirm and Move to the Next Stage

Go back to AI Studio and send:
> *"Stage 1 looks good. Now do Stage 2."*

AI Studio will generate more code for Stage 2.

---

## Repeating the Process (Stages 2–7)

Each stage follows the same pattern:

```
AI Studio generates code
       ↓
Copy updated file(s) into C:\LocalTube\, replacing old versions
       ↓
Save the file(s)
       ↓
Go back to PowerShell and run:  npm start
       ↓
Test that it works
       ↓
Tell AI Studio: "Stage X looks good. Now do Stage X+1."
```

> [!TIP]
> You don't need to run `npm install` again after Stage 1. Only `npm start` each time.

---

## How to Update a File

When AI Studio gives you an updated version of an existing file (e.g. `renderer.js`):

1. Open `C:\LocalTube\renderer.js` in your text editor
2. Select all (`Ctrl+A`) and delete everything
3. Paste the new content from AI Studio
4. Save (`Ctrl+S`)
5. Run `npm start` again

---

## Stages Overview

| Stage | What Gets Built | What to Test |
|---|---|---|
| **1** | App shell — 6 base files, empty window | Window opens with `npm start` |
| **2** | Folder picker, file scanner, db.json save | Add a folder, see files appear |
| **3** | Home screen — grid, shelves, thumbnails | Media cards appear with thumbnails |
| **4** | Watch page — video player, controls, seek | Tap a video, it plays |
| **5** | Mini-player | Navigate away while playing |
| **6** | Search, Library, Settings, Theme toggle | Search filters, playlist creates |
| **7** | Polish — empty states, errors, cleanup | Edge cases don't crash the app |

---

## If Something Goes Wrong

### The window doesn't open after `npm start`
- Look at the error message in PowerShell
- Copy the error and send it to AI Studio: *"I got this error when running npm start: [paste error]. Please fix it."*

### AI Studio cuts off mid-response
- Send: *"You were cut off. Please continue from where you left off."*

### A stage is too big / generates too much at once
- Send: *"That was too long and got cut off. Split Stage X into sub-steps. Do only Stage Xa first and stop."*

### Thumbnails aren't generating
- Send: *"Thumbnails aren't appearing — the hidden video element's 'seeked' event doesn't seem to be firing. Add a 2-second timeout fallback that draws a solid color placeholder instead."*

### A file stops working after an update
- Keep a backup: before replacing a working file, copy its contents somewhere safe so you can revert if needed.

---

## After All 7 Stages — Running the App Daily

Once built, you only ever need:
```powershell
cd C:\LocalTube
npm start
```

Or create a shortcut: right-click `C:\LocalTube` → **New Shortcut** → target:
```
cmd /c "cd /d C:\LocalTube && npm start"
```

---

## File Reference

| File | Purpose |
|---|---|
| [`pc-quick-aistudio-prompt.md`](file:///c:/Users/Gulam%20Mustafa/Games/Prd%20YT/pc-quick-aistudio-prompt.md) | The prompt to paste into AI Studio |
| [`offline-youtube-player-PRD.md`](file:///c:/Users/Gulam%20Mustafa/Games/Prd%20YT/offline-youtube-player-PRD.md) | Full product spec for reference |
| [`index.html`](file:///c:/Users/Gulam%20Mustafa/Games/Prd%20YT/index.html) | Interactive UI mockup — open in browser to preview the design |
