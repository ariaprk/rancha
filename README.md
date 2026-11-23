# Rancha
<img width="500" height="500" alt="rancha" src="https://github.com/user-attachments/assets/a84660be-dbaa-425c-b62a-bc1379055f8d" />

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
| Linux (x86_64) | `Rancha-…-linux-x64.tar.gz` | Extract it, then run `rancha` inside the folder. |

### Windows: "Windows protected your PC"
The app is not code-signed (certificates cost money), so SmartScreen warns about unknown apps. Click **More info → Run anyway**. You can build it yourself from source if you prefer.

### Linux notes
- Make the file executable: `chmod +x Rancha-*.AppImage`.
- If it does not start on a recent Ubuntu, try `./Rancha-*.AppImage --no-sandbox` (some systems restrict the browser sandbox used by Electron apps).
- Prefer no AppImage? Use the `.tar.gz`: `tar -xzf Rancha-*.tar.gz`, then run `./rancha` from the extracted folder (the same `--no-sandbox` tip applies).
- Your data lives in `~/.config/personal-library` (Windows: `%APPDATA%\personal-library`).

## Build from source

### What you need
- [Node.js](https://nodejs.org) **22 or newer** (LTS). npm comes with it. The release builds use Node 22. Check with `node -v`.
- git.
- The system you are building for: build the Windows files on Windows and the Linux files on Linux (x86_64).
- Internet for the first install and build. npm downloads Electron, and electron-builder downloads its packaging tools.

You do **not** need to install Electron, electron-vite, electron-builder or TypeScript globally. `npm ci` puts them in `node_modules` for this project.

### Steps
Run these inside the project folder:

    npm ci               # install the exact versions from package-lock.json (do this first)
    npm run dev          # run the app
    npm run typecheck    # check the code
    npm run dist:win     # build the Windows installer and portable .exe (run on Windows)
    npm run dist:linux   # build the Linux AppImage and tar.gz (run on Linux)

Results appear in the `release` folder.

### Common problems
- `electron-vite: command not found` (or `electron-builder: command not found`): the dependencies are not installed. Run `npm ci` in the project folder, then try again.
- `npm ci` fails because `package-lock.json` does not match `package.json`: run `npm install` instead.
- On Windows PowerShell, use `npm.cmd` instead of `npm` if scripts are blocked.
- The first build is slow because Electron and the packaging tools are downloaded. Later builds use the cache.

## Tech
Electron, TypeScript, React, Vite (electron-vite) and Node's built-in SQLite. See `docs/STATUS.md` for the project history.

## License
Copyright (c) 2026 Aria Sama. All rights reserved. The program may be downloaded and used for personal use; the source code is not licensed for copying or reuse (see `LICENSE`). Third-party software: see `THIRD_PARTY_NOTICES.md`.

## Credits
Icons by sonnycandra and Flaticon, from [Flaticon](https://www.flaticon.com) (details in `THIRD_PARTY_NOTICES.md`). Interface font: Poppins (SIL OFL 1.1).
