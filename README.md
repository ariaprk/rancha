# Rancha

An offline personal library and launcher for your games, videos, comics/books and apps. Everything stays on your computer.

> Status: early release (0.1.0). It was built step by step and mostly tested on Windows 11. The Linux version has been prepared but is **not yet tested on real Linux desktops** — bug reports are very welcome.

## What it does
- Four sections: **Games, Video, Reading, Applications**, with nested collections, tags, favorites, search and sorting.
- Launches PC games and apps, and **console games (ROMs)** through emulators (RetroArch cores and standalone emulators).
- Built-in **comic/manga reader** (CBZ, CBR, PDF, image folders) with right-to-left mode, zoom and saved progress.
- **Big Picture** fullscreen mode for a keyboard or gamepad.
- Themes (dark, light, airy), accent colors, icon colors, drag-to-reorder, backup and restore.
- Optional cover search from SteamGridDB (you add your own free API key in Settings; nothing is downloaded unless you ask).

## Download
Go to the **Releases** page and pick your system:

| System | File | Notes |
| --- | --- | --- |
| Windows 10/11 | `Rancha-…-windows-setup.exe` | Installer. |
| Windows | `Rancha-…-windows-portable.exe` | No install, just run. |
| Linux (x86_64) | `Rancha-…-linux-x64.AppImage` | `chmod +x` it, then run. |

### Windows: "Windows protected your PC"
The app is not code-signed (certificates cost money), so SmartScreen warns about unknown apps. Click **More info → Run anyway**. You can build it yourself from source if you prefer.

### Linux notes
- Make the file executable: `chmod +x Rancha-*.AppImage`.
- If it does not start on a recent Ubuntu, try `./Rancha-*.AppImage --no-sandbox` (some systems restrict the browser sandbox used by Electron apps).
- Your data lives in `~/.config/personal-library` (Windows: `%APPDATA%\personal-library`).

## Build from source (owner only)
Needs [Node.js](https://nodejs.org) (LTS, 22 or newer) and git.

    npm install
    npm run dev          # run the app
    npm run typecheck    # check the code
    npm run dist:win     # build the Windows installer (run on Windows)
    npm run dist:linux   # build the Linux AppImage (run on Linux)

Results appear in the `release` folder. On Windows PowerShell use `npm.cmd` instead of `npm` if scripts are blocked.

## Tech
Electron, TypeScript, React, Vite (electron-vite) and Node's built-in SQLite. See `docs/STATUS.md` for the project history.

## License
Copyright (c) 2026 Aria Sama. All rights reserved. The program may be downloaded and used for personal use; the source code is not licensed for copying or reuse (see `LICENSE`). Third-party software: see `THIRD_PARTY_NOTICES.md`.

## Credits
Icons by sonnycandra and Flaticon, from [Flaticon](https://www.flaticon.com) (details in `THIRD_PARTY_NOTICES.md`). Interface font: Poppins (SIL OFL 1.1).
