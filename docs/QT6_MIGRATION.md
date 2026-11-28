# Rancha → C++ / Qt6 rewrite: hand-off plan

Written 2026-11-27 for the owners (MrJavadGG, Aria) and for any Claude agent that continues the work.
**If you are an agent: read this whole file before doing anything, then go to the checklist (section 12) and continue at the first unchecked step.**
Update the checklist and the "Log" (section 13) after each step you finish.

---

## 0. TL;DR

- Rancha (v1.1.1) is an Electron + React + TypeScript app. It is going to be rewritten in **C++17/20 + Qt 6 (QML/Qt Quick for the UI)**.
- The main reason is the **built-in video player**. Chromium's `<video>` cannot play many anime files (HEVC/x265 on Linux, MKV, AC3/DTS audio, embedded and styled ASS subtitles). The workaround was converting the video with ffmpeg on the fly, which used a lot of CPU and RAM. The second reason is the general slowness and high RAM use of Electron.
- Recommended video and music engine: **libmpv** embedded in Qt Quick. It gives hardware decoding (VAAPI/NVDEC on Linux, D3D11VA on Windows), all common codecs and containers, full ASS subtitles through libass, audio and subtitle track choice, and chapters. It also gives gapless audio for the music player.
- Qt Multimedia (FFmpeg backend since Qt 6.5) was the fallback. It plays HEVC/MKV, but its ASS subtitle support is weak. **Decided 2026-11-27: libmpv for video and music** (section 13).
- **The port has already started:** Aria's `rancha-qt/` folder (C++20, Qt Quick, milestones Q1–Q2.1 done). Continue from it. Its state, the differences from this plan and the roadmap are in **section 14**.
- The Electron app no longer has a built-in video player (commit `53621e3`): videos open in the system's default player until the Qt player exists.
- The new app **must open the existing user data** (`library.db` schema v11, `settings.json`, `covers/` …) in the same data folder. Users must not lose their library.
- The license is proprietary (`UNLICENSED`). Every third-party library must therefore be used under LGPL/permissive terms with **dynamic linking**. No GPL builds of mpv/FFmpeg may be shipped. See section 9.

---

## 1. Rules for whoever continues (owner preferences)

1. Talk to the owner (MrJavadGG) in **Persian**. Code, comments and docs in the repo stay in English, like the rest of the repo.
2. After finishing **each file**, give a short progress report (what is done, what is next). That way the work can resume if the session is cut.
3. If you need to check or verify something and cannot (no access, tool failure, missing file), **stop and ask**. Never guess and continue.
4. You may fix related problems you notice beyond the literal task, but **always say what you did**.
5. The owner's computer runs **Arch Linux + KDE Plasma**, not Windows, even if the client calls the device "windows". Give `pacman` commands, not `apt`. Windows builds are made by GitHub Actions or by Aria.
6. Commit or push only when the owner asks. The working branch is `collab`; PRs go into `main`.
7. Never copy code or design from GPL projects (for example Tauon Music Box, mpv's GPL-only parts, or other players). Take ideas only. The project license does not allow GPL code.
8. Mark clearly what is **verified** (built, run, tested) and what is **not verified**, the same way `docs/STATUS.md` does.

---

## 2. Current state of the Electron app (what must be rebuilt)

Repo: `/home/MrJavadGG/gitJ/rancha` (GitHub `ariaprk/rancha`, private). Last release **v1.1.1**. The history of every feature is in `docs/STATUS.md`. It is the most detailed spec of behaviour, so read it when you build a feature.

### 2.1 Layers today
renderer (React) → preload bridge (`src/preload`) → IPC (`src/main/ipc.ts`, channel names in `src/shared/ipc.ts`) → services/repository (`src/main/*`) → SQLite (`node:sqlite`).

### 2.2 Sections and features (all must exist in the Qt version)
- Five sections: **Games, Video, Reading, Applications, Music**. Each has nested collections, tags, favorites, search, sorting, "recent", and a done/watched/read status.
- Views: cover grid, compact grid, detailed list, card-size slider, custom order with drag-to-reorder, and drag-to-move onto folders, sidebar and breadcrumbs.
- Item form: name, location, description, tags, cover (crop dialog), wallpaper, placeholder colour. Bulk tagging. Folder import with a tree preview. Drag files in from the file manager.
- Covers: copied and resized into `covers/`. Automatic covers (exe icons, the first comic page, a video frame) are kept in `cover-cache/`. Online search (SteamGridDB, TMDB, AniList, TVmaze) runs only on request, with the user's own API keys.
- Launcher: PC games and apps (`.exe`, `.lnk`, `.bat`, `.url` on Windows; executables and `.desktop` files on Linux). The full-screen game screen shows the wallpaper. **Emulators**: RetroArch cores and standalone emulator profiles (`emulators` in settings, `emulator`/`core` columns).
- Reader: CBZ, CBR, PDF and image folders. Single or double page, page-flip effect, right-to-left, zoom/fit, saved progress (`reading_progress` table). Multi-chapter comics become a collection of chapters, using the chapter separator `\u001f` in `target` (see `src/shared/chapterTarget.ts`).
- Video player: **removed from the Electron app in `53621e3` (Aria, 2026-11-26); videos now open in the system's default player.** The Qt app gets a new libmpv player (Q13). What the old player had, as the spec for the new one: seek, speed, ±10 s, volume, full screen, auto-hiding bars, keyboard shortcuts (list in STATUS.md §9z33), next/previous video in the folder, auto-next, 90% = watched, resume position, external subtitles (.srt/.vtt/.ass/.ssa; Persian/Arabic code page detection; delay, size, box). Open in the system player as an alternative.
- Music player: mp3/flac/ogg/opus/wav/m4a/aac. Tags and embedded covers are read from the files (`musicTags.ts`, `musicTagsContainers.ts`, cached in `song-info.json`). The queue (`upNext`) is index-based and allows duplicates; songs are added with middle-click; drag to reorder. Shuffle, repeat, autoplay next. A floating mini player (small/expanded, chosen corner) shows over the library, the reader and Big Picture. Music page: three resizable panes (queue / song list / now playing). The song list has chosen, sortable, resizable columns. System media controls (MediaSession → on Linux **MPRIS**, on Windows **SMTC**).
- **Big Picture**: XMB-style full-screen mode for gamepad and keyboard (`gamepad.ts`, `bigPicture.ts`).
- Settings: themes dark/light/airy, accent gradients, icon tone, UI scale, corners, glass blur, ambient glow, motion level, sounds, reader defaults, video/music options. Full list: `AppSettings` in `src/shared/settings.ts`. Every value is cleaned by `sanitizeSettings`.
- Backup and restore (manual and automatic at startup, kept in `backups/`).
- A custom frameless window with its own window controls; the window size and position are remembered (`window.json`).

### 2.3 Code size (for estimating)
About 23,000 lines. The biggest files are `styles.css` (3,058), `App.tsx` (1,521), `ReaderView.tsx` (789), `itemRepository.ts` (702), `ipc.ts` (671), `ItemDialog.tsx` (598), `SettingsPage.tsx` (532), `BigPicture.tsx` (493) and `VideoPlayer.tsx` (463).

---

## 3. Why the rewrite, and what it fixes

| Problem today | Cause | In Qt + libmpv |
| --- | --- | --- |
| HEVC/x265, MKV, AC3/DTS, AVI/WMV fail or need conversion | Chromium only decodes what it ships with plus what the OS and GPU offer | libmpv/FFmpeg decodes them directly, with hardware decoding. No conversion. |
| On-the-fly conversion uses a lot of CPU and RAM | ffmpeg converts the whole stream | Not needed any more |
| ASS styling lost, no embedded subtitles, no audio track choice | The subtitles are drawn by our own code over `<video>` | libass draws them exactly; tracks come from mpv's `track-list` |
| High RAM use and slow start | Several Chromium processes | One native process. **The real numbers must be measured** (step 19). They are not promised here. |
| Seek bugs (custom Range handling in `fileRange.ts`) | Electron's `net.fetch` on `file://` | Not needed. mpv and Qt read files directly. |

The speed gain is **not automatic**. Big lists must use Qt model/view (`QAbstractListModel` + `ListView`/`GridView`/`TableView`, which create only visible delegates). Covers must load asynchronously as small cached thumbnails (`QQuickAsyncImageProvider` or `Image { asynchronous: true; sourceSize: … }`).

---

## 4. Target architecture

> **Note (2026-11-27):** this tree was the first idea, written before Aria's port was known. The real layout is `rancha-qt/` (`core/` without Qt, `app/` with Qt Quick, `tests/`). Where the two differ, `rancha-qt/` wins; see section 14.3. The module names below are still a useful list of what has to be built.

```
rancha/
├── CMakeLists.txt                 # top-level, Qt 6 (qt_standard_project_setup)
├── CMakePresets.json              # linux-debug, linux-release, windows-release
├── app/
│   ├── main.cpp                   # QGuiApplication, data folder, single instance, QML engine
│   ├── core/                      # no Qt GUI types here (testable)
│   │   ├── AppInfo.h              # APP_NAME "Rancha", APP_ID "rancha"  (never change APP_ID)
│   │   ├── DataPaths.*            # %APPDATA%\rancha  /  ~/.config/rancha
│   │   ├── Database.*             # open, WAL, foreign keys, migrations v1..v11(+), backup before upgrade
│   │   ├── ItemRepository.*       # every query from itemRepository.ts
│   │   ├── Settings.*             # settings.json, defaults + sanitize (port of shared/settings.ts)
│   │   ├── Backup.*               # backup.ts (create, staged restore, auto backup)
│   │   ├── Covers.*               # covers/ + cover-cache/, resize/crop/encode (QImage)
│   │   ├── FolderScan.*           # folderScan.ts, fileKinds.ts, natural sort
│   │   ├── Launcher.*             # launcher.ts, platformLaunch.ts, emulatorLaunch.ts (QProcess)
│   │   ├── MusicTags.*            # TagLib (replaces musicTags*.ts) + song-info.json cache
│   │   ├── Subtitles.*            # finding external subtitle files + encoding detection
│   │   ├── Reader/                # CBZ/CBR/PDF/image-folder page sources (libarchive, QtPdf)
│   │   └── Online/                # SteamGridDB, TMDB, AniList, TVmaze (QNetworkAccessManager)
│   ├── models/                    # QAbstractListModel / QSortFilterProxyModel for QML
│   │   ├── LibraryModel.*         # items of a folder + search + sort + tag filter
│   │   ├── SongListModel.*        # music columns, sort, widths
│   │   └── QueueModel.*           # index-based queue (duplicates allowed)
│   ├── player/
│   │   ├── MpvObject.*            # QQuickFramebufferObject (or QQuickRhiItem) wrapping libmpv render API
│   │   ├── VideoController.*      # playlist of the folder, resume, watched at 90%, tracks
│   │   ├── MusicPlayer.*          # its own mpv handle (audio only, gapless), queue, shuffle, repeat
│   │   └── MediaControls.*        # MPRIS (QtDBus) on Linux, SMTC on Windows
│   ├── platform/                  # frameless window helpers, file icons, gamepad
│   └── qml/                       # UI (Qt Quick Controls 2, own style matching the current theme)
│       ├── Main.qml, Theme.qml (singleton: colours, accent gradients, corners, glass, motion)
│       ├── Sidebar, Toolbar, Breadcrumbs, LibraryGrid, LibraryList, ItemDialog, CropDialog,
│       ├── ReaderView, VideoPlayer, MusicPage, MiniPlayer, BigPicture, SettingsPage, ...
├── tests/                         # Qt Test: migrations, repository, settings sanitize, scan, queue
├── packaging/                     # windows (NSIS or Qt IFW), linux (AppImage), arch (PKGBUILD)
└── legacy-electron/  (or keep the Electron app on a branch, see step 5)
```

Main choices (some are open decisions, see step 4):
- **UI: Qt Quick/QML**, not Qt Widgets. The current look (glass, gradients, animations, cards) is much easier to build in QML. All logic lives in C++, and QML only shows it.
- **Database: SQLite** through `QtSql` (QSQLITE driver) or the SQLite C API directly. Keep the **same schema and `PRAGMA user_version`**.
- **Video and music: libmpv** (render API, OpenGL). Note: since Qt 6 Qt Quick uses RHI (Vulkan/D3D11/Metal/GL). The mpv OpenGL render API needs Qt Quick forced to OpenGL (`QQuickWindow::setGraphicsApi(QSGRendererInterface::OpenGL)`) or interop. **Verify this with a prototype (step 6) before building on it.**
- **Tags and covers of music: TagLib** (LGPL/MPL). Or read tags with mpv/FFmpeg metadata; decide in step 4.
- **Comics: libarchive** (CBZ/CBR/CB7; check RAR5 support with real files). **PDF: QtPdf** (PDFium, BSD-style). Do **not** use Poppler (GPL).
- **Gamepad: SDL2/SDL3 gamecontroller** (zlib license). Qt 6 has no Qt Gamepad module.
- **Network: QNetworkAccessManager**, only when the user presses "Search online" (the app stays offline otherwise).

---

## 5. Data compatibility (must not break)

The new app opens the old data in place. Data folder: `app.getPath('appData')/rancha` →
- Windows: `%APPDATA%\rancha`
- Linux: `~/.config/rancha` (follow `XDG_CONFIG_HOME` if set; verify what Electron used).

| File/folder | Contents | What the Qt app must do |
| --- | --- | --- |
| `library.db` | SQLite, WAL mode, foreign keys ON, `PRAGMA user_version` = **11** | Open and use as is. Port every migration (v1–v11 in `src/main/db/database.ts`) so older libraries still upgrade. Copy the file to `backups/library-before-upgrade-v<N>.db` before any upgrade. **Refuse a database newer than the app knows.** |
| `settings.json` | `AppSettings` JSON | Read the same keys; unknown or bad values go through the ported `sanitizeSettings`. New keys get defaults. |
| `covers/` | `<uuid>.jpg` covers and wallpapers | Same names, same rules (max 600×900 JPEG). Remove unused covers at startup. |
| `cover-cache/` | automatic covers | Can be rebuilt, but reuse it if the format is the same. |
| `song-info.json` | cached music tags | Can be rebuilt; reuse it if possible. |
| `window.json` | window size and position | Same purpose; a new format is fine. |
| `backups/`, `backup-info.json` | manual and automatic backups (`library.db` + `covers` + `settings.json`) | Same layout, so old backups can be restored. |
| Video resume positions | **localStorage inside Electron's profile** (`src/renderer/src/lib/videoResume.ts`) | **Decided 2026-11-27: dropped.** The Electron player was removed in `53621e3`, so no new positions are written; the old ones stay unread in Electron's profile. The Qt player stores its own positions (database or json) from the start. Say so in the 2.0.0 release notes. |

Schema essentials (full text in `database.ts`):
- `items(id TEXT PK, parent_id → items ON DELETE CASCADE, kind IN ('collection','launchable','video','readable','audio'), name, description, target, cover_path, icon_path, hue, sort_order, is_favorite, created_at, updated_at, last_opened_at, meta JSON, is_done, wallpaper_file, emulator, core)`, plus indexes `idx_items_parent` and `idx_items_parent_order`.
- `item_tags(item_id, tag)`, PK (item_id, tag).
- `reading_progress(item_id PK, page, page_count, direction 'ltr'|'rtl', updated_at)`.
- The main sections are created by `ensureMainSections`; port it.
- Readable items with chapters: `target = "<book path>\u001f<folder inside>"`.
- Timestamps are milliseconds (JavaScript `Date.now()`); keep milliseconds.

`APP_ID` stays `'rancha'`. **Never change it.**

---

## 6. Old file → new module map

| Electron file(s) | Qt replacement |
| --- | --- |
| `src/main/index.ts` (app start, protocols, window) | `app/main.cpp`. The `library-cover://`, `library-video://`, `library-audio://` and `reader` schemes are not needed: QML gets a `QQuickImageProvider` for covers and pages, and mpv gets the file path. Keep the rule that the UI asks **by item id**, never with a raw path. |
| `appInfo.ts` | `core/AppInfo.h` |
| `db/database.ts`, `db/itemRepository.ts`, `db/sampleLibrary.ts` | `core/Database`, `core/ItemRepository` (the sample library runs only for a brand-new database) |
| `ipc.ts`, `preload/*`, `shared/ipc.ts` | Gone. Exposed as `Q_INVOKABLE` methods and properties of C++ objects registered with `QML_ELEMENT` / `QML_SINGLETON`. Use the channel list as the checklist of operations: `library:list/create/update/delete/move/reorder/bulk/setFavorite/open/reveal/checkTargets/importPaths/importTree/scanFolder`, `cover:save/auto/saveAuto`, `wallpaper:save`, `dialog:pick*`, `files:icons`, `backup:*`, `emulator:cores/coresFor`, `music:songInfo`, `online:search/images/download`, `reader:openBook/close/pagePreview/pdfRange/saveState/openPdfWindow`, `settings:get/update/reset`, `video:subtitles/pickSubtitle`, `window:control/isMaximized/maximizedChanged`, `app:info`. |
| `settingsStore.ts`, `shared/settings.ts`, `validate.ts` | `core/Settings` (defaults and sanitizing ported **exactly**; keep the ranges such as `MUSIC_PANE_RANGE` and `MUSIC_COLUMN_WIDTH_RANGE`) |
| `backup.ts` | `core/Backup` |
| `covers.ts`, `autoCovers.ts`, `cropMath.ts`, `imagePreview.ts`, `iconCache.ts` | `core/Covers` + `QImage`; exe icons via `QFileIconProvider` (Windows) and the icon theme or `.desktop` files (Linux) |
| `folderScan.ts`, `fileKinds.ts`, `pathKey.ts`, `scanTree.ts` | `core/FolderScan` (use `QCollator` with `numericMode` for natural order "2 before 10") |
| `launcher.ts`, `platformLaunch.ts`, `emulatorLaunch.ts`, `shared/emulators.ts` | `core/Launcher` (`QProcess::startDetached`, `QDesktopServices::openUrl`) |
| `musicTags.ts`, `musicTagsContainers.ts`, `songInfo.ts` (main + renderer), `shared/audio.ts` | `core/MusicTags` (TagLib) + cache |
| `subtitleFiles.ts`, `shared/subtitles.ts` (deleted in `53621e3`; read them with `git show aa012f7:src/main/subtitleFiles.ts` and `git show aa012f7:src/shared/subtitles.ts`) | `core/Subtitles` only **finds** files and detects encodings. Parsing and drawing are done by mpv (`sub-add`, `sub-codepage`). |
| `fileRange.ts` | Gone |
| `reader/*`, `pdfBook.ts`, `pageProvider.ts`, `pageFlip.ts`, `readerMath.ts`, `pdfMath.ts`, `useBook.ts`, `shared/reader.ts`, `chapterTarget.ts` | `core/Reader/*` + `qml/ReaderView.qml` |
| `onlineArt.ts`, `steamGridDb.ts`, `shared/online.ts` | `core/Online/*` |
| `windowState.ts`, `WindowControls.tsx` | Frameless `Window` + `startSystemMove()`/`startSystemResize()` (works on KDE Wayland and Windows) |
| `VideoPlayer.tsx`, `videoResume.ts` (both deleted in `53621e3`; read with `git show aa012f7:src/renderer/src/components/VideoPlayer.tsx`), `shared/video.ts` | `player/MpvObject`, `player/VideoController`, `qml/VideoPlayer.qml` |
| `usePlayer.ts`, `shared/playerQueue.ts`, `queue.ts`, `MusicControls.tsx`, `MusicPage.tsx`, `MusicList.tsx`, `musicColumns.ts`, `MiniPlayer.tsx`, `BpMusicPanel.tsx`, `Slider.tsx`, `Marquee.tsx`, `SongText.tsx`, `middleClick.ts` | `player/MusicPlayer`, `models/QueueModel`, `models/SongListModel`, QML music views |
| `gamepad.ts`, `gamepadMath.ts`, `bigPicture.ts`, `BigPicture.tsx` | `platform/Gamepad` (SDL) + `qml/BigPicture.qml` |
| `libraryQuery.ts`, `selection.ts`, `reorderDrag.ts`, `reorderMath.ts`, `virtualMath.ts`, `VirtualItems.tsx`, `wheelMath.ts` | `models/LibraryModel` + proxy models. Virtualisation comes free with `ListView`/`GridView`. |
| `styles.css`, `accent.ts`, `MaskIcon.tsx`, fonts, icons | `qml/Theme.qml` singleton; icons through `MultiEffect` masks or `ShaderEffect`; Poppins loaded with `FontLoader` |
| `sound.ts` | `QSoundEffect` |
| All other `components/*.tsx` | One QML file each, same names where possible |

---

## 7. Video player details (the main reason for the rewrite)

- One `mpv_handle` per video window, rendered through `mpv_render_context` (OpenGL) inside a `QQuickFramebufferObject`. The public example for this is `mpv-examples/libmpv/qt_opengl`; **only read it for the API, do not copy it** (check its license first).
- Options to start with (verify each one in the prototype): `hwdec=auto-safe`, `vo=libmpv`, `keep-open=yes`, `sub-auto=fuzzy` (or our own finder), `sub-codepage=auto`, `audio-display=no`, `input-default-bindings=no`, `osc=no`. Our own QML draws all the controls.
- Tracks: read `track-list` and offer audio and subtitle choice in the UI (new feature). Embedded ASS in MKV and fonts from MKV attachments then work by themselves.
- Keep every feature from STATUS.md §9z33: shortcuts, ±10 s, speed, subtitle delay (`sub-delay`), size (`sub-scale`), box (`sub-back-color`/`sub-border-style` for SRT; ASS keeps its own style), next/previous in the folder, auto-next, 90% = watched, resume (`start=` or `time-pos`).
- Errors: if mpv reports an error, show it and offer "Open with the system player".
- **Delete** all ffmpeg conversion code and do not ship a separate ffmpeg program.

## 8. Music player details

- A separate audio-only mpv handle (`vid=no`, `gapless-audio=yes`), so music and video never fight. Starting a video pauses the music (as today).
- The queue (`upNext`) is **index-based and allows duplicates**. Play now, move and remove are done **by position**. Queued songs play first, then the folder continues (see STATUS.md 1.0.0 and 1.1.0).
- The song list: columns `cover, title, artist, album, albumArtist, year, genre, track, disc, duration, fileName, added, tags`, sorting (`musicSort`), widths (`musicColumnWidths`, never for cover and title), pane widths (`musicQueueWidth`, `musicNowWidth`). Use Qt Quick `TableView` + `HorizontalHeaderView` or a custom header with resize handles.
- Slider behaviour: click, drag and the wheel all work; no focus ring; a time bubble; the seek bar follows a smooth clock every frame and never jumps back after a click.
- Media keys: MPRIS on Linux (KDE shows it in the tray), SMTC on Windows.

---

## 9. Licenses (read before choosing or shipping any library)

The Rancha license is proprietary (see `LICENSE`). This means:

| Component | License | Condition for us |
| --- | --- | --- |
| Qt 6 (open-source) | LGPLv3 (some modules GPL only!) | **Dynamic linking only.** Ship the license texts. Users must be able to replace the Qt libraries. **Use only modules available under LGPL**; check each module before using it. Qt Quick, Controls, Sql, Network, Pdf, Multimedia and DBus are expected to be LGPL. Verify, for example, Qt Charts and Qt Virtual Keyboard are GPL. |
| libmpv | GPLv2+ by default, **LGPLv2.1+ when built with `-Dgpl=false`** | Must be an **LGPL build**, dynamically linked. The usual prebuilt Windows dev builds and distribution packages may be GPL builds. **Verify the exact build used.** |
| FFmpeg (inside mpv) | LGPLv2.1+ unless `--enable-gpl`/`--enable-nonfree` | LGPL build only: no x264, x265 or other GPL parts (we only decode, so they are not needed). |
| libass | ISC | Fine |
| TagLib | LGPLv2.1 / MPL 1.1 | Dynamic linking |
| libarchive | BSD-2 | Fine |
| QtPdf (PDFium) | BSD-style / Apache | Fine |
| SDL2/SDL3 | zlib | Fine |
| SQLite | public domain | Fine |
| Poppins font, Flaticon icons | OFL 1.1 / Flaticon attribution | Keep the attribution (already in `THIRD_PARTY_NOTICES.md`) |
| Tauon Music Box and other GPL apps | GPL | **Ideas only, never code or assets** |

- The Arch package depends on the system's `qt6-*`, `mpv` (libmpv), `taglib` and so on. **Check whether Arch's `mpv` package is built as GPL.** Whether a proprietary program may dynamically link a GPL library packaged by the distribution must be decided by the owner (step 4). The safe choice is to bundle our own LGPL libmpv. **Decided 2026-11-27: bundle our own LGPL libmpv** (Windows and the Arch package). The system `mpv` package on Arch may be used for local development and tests only; it is never what we ship.
- Electron/React/Vite/pdfjs/node-unrar-js leave `THIRD_PARTY_NOTICES.md`; the table above replaces them.
- **None of the license facts in this section were checked against the official texts while writing this file.** Step 3 of the checklist is to verify them.

---

## 10. Build, packaging and release

Today: `.github/workflows/ci.yml` (npm ci, typecheck, build) and `.github/workflows/release.yml`:
- The release starts on a pushed tag `v*`, which must equal `version` in `package.json`.
- It builds on `windows-latest` and `ubuntu-latest`.
- The Linux runner installs `libarchive-tools zstd` (bsdtar for the pacman package; fixed in a9ca8ed).
- It uploads `*.exe`, `*.AppImage` and `*.pkg.tar.zst`.
- `docs/RELEASE_NOTES_<tag>.md` becomes the release text.
- With `RELEASES_REPO` + `RELEASES_TOKEN` (docs/RELEASING.md) the files go to a public releases repository.

New:
- **Version source:** `project(Rancha VERSION 2.0.0)` in `CMakeLists.txt` (major version: new engine). Change the tag check in release.yml to read the CMake version instead of package.json.
- **CI:** configure + build + `ctest` on Linux and Windows (e.g. `jurplel/install-qt-action` or aqtinstall for Qt; pin the Qt version).
- **Windows:** MSVC build, `windeployqt --qmldir app/qml`, copy `libmpv-2.dll` (LGPL build) and the other DLLs. Installer with NSIS (or Qt Installer Framework) **plus** a portable zip/exe. Keep the names `Rancha-<v>-windows-setup.exe` and `Rancha-<v>-windows-portable.*`.
- **Linux AppImage:** `linuxdeploy` + `linuxdeploy-plugin-qt`, bundling libmpv. Name `Rancha-<v>-linux-x86_64.AppImage`.
- **Arch package:** a `packaging/arch/PKGBUILD`. Build it with `makepkg` in an `archlinux:latest` container on the runner (more correct than fpm). Depends on things like `qt6-base qt6-declarative qt6-multimedia? qt6-svg mpv taglib libarchive sdl2`; finalize the list. Name `Rancha-<v>-linux-x86_64.pkg.tar.zst`. Install the `.desktop` file with `StartupWMClass=rancha` and set `QGuiApplication::setDesktopFileName("rancha")`. This fixes the electron-builder `desktopName` warning in the new app.
- Keep the release-notes and RELEASES_REPO logic as it is.
- Remove `package.json`, `package-lock.json`, `electron.vite.config.ts`, `tsconfig*.json`, `.nvmrc` and the npm part of `.github/dependabot.yml` only **when the Qt app replaces the Electron app** (step 18). Keep `github-actions` in Dependabot.

### README.md changes (step 17)
- The "video player" line: remove "It plays what Electron's Chromium can decode". Say that it plays almost every format (MKV, HEVC/x265, AV1 …) with hardware decoding, embedded and ASS subtitles, and audio/subtitle track choice.
- "Linux notes": remove the `--no-sandbox` tip (Electron only). Add the Arch dependencies if any are not bundled.
- "Build from source": replace Node/npm with: CMake ≥ 3.21 (verify), a C++ compiler (MSVC 2022 / GCC / Clang), Qt 6.x (pin the version), libmpv (LGPL build), TagLib, libarchive, SDL. Give the Arch line (`sudo pacman -S cmake qt6-base qt6-declarative … mpv taglib libarchive sdl2`) and the Windows steps. Give the build commands (`cmake --preset linux-release && cmake --build --preset linux-release`).
- "Tech": C++, Qt 6 (Qt Quick), libmpv, SQLite, TagLib.
- Data folder line: unchanged.
- Release notes for 2.0.0: new engine; data is kept (automatic backup before upgrade); what is lost (video resume positions, if step 4 decides so); known limits.

---

## 11. Notes and pitfalls for the agent

- `docs/STATUS.md` describes each feature exactly, including what was verified. Use it as the spec, section by section.
- Do not redesign behaviour while porting. First get the same features (parity), then improve.
- Keep the rule from the Electron version that the UI never passes raw file paths to open or serve files. Pass **item ids**, and the C++ side looks the path up.
- Natural order (2 before 10) is used everywhere: scan, playlist, chapters.
- Linux allows `|` in file names, which is why the chapter separator is `\u001f`. Keep it.
- Wayland (KDE): no absolute window positioning. Use `startSystemMove`. Test frameless resizing on both KDE Wayland and X11.
- Hardware decoding on Linux needs VAAPI drivers (`libva-mesa-driver` / `intel-media-driver`) or NVDEC. Keep `auto-safe` and fall back to software decoding silently.
- Long lists: never build all delegates. `ListView`/`GridView`/`TableView` only, with `reuseItems: true` where available.
- Images: always give `sourceSize`, and load asynchronously.
- Threads: tag reading, scanning, cover encoding and archive reading run off the UI thread (`QtConcurrent` / `QThreadPool`). Results go back with signals.
- The SQLite connection is used from one thread (or one connection per thread).
- Write a Qt Test for each ported core module (migrations from a real v10/v11 database, settings sanitize, queue rules, scan). The Electron version had similar node checks.
- Unverified things must be written as unverified in STATUS.md and in the reply to the owner.

---

## 12. Checklist (update as you go)

Legend: `[x]` done · `[~]` started · `[ ]` not started. Put the date and who did it at the end of the line.

**Phase A: decisions and preparation**
- [x] 1. Decide to leave Electron and rewrite in C++ + Qt6 (owners' decision, 2026-11-27).
- [x] 2. Analyse why the video player fails in Electron and what Qt/libmpv changes (section 3; 2026-11-27, Claude for MrJavadGG).
- [x] 3a. Write this hand-off plan (`docs/QT6_MIGRATION.md`; 2026-11-27).
- [ ] 3b. Verify the license facts of section 9 against official sources (Qt module licenses, mpv `-Dgpl=false`, FFmpeg LGPL build, TagLib, the Arch `mpv` build). Write the results into section 9.
- [x] 4. Owner decisions, written into section 13 (2026-11-27, MrJavadGG):
  - (a) libmpv for video and for music.
  - (b) Qt Quick/QML UI.
  - (c) Arch package: bundle our own LGPL libmpv.
  - (d) Video resume positions: dropped.
  - (e) Minimum Windows 10. Minimum Qt: 6.8 (already required by `rancha-qt/`).
  - (f) A Qt port exists: Aria's `rancha-qt/` (Q1–Q2.1). Continue from it (section 14).
- [x] 5. Repo layout: branch `port`, `rancha-qt/` ready for its first commit (the owner commits), `qt-ci.yml` moved to `.github/workflows/` (with manual start), `*.log` ignored (2026-11-27, Claude for MrJavadGG). Still open: look at Q2.1 on KDE and Windows.

**Phase B: risky parts first (prototypes)**
- [ ] 6. Prototype: Qt Quick + libmpv on KDE Wayland, X11 and Windows. Play MKV + HEVC 10-bit + ASS subtitles + 2 audio tracks with hardware decoding. Measure CPU and RAM. **Do not continue until this works.**
- [x] 7. Prototype: copies of two real libraries (v11, 315 and 328 items) and their `settings.json` opened from C++ with the same counts as `sqlite3`; the originals were not touched. Upgrades from v1 and v9 to v11 are tested (2026-11-27).

**Phase C: core (C++, no UI)**
- [~] 8. Done: `Database`, `ItemRepository`, `Settings`, data folder, tests (549 checks). Left: `Backup` (`backup.ts`), planned with R5.
- [ ] 9. `FolderScan`, `Covers` (+ auto covers), `Launcher` + emulators, `MusicTags`, `Subtitles`, `Reader` sources, `Online`.

**Phase D: UI (QML)**
- [ ] 10. Theme (dark/light/airy, accents, corners, glass, motion, UI scale, Poppins), frameless window, sidebar, toolbar, breadcrumbs, status bar.
- [ ] 11. Library views (grid, compact, list), search, tags filter, sort, selection, drag to reorder and move, context menus (with hints), item dialog, crop, bulk tag, folder import, drop files.
- [ ] 12. Video player (all of section 7).
- [ ] 13. Music player: Music page (3 resizable panes, columns), queue, mini player, media keys (all of section 8).
- [ ] 14. Reader (single/double, flip, RTL, zoom, chapters, progress) and game screen + launching.
- [ ] 15. Big Picture + gamepad (SDL).
- [ ] 16. Settings page, backup/restore panel, emulators panel, online-art dialog, About.

**Phase E: release**
- [ ] 17. Packaging: Windows installer + portable, AppImage, Arch PKGBUILD. Rewrite `release.yml` and `ci.yml`. Update README.md, THIRD_PARTY_NOTICES.md and RELEASING.md. Write `docs/RELEASE_NOTES_v2.0.0.md`.
- [ ] 18. Replace the Electron app: merge `qt6` → `collab` → `main`, remove the Electron files (section 10), and add a 2.0.0 entry to `docs/STATUS.md`.
- [ ] 19. Test on real data, on Arch/KDE and Windows: upgrade of a real library, performance (start time, RAM, a 10,000-item folder), every section. Then tag `v2.0.0`.

Progress: **6 of 20** (1, 2, 3a, 4, 5, 7), step 8 mostly done. Steps 10 and 11 are partly done in `rancha-qt/` (theme, sidebar, top bar, grid/list with sample data); see section 14.

---

## 13. Log and decisions

- 2026-11-27: plan written by Claude (session with MrJavadGG). At that time the Qt port was not yet in this repo. Nothing in sections 4–10 has been built or verified. The library and license names are from general knowledge.
- 2026-11-27: Aria removed the Electron video player (`53621e3`, merged in `3d32bb0`). Videos open in the system's default player. A new player is built in the Qt app (Q13).
- 2026-11-27, **owner decisions** (MrJavadGG):
  1. Video and music engine: **libmpv**.
  2. UI: **Qt Quick / QML**.
  3. Arch package: **bundle our own LGPL build of libmpv** (no GPL mpv/FFmpeg in what we ship).
  4. Video resume positions: **dropped** (the Electron player is already gone; the Qt player saves its own).
  5. Minimum **Windows 10**. Qt 6.8 or newer.
  6. Continue from **Aria's `rancha-qt/`** port; do not start a second one.
- 2026-11-27: answers to O1–O4: SQLite + nlohmann/json in `core/` (both added: system SQLite on Linux, the 3.54.1 amalgamation in `third_party/sqlite/` for Windows, json 3.12.0 with a checked signature); branch `port`, the owner makes the commits; libmpv prototype only at Q13; `aqtinstall.log` ignored and `qt-ci.yml` moved by us.
- 2026-11-27: R0 and R1 (Q3) done by Claude, except `Backup` (with R5) and the visual checks. See `rancha-qt/docs/STATUS.md`, Q3.
- 2026-11-27: Aria's `rancha-qt/` copied into the repo folder (not in git yet). Analysed by Claude; results and roadmap in section 14. Step 3b (license check) still waits for a working internet connection.
- 2026-11-28: Aria's Claude synced with `origin/port` (89139af) and added Q2.2: frameless window with own 48 px bar and buttons, no separator lines, calmer cover colors, card gaps and names as in Electron. New checklist of every Electron feature and owner decision: `rancha-qt/docs/ELECTRON_FEATURES.md`. App part not compiled (see `rancha-qt/docs/STATUS.md`, Q2.2).

---

## 14. Aria's port (`rancha-qt/`): state and roadmap

Analysed 2026-11-27 by Claude on MrJavadGG's Arch PC (Qt 6.12.0, g++, cmake, ninja). Aria's own notes are `rancha-qt/docs/STATUS.md` and `rancha-qt/docs/MILESTONES.md`; read them too. **Aria's milestone numbers (Q1–Q14) are the plan of record from now on.** Steps 6–19 of section 12 map onto them (table in 14.4).

### 14.1 What is in it (55 files, about 2,700 lines)

- `core/` (plain C++20, no Qt): `naturalCompare`, colours (hex/HSL/mix), the theme palette (dark/light/airy, 7 accent presets, corners, glass, motion; values from the Electron CSS), placeholder covers (gradient from hue + UTF-8 initials), folder listing with 7 sort modes, breadcrumb path (`pathTo`, safe against loops), an invented sample library (42 items) and a stress library.
- `app/` (Qt Quick): `ThemeBridge` (palette → QML singleton), `LibraryModel` (`QAbstractListModel` singleton over the sample data), `CoreInfo`. QML: `Main` (grid/compact/list views, breadcrumb, back button), `Sidebar`, `TopBar`, `CoverCard`, `Chip`, `Icon` (vector line icons), `SectionIcon` (accent-tinted PNGs), `LookPanel` (theme settings). Poppins `.woff` fonts and the section PNG icons are bundled as Qt resources.
- `tests/`: own small checker (`check.h`, no outside library), run with `ctest`.
- Build: top `CMakeLists.txt` (C++20, options `RANCHA_BUILD_APP` and `RANCHA_BUILD_TESTS`), presets `windows` (VS 2022), `linux` (Ninja) and `core-only`.

### 14.2 What was verified today

| Check | Result |
| --- | --- |
| Core + tests, `RANCHA_BUILD_APP=OFF`, g++ on Arch | **Verified:** built, 320 checks, 0 failed |
| Whole app against Arch's Qt 6.12.0 (`qt6-base`, `qt6-declarative`) | **Verified:** builds with no compiler warnings |
| App start with `QT_QPA_PLATFORM=offscreen`, 6 s | Printed no QML errors or warnings. **Not verified:** that the window looks and works right (nobody has looked at it on Linux yet) |
| App on Windows | Aria reported Q2 working (build, windeployqt, window opens). Q2.1 (new look) waits for a check |

Not verified: anything on KDE Wayland with a visible window, the `.woff` fonts on Windows, the `MultiEffect` icon tint, speed with 50,000 items.

### 14.3 Differences from this plan, and problems found

1. **Not in git.** `rancha-qt/` is untracked. It needs a branch and a first commit before more work (R0).
2. **The CI file is missing.** `rancha-qt/docs/STATUS.md` names `.github/workflows/qt-ci.yml`, but the repo only has `ci.yml` and `release.yml` (Electron). Ask Aria for it or write it again (R0).
3. **`rancha-qt/aqtinstall.log`** is a log of a failed Qt download on Aria's Windows PC. It should not be committed. Delete it or add `*.log` to `rancha-qt/.gitignore`. `build/` is already ignored.
4. **Layout:** the plan's `app/core/...` tree (section 4) is replaced by Aria's `core/` (no Qt) + `app/` (Qt). Keep Aria's layout. Consequence: anything in `core/` cannot use `QtSql`, `QJsonDocument`, `QCollator` or `QImage`. Each module must be placed on one side on purpose (open question O1).
5. **Tests:** Aria uses an own checker instead of Qt Test. Keep it for `core/`; Qt Test can be added later for `app/` code.
6. **Natural sort and non-English names.** `naturalCompare` folds case only for ASCII; Persian, Arabic and other names are compared by bytes. Check what the Electron app does (`libraryQuery.ts` / `folderScan.ts`) and match it before Q5.
7. **Data folder.** `main.cpp` sets the organisation and application name to `Rancha`. With Qt's defaults, `QStandardPaths` would give a different folder from Electron's (`.../rancha`, lower case). The data folder must be built by hand to match section 5 exactly, and `setDesktopFileName("rancha")` must be set (Q3).
8. **`Item` is still small.** It lacks `target`, `cover_path`, `icon_path`, `meta`, `wallpaper_file`, `emulator`, `core`, `updated_at`. That comes with the database (Q3).
9. **Speed later.** `childrenOf` walks all items each time a folder opens and `LibraryModel` resets the whole model on each change. That is fine with sample data. With the database, list by `parent_id` (indexed) and send row changes, not full resets.
10. **Milestone order vs. risk.** Aria's plan does video (libmpv) only at Q13. The owner wants the player after the port, which is fine. The plan's rule "risky parts first" is still worth a **small libmpv prototype** soon (one window that plays one MKV with ASS subtitles), so that a problem with Qt Quick's RHI and mpv's OpenGL render API is found early. It is optional (open question O3).
11. Aria's user count of "2 of 9 parts" does not match `MILESTONES.md`, which has 14 steps (Q1 and Q2 done, Q2.1 written). Confirm with Aria which list was meant.

### 14.4 Roadmap (what is left)

Finished rows stay in the table and are marked **Done (انجام شده)** in the Status column, so Aria, the owner and every
Claude session can see where things stand. Details of each step (what was verified and what was not): `rancha-qt/docs/STATUS.md`.

| # | Status | Work | Aria's step | Section 12 step | Main Electron sources |
| --- | --- | --- | --- | --- | --- |
| R0 | **Done (انجام شده)**, except the look of Q2.1 on KDE / Windows | Housekeeping: branch `port` from `collab`, commit `rancha-qt/` (without the log), add `qt-ci.yml` (Linux + Windows, Qt 6.8 pinned), check Q2.1 on Arch/KDE and Windows | Q1/Q2 close-out | 5 | — |
| R1 | **Done (انجام شده)**, except `Backup` (moved to R5) | Data and storage: data folder path, SQLite schema v11 + all migrations v1–v11, backup before upgrade, refuse newer databases, `ItemRepository`, `settings.json` with the full `sanitizeSettings`, import of a real library | Q3 | 7, 8 | `db/database.ts`, `db/itemRepository.ts`, `settingsStore.ts`, `shared/settings.ts`, `validate.ts` |
| R2 | **Done (انجام شده)**, waiting for a look on screen; sidebar / breadcrumb drop targets left for later | Add / edit / delete / move, folders and collections, covers + crop, folder import with tree preview, drag files in, multi-select, bulk tags, context menus with hints | Q4 | 9 (part), 11 | `ItemDialog.tsx`, `covers.ts`, `cropMath.ts`, `folderScan.ts`, `scanTree.ts`, `selection.ts`, `reorderDrag.ts`, `ContextMenu.tsx` |
| R3 | **Done (انجام شده)** | Search, tag filter, sorting, All items / Favorites / Recent, forward history | Q5 | 11 | `libraryQuery.ts`, `App.tsx` |
| R4 |  | Launching games/apps, `.desktop`/`.lnk`, missing files, protected main sections, game screen with wallpaper | Q6 | 9 (part), 14 | `launcher.ts`, `platformLaunch.ts` |
| R5 |  | Settings page, backup and restore | Q7 | 8 (part), 16 | `SettingsPage.tsx`, `backup.ts` |
| R6 |  | Readers: CBZ/CBR/image folders, PDF (QtPdf), RTL, double page, flip, chapters, progress | Q8 | 9 (part), 14 | `reader/*`, `pdfBook.ts`, `chapterTarget.ts` |
| R7 |  | Big Picture, then gamepad (SDL) | Q9 | 15 | `BigPicture.tsx`, `gamepad.ts`, `bigPicture.ts` |
| R8 |  | Online artwork (SteamGridDB, TMDB, AniList, TVmaze), automatic covers | Q10 | 9 (part), 16 | `onlineArt.ts`, `steamGridDb.ts`, `autoCovers.ts` |
| R9 |  | Emulators and ROM folders | Q11 | 9 (part) | `emulatorLaunch.ts`, `shared/emulators.ts` |
| R10 |  | Music: libmpv audio handle (gapless), TagLib tags + covers, index-based queue with duplicates, middle-click to queue, three resizable panes, resizable/sortable columns, mini player, MPRIS/SMTC | Q12 | 13 | section 8; `usePlayer.ts`, `MusicPage.tsx`, `MusicList.tsx`, `musicColumns.ts`, `musicTags*.ts` |
| R11 |  | Video: libmpv inside the window, tracks, ASS, subtitles finder, shortcuts, next/previous, auto-next, 90 % = watched, new resume storage | Q13 | 6, 12 | section 7; deleted files: `git show aa012f7:<path>` |
| R12 |  | Packaging: Windows installer + portable (Windows 10+), AppImage, Arch PKGBUILD with our LGPL libmpv, new `release.yml`, README, notices, release notes 2.0.0 | Q14 | 17 | section 10 |
| R13 |  | Replace Electron: merge `qt6` → `collab` → `main`, remove Electron files, test on real data on both systems, tag `v2.0.0` | — | 18, 19 | section 10 |

Still open from Phase A: **3b** (check the license facts of section 9 against official sources; needs internet).

### 14.5 Open questions (owner or Aria)

- **O1.** Where do SQLite and JSON live? (a) In `core/` with the SQLite C library (public domain, bundled amalgamation on Windows) and a small JSON library (for example nlohmann/json, MIT). The core stays Qt-free and testable. (b) In `app/` with `QtSql` and `QJsonDocument`. No new library, but the data code needs Qt to test. Adding a library needs the owner's OK (Aria's rule).
- **O2.** Branch name for the port (`qt6` suggested) and who commits `rancha-qt/` first (Aria may already have local commits).
- **O3.** A small libmpv prototype now (risk check), or only at Q13?
- **O4.** Ask Aria for `qt-ci.yml` and which "9-part list" was meant.
