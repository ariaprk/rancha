# Rancha

An offline personal library and launcher for your games, videos, comics/books and apps. Everything stays on your computer.

> The game section of the Linux version has been prepared but is **not yet tested on real Linux desktops** — bug reports are very welcome.

## What it does
- Five sections: **Games, Video, Reading, Applications, Music**, with nested collections, tags, favorites, search and sorting.
- Built-in **video player** (seek, speed, full screen, resume position, next video of the same folder) with external subtitles (.srt, .vtt, .ass/.ssa). It plays what Electron's Chromium can decode; other files can open in the system player.
- Built-in **music player** (mp3, flac, ogg/opus, wav, m4a, aac) with a queue, shuffle, repeat and a small overlay that floats over the library, the reader and Big Picture.
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
| Linux (x86_64) | `Rancha-…-linux-x86_64.AppImage` | `chmod +x` it, then run. |
| Arch Linux (x86_64) | `Rancha-…-linux-x86_64.pkg.tar.zst` | `sudo pacman -U Rancha-*.pkg.tar.zst` |

### Windows: "Windows protected your PC"
The app is not code-signed (certificates cost money), so SmartScreen warns about unknown apps. Click **More info → Run anyway**. You can build it yourself from source if you prefer.

### Linux notes
- Make the file executable: `chmod +x Rancha-*.AppImage`.
- If it does not start on a recent Ubuntu, try `./Rancha-*.AppImage --no-sandbox` (some systems restrict the browser sandbox used by Electron apps).
- Arch Linux: install the package with `sudo pacman -U Rancha-*.pkg.tar.zst`, then start Rancha from the app menu or run `rancha`. Remove it with `sudo pacman -R rancha`.
- Your data lives in `~/.config/rancha` (Windows: `%APPDATA%\rancha`).

## Build from source (owner only)

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
    npm run dist:linux   # build the Linux AppImage and Arch package .pkg.tar.zst (run on Linux)

Results appear in the `release` folder.

### Common problems
- `electron-vite: command not found` (or `electron-builder: command not found`): the dependencies are not installed. Run `npm ci` in the project folder, then try again.
- `npm ci` fails because `package-lock.json` does not match `package.json`: run `npm install` instead.
- On Windows PowerShell, use `npm.cmd` instead of `npm` if scripts are blocked.
- The first build is slow because Electron and the packaging tools are downloaded. Later builds use the cache.

## Rancha Qt (the new native version, in progress)

The `rancha-qt/` folder holds a rewrite of Rancha in **C++20 and Qt 6 (Qt Quick / QML)**. It is built for Windows and Linux at the same time. The Electron app above is unchanged and is still the version that gets released. The Qt version is for testing only for now.

- What works so far, step by step: `rancha-qt/docs/MILESTONES.md`. Finished steps are marked **Done (انجام شده)**.
- What was checked and what was **not**: `rancha-qt/docs/STATUS.md`.
- Layout: `core/` holds everything that does not need Qt (data, search, sorting) and is tested without a window. `app/` holds the window and QML. `tests/` holds the core tests.

> **Back up your data first.** The Qt version opens the **same library** as the Electron app (`%APPDATA%\rancha` on Windows, `~/.config/rancha` on Linux) and saves changes there, such as favorites and the look settings. Copy that folder somewhere safe before you test. To look around without touching your library, click the **Sample** chip at the bottom of the sidebar.

### What you need
- **CMake 3.21 or newer**, a **C++20 compiler** and **Qt 6.8 or newer** (the Qt Base and Qt Declarative modules).
- To build only the core and its tests you do not need Qt (see "Core only" below).
- Every command below is run from the `rancha-qt` folder.

### Windows (PowerShell)
1. Install **Visual Studio 2022 Build Tools** with the workload "Desktop development with C++". It includes MSVC and CMake.
2. Install **Qt 6.8 or newer** for "MSVC 2022 64-bit". Use either:
   - the official Qt Online Installer (needs a free Qt account), or
   - aqtinstall: `pip install aqtinstall`, then `aqt install-qt windows desktop 6.8 win64_msvc2022_64 -O C:\Qt`.
3. Tell CMake where Qt is. Change the version folder to what is really there (check with `dir C:\Qt`):

       $env:QT_ROOT_DIR = "C:\Qt\6.8.3\msvc2022_64"
       $env:PATH = "$env:QT_ROOT_DIR\bin;$env:PATH"

4. Build, test and run:

       cmake --preset windows
       cmake --build build/windows --config Release
       ctest --test-dir build/windows -C Release --output-on-failure
       .\build\windows\app\Release\rancha.exe

5. If `rancha.exe` complains about missing Qt DLLs (or nothing happens), copy Qt next to it once, then run it again:

       windeployqt --qmldir app\qml build\windows\app\Release\rancha.exe

- SQLite does not need to be installed: on Windows the copy in `third_party/sqlite` is built in automatically.
- Open a **new** PowerShell window for each session and set the two `$env:` lines again (they are not saved).

### Linux
1. Install the tools:
   - Arch: `sudo pacman -S base-devel cmake ninja qt6-base qt6-declarative sqlite`
   - Fedora: `sudo dnf install cmake ninja-build gcc-c++ qt6-qtbase-devel qt6-qtdeclarative-devel sqlite-devel`
   - Debian/Ubuntu: the distribution's Qt may be older than 6.8. Get Qt with aqtinstall instead (`aqt install-qt linux desktop 6.8 linux_gcc_64 -O ~/Qt`), then `export QT_ROOT_DIR=~/Qt/6.8.3/gcc_64`. Install `build-essential cmake ninja-build libsqlite3-dev` from apt.
2. Build, test and run:

       cmake --preset linux
       cmake --build build/linux
       ctest --test-dir build/linux --output-on-failure
       ./build/linux/app/rancha

- Without SQLite installed, add `-DRANCHA_BUNDLED_SQLITE=ON` to the first command to use the built-in copy.
- After you pull new changes, only `cmake --build build/linux` and the commands after it are needed.

### Core only (no Qt, any system)
    cmake --preset core-only
    cmake --build build/core-only
    ctest --test-dir build/core-only --output-on-failure

The last line of the test output must say `... checks, 0 failed`.

### What to try (current step: Q5, search and filters)
- The window opens, and the sidebar shows Home, All items, Favorites, Recent and the five sections.
- Search: type at Home, then inside a folder. While you search inside a folder, the chip next to the box switches between **Everywhere** and **Only here**. `Ctrl+K` jumps to the box and `Esc` clears it.
- Tags: open the tag menu and pick one tag, then a second one. Only items that have **all** the picked tags stay. "Clear tags" resets the filter.
- **All items**, **Favorites** and **Recent**: each shows a flat list. The title shows the count, and each card says which folder the item is in.
- Change the sort on each page. Remove a star on the Favorites page and check that the item leaves the list.
- Speed: click the **50 000** chip in the sidebar, then search and scroll. Both should stay smooth.
- If something fails, send a screenshot and the text printed in the terminal (start the app from the terminal to see it).

## Tech
Electron, TypeScript, React, Vite (electron-vite) and Node's built-in SQLite. See `docs/STATUS.md` for the project history.
The Qt version (`rancha-qt/`): C++20, Qt 6 Quick/QML, CMake, SQLite and nlohmann/json.

## License
Copyright (c) 2026 Aria Sama. All rights reserved. The program may be downloaded and used for personal use; the source code is not licensed for copying or reuse (see `LICENSE`). Third-party software: see `THIRD_PARTY_NOTICES.md`.

## Credits
Icons by sonnycandra and Flaticon, from [Flaticon](https://www.flaticon.com) (details in `THIRD_PARTY_NOTICES.md`). Interface font: Poppins (SIL OFL 1.1).
