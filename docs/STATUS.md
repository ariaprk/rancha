# Project Status

Last updated: 2026-10-18 (Milestone 8b polish round 2, awaiting owner test)

## Decisions (agreed)
- Platform: Windows 11
- Stack: Electron + TypeScript + React + Vite (via electron-vite); SQLite comes in Milestone 3
- Principle: offline-first, no accounts, media files are referenced by path, never copied
- Owner decision (2026-10-17): the app stays FULLY OFFLINE. No online cover or metadata downloads (SteamGridDB etc. considered and rejected). Covers come from local pictures only; planned offline helpers: paste image from clipboard / drop an image onto the cover box, exe icons, first page of a comic.

## Milestone 1: project + empty window — DONE (confirmed by owner)
- Owner installed the tools, ran `npm run dev`, and saw the dark "Library" window.
- `npm run typecheck` was not reported on; treat type-checking as unverified.

## Milestone 2: interface, theme system, sample library — DONE (owner confirmed it works very well)
Built (no new packages needed):
- Layout: collapsible glass sidebar, glass toolbar, breadcrumbs, content area, status bar
- Views: cover grid, compact grid, detailed list; card-size slider; sort (custom/name/recently added)
- Navigation: Home, Favorites, Recent, four top-level collections, nested folders with breadcrumbs
- Search across all sample items (Ctrl+K focuses the box)
- Themes: dark/light, accent color (presets + custom), motion level (Full/Subtle/Off, also honors Windows "reduce motion")
- Effects: hover lift+grow+glow, animated sidebar selection bar, view fade/slide, backdrop blur on glass surfaces
- Sample library: 41 invented items in a nested tree (src/renderer/src/data/sampleLibrary.ts)

Owner ran and tested it on Windows 11 and reports it working very well. Verified by Claude here: the sample data tree is consistent (unique ids, every parent exists and is a collection).
Still unverified: `npm run typecheck` and the production build (`npm run build`).

Intentional limits (later milestones): items cannot be added/edited/moved (M4), nothing launches (M6), settings live in localStorage (M7), real cover images (M4), custom tooltips and virtualization (M9). Tooltips are the plain browser ones for now.
Note for M4: the page's Content-Security-Policy only allows images from the app itself and data: URLs; real covers will need a small change.

## Milestone 3: data model + persistent storage — DONE (owner confirmed everything works)
Built (no new packages; uses SQLite built into Electron 44's Node 24 via `node:sqlite`):
- Database file `library.db` in `%APPDATA%\rancha\` (folder fixed by APP_ID, independent of the display name)
- Schema v1: `items` (one table for all kinds, parent_id tree, JSON `meta`, spare columns target/cover_path/icon_path for M4+) and `item_tags`
- Migrations via `PRAGMA user_version`; automatic copy to `backups\` before upgrading an existing library; refuses databases from newer app versions
- Sample library is written into the database ONCE on first run (it now lives in src/main/db/sampleLibrary.ts); the interface loads everything from the database through IPC
- Autosave: every change is a database write; first change wired up: "Add to favorites / Remove from favorites" in the status bar (select a non-folder item)
- App name in ONE place: src/main/appInfo.ts (APP_NAME display name, APP_ID permanent folder id)
- Settings > About shows the version and the data folder
- Layers: renderer -> preload bridge (src/preload) -> IPC (src/main/ipc.ts, names in src/shared/ipc.ts) -> repository (src/main/db/itemRepository.ts) -> SQLite

Owner confirmed on Windows 11 / Electron 44.8.0 that it works (node:sqlite is available). Verified by Claude in the sandbox earlier (Node 22 with node:sqlite, throwaway database): creation + seeding (41 items, tags, parents), version=1, foreign keys on, favorite changes survive close/reopen, reopening does not re-seed, unknown id rejected, bad parent/kind rejected, deleting a collection cascades to children and tags, newer-version database refused.
Fallback if node:sqlite ever breaks: better-sqlite3 behind the same repository class (only database.ts/itemRepository.ts would change).
node:sqlite is marked "experimental/release candidate" by Node, so its API could change in future Electron versions; it is isolated in two files for that reason.

## Milestone 4: add / edit / delete / organize + covers — DONE (owner confirmed after the Add-menu fix)
Built (no new packages):
- Add menu (toolbar): New collection, App or game, Video, Comic/manga/PDF (opens the item form), and "Add several files at once" (file dialog; kind guessed from extension: exe/lnk/bat/cmd/url/msi = app, mp4/mkv/avi/... = video, cbz/cbr/pdf = reading). Drag files from Windows Explorer into the window to add them to the folder being viewed. Folders and unknown types are skipped with a message.
- Item form: name, location (Browse... / Folder... for comics), description, tags (comma separated), cover image or placeholder color. Same form for editing (right-click > Edit, F2, or status-bar Edit).
- Delete (Delete key, right-click, status bar) with confirmation; deleting a collection deletes everything inside it and the cover copies; real files are never touched.
- Move: right-click / status bar "Move to...", or drag an item onto a folder card, a sidebar section, Home, or a breadcrumb. Cycles are refused. "Earlier"/"Later" reorder in Custom sort (collections and plain items are ordered separately because collections always list first).
- Covers: chosen image is resized (max 600x900 JPEG, via Electron nativeImage; PNG/JPG/BMP only) and copied to %APPDATA%\rancha\covers\<uuid>.jpg; shown through the private scheme library-cover://file/<name> (CSP img-src updated). Unused covers are swept at startup. Transparent PNGs get a black background (JPEG).
- Breadcrumb root now says "Home" (was "Library"). Sidebar lists top-level collections only. Click on empty space clears the selection.
- Right-click menu on any item (also folders). Single click on a folder still opens it.
- Code: src/main/{covers,fileKinds,validate,ipc}.ts, repository extended (create/update/delete/move/moveWithinFolder/listCoverFiles), new renderer components ItemDialog, MoveDialog, ConfirmDialog, Modal, ContextMenu, state/useItemDrop.ts.

Verified by Claude in the sandbox (Node 22, throwaway database, fake image encoder): create/update/delete/move/reorder rules, tag replacement, cover bookkeeping, cascade delete, persistence across reopen, input validation, cover-name safety, file-kind detection. Also type-checked main+preload+shared (real tsconfig.node.json) and the renderer (real tsconfig.web.json) with SIMPLIFIED stand-in React/Electron types: clean. Real React/Electron types are stricter, so `npm.cmd run typecheck` on the owner's PC may still report things.
NOT verified (needs Electron on the owner's PC): everything on screen, the file dialogs, image resizing, the library-cover protocol, drag-and-drop (internal and from Explorer), context menus, keyboard shortcuts.
Owner test #1 (screenshot): everything worked except the toolbar Add menu, which was painted BEHIND the cover cards (cards have will-change/transform = own layers; toolbar's backdrop-filter layer had no z-index). Fixed with `.toolbar { position: relative; z-index: 5 }` at the end of styles.css; owner confirmed the fix works.
Known limits: no tab-trapping in dialogs; dropping a folder from Explorer is not supported yet; webp covers not supported; missing-file indicator and launching arrive in M6.

## Milestone 5: search, filters, sorting, "All items" — DONE (owner confirmed it works)
Owner change request after testing: the "Show" filter row (type chips + Favorites chip) was removed as too cluttered; the tag picker moved next to the search box (done in M6). The type/favorite filtering code still exists in libraryQuery.ts but has no on-screen control.
Built (no new packages, no database changes):
- Search: several words (ALL must match) across name, tags, description and the names of the folders an item is in; best matches first (exact name > starts with > tag > folder name > description). Esc or the x clears it. Searching inside a folder shows an "Everywhere / In this folder" switch.
- Filter bar (under the toolbar): type chips (Apps & games, Videos, Reading), Favorites chip, tag picker (with counts; several tags = item needs all), "Clear filters". Filters inside a folder look through that folder and everything below it, so "Videos" inside Anime lists all videos at any depth.
- Flat results (search, filters, All items, Favorites, Recent) show where each item lives ("Video › Anime") and have right-click > "Show in its folder".
- New sidebar page "All items": every app, video and book in one flat list.
- Sorting: Custom/best match, Name A-Z, Name Z-A, Newest, Oldest, Last opened, Type. The choice is remembered (settings). Custom order only applies inside one folder; in flat lists it means best match when searching, otherwise by name. Recent defaults to most recently opened.
- Filters/search scope reset when you navigate elsewhere.
- Code: src/renderer/src/lib/libraryQuery.ts (pure logic), components/FilterBar.tsx; App/Toolbar/Sidebar/ItemCard/ItemRow/useSettings/styles extended.
Verified by Claude (sandbox): 25 checks of libraryQuery against the sample library (ranking, AND of words, scope, type/favorite/tag filters, all sorts, loop-safe), plus type-check of renderer and main with stand-in types: clean.
NOT verified (needs the owner's PC): everything on screen.

## Milestone 6: launching, opening, missing files — DONE (owner confirmed it works very well)
Built (no new packages):
- Double-click (or Enter, right-click > Launch/Play, or the blue button in the status bar) opens the selected item: apps/games/scripts/shortcuts are started, videos open in the default Windows player (both via Electron `shell.openPath`, i.e. exactly what double-clicking in Explorer does). Comics/PDFs say the reader arrives in Milestone 8.
- The page only sends the item's id; the backend reads the path from the database (src/main/launcher.ts). Opening records "last opened", so the Recent page and "Sort: Last opened" now work for real.
- Missing-file detection: at startup, after changes and whenever the window regains focus, the backend checks every item's file/folder. Missing items show an orange "Missing" badge and a dimmed cover (grid and list), the status bar says "File not found", and right-click offers "Locate file…" (comics also "Locate folder…") to point at the new place. Launching a missing item explains the problem instead of failing silently.
- Right-click > "Show in Explorer" selects the file in Windows Explorer.
- Tag picker moved from the filter row into the toolbar next to the search box (the old "Show" row is gone). The "Everywhere / In this folder" choice is now a one-line note above the results while searching inside a folder.
Verified by Claude (sandbox, Node 22, fake Windows actions): 12 checks (opens existing file + records time, missing/no-location/collection/unknown handled, Windows error and exceptions reported, findMissing flags only gone files, markOpened) and type-check of main/preload/renderer with stand-in types: clean.
NOT verified (needs the owner's PC): actually launching a real program or video, Explorer reveal, the file dialog for Locate, everything on screen.
Not done on purpose: launch arguments / working-directory options, web or steam:// links, running as administrator.

## Milestone 7: settings file, more customization, backup and restore — DONE (owner confirmed; restore works, dev-mode auto-restart shows a black window and needs `npm.cmd run dev` again, as predicted)
Built (no new packages):
- Settings now live in `settings.json` in the data folder (written safely via a temp file + rename; a damaged file is set aside as settings.damaged-<time>.json and defaults are used). Old localStorage settings are carried over once. Every value is validated (src/shared/settings.ts), so a bad file can never break the app. The sort order is remembered too.
- New options (Settings > Layout and style): interface size 80-140% (Electron zoom), corners Sharp/Soft/Round, frosted glass Off/Normal/Strong (Off makes surfaces nearly solid), background glow On/Off.
- Backup (Settings > Backup and restore): "Create backup..." asks for a destination and writes a new folder `rancha-backup-<date>_<time>` containing library.db (consistent snapshot via SQLite VACUUM INTO), covers\, settings.json, backup-info.json. Your media files themselves are never copied.
- Restore: "Restore..." picks a backup folder, validates it (real library database, integrity check, not from a newer app), shows item count/date, asks to confirm, then restarts. The swap is done at the START of the next run, before the database opens: the current library is moved (not deleted) to backups\before-restore-<time>\ and the backup takes its place, so a restore can always be undone by restoring that folder.
- Automatic backups (On by default, switchable): at startup, at most one per 20 hours, keeps the newest 5 in backups\auto\. "Open folder" button for the backups folder.
- Code: src/shared/settings.ts, src/main/{settingsStore,backup}.ts, repository snapshotTo/countItems, renderer components/BackupPanel.tsx, state/useSettings.ts (now async).
Verified by Claude (sandbox, Node 22): 32 checks - settings sanitizing/saving/damaged file/reset; backup create (names, contents, uniqueness); validation refuses missing, garbage, other-SQLite and newer-version backups; full restore cycle (library, covers and settings return to the backed-up state; previous library kept and itself a valid backup; incomplete or bad staging changes nothing); auto-backup spacing and pruning. Type-check of main/preload/renderer with stand-in types: clean.
NOT verified (needs the owner's PC): everything on screen, folder dialogs, the zoom, and above all the app restarting by itself after a restore. In `npm.cmd run dev` the automatic restart may fail to reopen the window; if the app just closes, run `npm.cmd run dev` again and the restore is completed at that start.
Known limits: restore copies whole backup folders (no zip); no "restore only settings"; covers are copied wholesale.

## Milestone 7b: cover cropper + scrolling fix — DONE (owner confirmed it works)
Owner reports after M7: (1) no scrollbar, content below the window edge unreachable (had to shrink the interface to see Settings) - on every page; (2) wants a way to crop cover pictures with the wrong proportions.
Fixes/features (no new packages):
- SCROLLING (root cause found and reproduced in a real browser): the `.app` grid had an automatic row height, so the row (and `.main`) grew to the full content height (4261 px in an 800 px window) and `.content` never overflowed. Fix: `grid-template-rows: minmax(0, 1fr)` on `.app`. After the fix the content area scrolls (mouse wheel, keyboard, scrollbar) on Settings and in long folders. Scrollbar also made wider/more visible (14 px, accent color on hover).
- Toolbar crowding fixed: it overflowed at 1280 px and below (right-hand view buttons clipped). Now only the search box shrinks; the card-size slider is hidden below 1150 px window width (same setting remains in Settings); tighter spacing below 1000 px. Checked at 1280/1100/900 px (minimum window width).
- COVER CROP: "Choose image..." now opens a "Crop cover" step: a fixed 2:3 frame (cover shape) over the picture; drag to move, slider or mouse wheel to zoom (up to 4x), "Fill frame" (default, centered) and "Fit whole picture" (black bars if proportions differ), rule-of-thirds guide. The visible area is rendered on a canvas to a 600x900 JPEG, sent to the backend, which decodes and re-encodes it itself (only real pictures are stored) and returns the stored name. The picture can never be dragged/zoomed so that empty space shows (unless "Fit whole picture").
- Esc closes only the top-most dialog (crop step over the item form).
- Code: src/renderer/src/lib/cropMath.ts (pure math), components/CropDialog.tsx, Modal.tsx (dialog stack), ItemDialog.tsx; backend: main/index.ts (makeCoverPreview, encodeCoverBytes), covers.ts addFromBytes, ipc dialog:pickCoverImage + cover:save (size-limited, validated); the old pick-and-store-immediately IPC was removed.
Verified by Claude: cropMath 14 checks (fill/fit/clamp/zoom center/pan/output size); real interface bundled with a pretend backend and driven in headless Chromium: scroll bug reproduced before the fix and gone after (settings and long folder scroll to the end); toolbar fit at 3 widths; cropper opened from the item form, dragged, zoomed by wheel and slider, fit/fill, Esc, save -> 600x900 JPEG delivered to the backend; type-check of main/preload/renderer with stand-in types: clean.
NOT verified (needs Electron on the owner's PC): the real file dialog and image decoding (nativeImage), the real preview of big pictures, scrollbar look inside Electron.
Known limits: re-cropping an existing cover means choosing the picture again (originals are not kept); cropping is for cover images only.

## Milestone 8: comic / manga reader — DONE (owner tested: all OK; `npm.cmd run build` also passed on their PC)
Owner decisions: .cbr wanted; PDFs supported; fully offline.
- Sources: folder of pictures (sub-folders included), .cbz/.zip (own small ZIP reader, no package; stored + deflate, no ZIP64/encryption), .cbr/.rar (needs package `node-unrar-js`, added to package.json -> owner must run `npm.cmd install`; if it is missing the user sees a clear message instead of a crash). Archive type is detected from the file's first bytes, not its name. Pages sorted naturally (2 before 10); junk (__MACOSX, Thumbs.db, dot files) ignored. PDFs open in their own window (Chromium's built-in viewer).
- Reader screen (full window): Single / Double (cover alone, then pairs) / Strip layouts, Fit page / Fit width, direction (Comic -> / <- Manga; arrows, click zones, double-page order and slider follow it), page slider, full screen (F), keys: arrows, Space/Shift+Space, PageUp/PageDown, Home/End, D = direction, Esc = close. Library shortcuts (Delete/F2) are blocked while reading. Next pages are preloaded.
- Remembers page + direction per comic (database v2: table reading_progress; automatic pre-upgrade backup as before) and the layout/fit/default direction (settings; Settings > Comic reader).
- Security: pages are served through a private `library-page://` address by session id; the interface never sees real paths; max 3 open sessions; page index validated.
Verified by Claude: 22 backend checks (CBZ deflate/stored/unicode names, folder, non-archive, empty, bad index, session limit, resume clamp, PDF routing, v1->v2 migration incl. backup, validation, settings) + 14 reader-math checks + launcher test updated (14); real interface driven in headless Chromium with fake pages (open at saved page, arrows, End/Home, manga direction, double-page order, strip, fit width, click zones, progress saves, Esc closes and frees session, Delete blocked); type-check main/preload/renderer with stand-ins: clean.
NOT verified (needs the owner's PC): real .cbz/.cbr files, node-unrar-js (cannot be installed here; untested), the custom protocol inside Electron, PDF window, full screen, large (hundreds of MB) archives.
Known limits: no zoom/pan beyond the two fit modes yet; very wide (landscape) pages are not auto-shown alone in Double mode; RAR archives are loaded fully into memory; strip mode scroll position can drift slightly while images load.

## Milestone 8b: "Add a whole folder" — BUILT; owner: works as expected, then asked for the content-type change below (awaiting retest). Multi-select is the next small step, 8b-2
- Add menu > "Add a whole folder…" (or drop a folder onto the window): pick folder -> app scans (changes nothing) -> preview dialog with tick boxes -> "Add N items".
- Recognises programs/shortcuts (exe, lnk, bat, cmd, url, msi), videos, .cbz/.cbr/PDF, and folders that only contain pictures (>= 2) = one readable comic each. Folder structure becomes nested collections (e.g. Anime > Show > Season 1 > episodes). Folders first, natural order; hidden (.name), $RECYCLE.BIN, System Volume Information, node_modules skipped; empty folders skipped; depth <= 8; max 5000 things (flagged when cut off).
- Preview options: look inside sub-folders (rescans), keep structure or one plain list, optionally wrap everything in a new collection (name editable), tri-state tick boxes on collections, select all/none, expand/collapse. Installers/uninstallers/redistributables (unins*, vcredist*, setup launchers...) start unticked ("probably not wanted"); things already in the library (same location, case-insensitive) start unticked ("already in library") and are skipped again on add.
- Adding is ONE database transaction (all or nothing); empty collections are never created. Several dropped folders are previewed one after another.
- Code: main/folderScan.ts, repository importTree/existingTargets/insertItem, validate parseImportNodes/parseScanOptions/parsePath, IPC library:scanFolder / library:importTree / dialog:pickFolder, renderer lib/scanTree.ts + components/FolderImportDialog.tsx.
Verified by Claude: 26 backend/logic checks (scan rules, ordering, comics, noise, truncation, duplicates, nesting + order in DB, all-or-nothing, validation); the real dialog driven in headless Chromium (tri-state ticks, select all/none, wrap name, payload sent to backend). All earlier test suites still pass; type-check clean.
NOT verified (needs the owner's PC): the real folder picker, scanning real drives/network folders (speed on huge folders), drag-drop of folders from Explorer.
Known limits: the preview cannot rename items (rename after adding); shortcuts (.lnk) are added as-is.

### 8b change requested by owner: ask the content type, clean games list with .exe icons
Problem: scanning a folder of game installs listed every helper program and file. Now: Add > "Add a whole folder…" first asks "What are you adding?" (Games and apps / Videos, anime, series / Comics, manga, books / A mix of everything), then the folder picker (also asked for dropped folders). The preview has a "What is in this folder?" list to switch and rescan.
- Games and apps: one entry per game folder = the program most likely to start the game. Score: file name matches the folder name (+), shallow (+), bigger file (+, capped), helpers (unins*, redist, vc_redist, setup, install, updater, crash*, UnityCrashHandler, EasyAntiCheat...) heavily penalised and normally hidden, "launcher/config/editor/server/tool/patcher" slightly penalised. Programs buried deeper (Binaries/Win64/Game.exe) are found for top-level game folders. A folder of game folders (Action > Doom, Quake) becomes a collection; a category holding a single game collapses into that game. Folder with only setup programs is kept but unticked. Loose .exe/.lnk/.url files in the chosen folder are listed as they are (helpers dropped). Option "Show every program inside each game folder" lists them all under the game (best one ticked).
- Icons: the real Windows icon of each program/shortcut (app.getFileIcon, 24 px) shown next to its name, loaded in the background in batches of 40 (first 400). IPC files:icons accepts only program-like files (exe, lnk, url, bat, cmd), max 60 per request.
- Videos mode: only video files (folders/seasons kept). Comics mode: .cbz/.cbr/PDF and picture folders. Mix mode: everything (previous behaviour).
Verified by Claude: 42 scan/logic checks including a fake game library (helpers, redistributables bigger than the game, name-vs-size, buried exe, category folders, setup-only folder, loose shortcuts, show-all option) and mode filters; dialog flow driven in headless Chromium (choose type -> preview -> icons shown -> switching type/option rescans with the right options). Type-check clean; all older suites pass.
NOT verified (needs the owner's PC): real icons (app.getFileIcon output, especially for .lnk shortcuts), the real picking quality on the owner's actual game folders (tell Claude which game got the wrong program so the rules can be tuned).

### 8b polish round 2 (owner requests)
- Search box above the preview list: all words must match a name or the file path; matching items shown with their folders opened; "Select shown / Unselect shown" act only on the matches; Esc clears the search first (second Esc closes the dialog).
- Defaults per content type (also re-applied when the type is switched in the preview): Games = "One plain list", wrap box UNchecked. Videos and Comics = "Keep the folder structure" and "Put it all in a new collection named" CHECKED (name = the folder's name, editable). Mix = structure, wrap unchecked.
- Games/apps without a cover picture now show their Windows icon (exe/lnk/url/bat/cmd) centered on the colored placeholder, in the grid, compact, list view and the edit dialog preview. Icons are requested lazily in batches of 40 and cached for the session (lib/iconCache.ts); items with a cover picture, non-program targets or no icon keep the old placeholder (initials + faint type icon). Missing files may still get Windows' generic icon.
Verified by Claude: 49 scan/logic checks (new: defaults, search filtering, select-shown); headless Chromium: defaults switch with the content type, search shows matches with folders, Esc behaviour, 20 of 20 launchable cards showed an icon. NOT verified: real Windows icons look/size, performance with thousands of icons (virtualization comes in Milestone 9).

### Milestone 8b-2: multi-select + bulk actions — BUILT, awaiting owner test
- Ctrl+click toggles an item, Shift+click selects a range, Ctrl+A selects everything shown, Esc clears, click on empty space clears. Works in covers, compact and list views.
- With 2+ selected the status bar shows "N selected" with: Add/Remove favorites, Add tag..., Remove tag..., Move to..., Delete, Clear selection. Same menu on right-click; Delete key opens the delete confirmation.
- Dragging one selected item drags the whole selection onto a collection / sidebar entry (move).
- Each bulk action is ONE database transaction (all or nothing). If a collection and something inside it are both selected, only the outer one is moved/deleted. Delete warns about hidden items inside selected collections. Move refuses loops. Tags are case-insensitive.
- Only items currently shown count as selected (a search/filter never lets you act on hidden items).
- Code: lib/selection.ts, components/BulkTagDialog.tsx, MoveDialog (moving: list), repository *Many functions, IPC library:bulk, validate parseBulk.
Verified by Claude: 16 backend checks + 11 selection-logic checks; headless Chromium run of real UI (ctrl/shift click, Esc, Ctrl+A, every bulk button/dialog, context menu, single-select still works); type-check clean; older suites pass. NOT verified: real Electron, real Windows drag-and-drop of a multi-selection.

### Milestone 8c-1: first-page covers, choose-a-page picker, PDFs in the built-in reader — BUILT, awaiting owner test (needs `npm.cmd install`: new package pdfjs-dist)
- Automatic covers: a comic folder, .cbz, .cbr or PDF with NO cover picture of its own shows its first page (natural page order). Made once, cached in <data folder>/cover-cache (separate from covers the user chose, which always win and are never touched); the cache name holds a hash of the item id + the file's size/modified time, so a replaced file gets a fresh cover; stale/deleted-item covers are swept at start. Only prepared when the card is near the screen (IntersectionObserver); comics/CBZ/CBR are made by the backend one at a time (queue), PDFs are drawn by the interface (pdf.js) and sent back once (IPC cover:auto / cover:saveAuto, protocol library-cover://auto/<name>).
- "Choose a page from the book…" button in the Edit dialog (readable items with a location): grid of page thumbnails (lazy) -> click -> existing crop step -> saved like any cover the user chose (so it never gets overwritten). "Remove image" brings back the automatic first page.
- PDFs now open in the built-in reader (same layouts single/double/strip, fit page/width, progress/resume, keyboard). pdf.js (npm package pdfjs-dist, legacy build, offline, bundled) draws pages in the interface; the backend hands the file over in 1 MB chunks via IPC (reader:pdfRange) so big PDFs are not loaded whole. A drawn-page cache keeps the 40 most recent pages. If a PDF cannot be opened (damaged / password-protected / too slow) the reader says why and offers "Open in the PDF window instead" (the old Chromium viewer window, reader:openPdfWindow).
- CSP now also allows blob: images (drawn PDF pages). ReaderSession gained format ('images'|'pdf') and pdfSize.
- Code: main/autoCovers.ts, main/reader/readerSessions.ts (PDF sessions + readPdfRange), readerService.ts; renderer lib/pdfBook.ts, pdfMath.ts, pageProvider.ts, useBook.ts, autoCovers.ts, queue.ts; components/PageImage.tsx, PagePickerDialog.tsx, ReaderView.tsx (wrapper + body), Cover.tsx, ItemDialog.tsx.
Verified by Claude: 17 backend checks (first page order, cache reuse, replaced file, broken archive, sweep, concurrency, safe names, PDF chunking) + updated reader checks (23); the REAL pdf.js drawing a generated 5-page PDF in headless Chromium with the app's CSP (resume page, next/prev, double, strip lazy-loading, End key, progress saved, session closed, JPEG cover bytes sent back, picker thumbnails, crop step after picking, broken-PDF message + fallback button); all older suites still pass; type-check clean (web + node).
NOT verified (needs the owner's PC): real Electron (worker loading from the built app, IPC chunk speed on very large PDFs), .cbr covers (RAR cannot run here), speed with a library of hundreds of PDFs, real scanned/CJK PDFs. Known limits: password-protected PDFs are not supported yet; PDFs that use unembedded standard fonts render with fallback fonts; no zoom/pan beyond the two fit modes.

### Milestone 8c-2: cover paste/drop, watched/read status, window memory, back/forward — BUILT, awaiting owner test (no new packages)
- Cover: in the Edit dialog, Ctrl+V of a picture, or dropping a picture file on the cover box, goes straight to the crop step (renderer lib/imagePreview.ts; dropped/pasted file is decoded here and downsized to 1400 px). Non-picture drops show a message. While a dialog/reader is open the window-wide "drop files to add them" is switched off.
- Watched / read / completed: database version 3 (column items.is_done; automatic pre-upgrade backup as before). Right-click menu, bottom bar and multi-select all have "Mark as watched / read / completed" (words depend on the kind; collections: "Mark everything inside as done"). Done items have NO badge on the cover (owner request): in the grid their title is only slightly dimmed; list view shows a small check beside the name. A collection counts as done when everything inside it is (empty ones never). Bulk action {type:'done'}. Reading a comic/PDF to its LAST PAGE marks it read automatically (un-mark by hand if wanted). Started-but-unfinished comics show a progress bar at the bottom of the cover (and a % in list view). The library refreshes when the reader closes.
- Window memory: size, position and maximized are saved to window.json in the data folder (main/windowState.ts); the position is only reused if the window would still be visible on a connected screen (unplugged monitor safe); minimum 900x600.
- Back / forward: ‹ › buttons beside the breadcrumbs, mouse side buttons (4th/5th), Alt+Left / Alt+Right. History of folders/pages (max 60), skips collections that were deleted, forward trail cleared by a new visit, ignored while a dialog or the reader is open (lib/navHistory.ts).
Verified by Claude: 32 new logic checks (done status incl. collections + auto-read + progress, migrations v1->v3 and v2->v3 with data kept, window-state rules, navigation history, labels); headless browser run of the real UI (back/forward buttons, simulated mouse buttons 3/4, Alt+arrows, not while a dialog is open, badges, progress bar, status bar/menu/bulk done calls, paste and drop on the cover, non-picture drop message); all older suites and earlier browser tests still pass; type-check clean.
NOT verified (needs the owner's PC): the real mouse side buttons in Electron on Windows (events may differ per mouse driver), real clipboard images (screenshots, "copy image" from a browser) and Explorer file drops onto the cover, window memory across real multi-monitor changes, 3 -> 5 filtering ideas not built (e.g. "hide watched"; ask if wanted).

### Milestone 9: speed for big libraries — BUILT, awaiting owner test (no new packages)
- Long lists are "virtualized" (components/VirtualItems.tsx, lib/virtualMath.ts): above 150 items only the rows near the screen are drawn, spacers keep the scroll bar honest; works in cover grid, compact grid and detailed list (list rows now have a fixed 52 px height). "Show in its folder" scrolls the item into view. Multi-select (Ctrl/Shift/Ctrl+A) works across rows that are not drawn.
- Database version 4: an index on items(parent_id, sort_order) plus in-memory walks for "mark done" and bulk checks (adding/marking thousands of items was quadratic before). Automatic pre-upgrade backup as before.
- Measured by Claude with 5,000 items in headless Chromium (mock data): page elements 50,146 -> ~450; search keystroke 1-2.4 s -> 0.15-0.25 s; Ctrl+A 55 ms. Scrolling stays ~60 ms/frame in the software-rendered test browser (real GPU should be smoother). All earlier suites and browser tests pass; type-check clean.
- Decided NOT to build: custom tooltip layer (Windows native tooltips keep working) and a separate thumbnail cache (automatic covers are already cached on disk). Say so if you want either.
- NOT verified (owner's PC): real Electron feel with thousands of real covers, scrolling smoothness on a real GPU, very large cover sets.

### Milestone 9b: reader zoom — BUILT, awaiting owner test (no new packages)
- Zoom 100%-600% in the built-in reader (single, double and strip layouts): `−` / `+` buttons and a % button (reset) in the top bar, Ctrl + mouse wheel (also trackpad pinch), `+` `-` `0` keys and Ctrl+`+` / Ctrl+`-` / Ctrl+`0`. Zoom follows the mouse pointer. Drag a zoomed page to move it; mouse wheel and arrow keys also move it, and an arrow key or Space at the page edge turns to the next page, which then starts at its corner (top-right for manga). Page turns keep the zoom level; changing layout/fit resets it.
- Pages move/scale with a CSS transform (smooth, no re-layout). PDF pages are redrawn sharper once zooming pauses (up to 16 megapixels, 6 zoom-buckets of 0.5; only 6 zoomed pages cached). Comic pictures are shown at their real resolution.
- Strip layout zooms by widening the pages (horizontal scroll, drag to move).
- Code: ReaderView.tsx (zoom logic), pageProvider.ts (`page(index, zoom)`, `zoomBucket`), pdfBook.ts, pdfMath.ts, PageImage.tsx (keeps the old picture while a sharper one loads), styles.css.
- Verified by Claude (test browser, real pdf.js): zoom buttons/keys/Ctrl+wheel, zoom at cursor, drag, wheel pan, arrows pan then turn page, reset, strip widening, layout change reset, sharp PDF redraw (page picture grows from 1280x1920 to 2400x3600), no errors; centring bug found and fixed (pictures smaller than the stage).
- NOT verified (owner's PC): real trackpad pinch, touch screens, zoom feel on very large scans, double-click-to-zoom is NOT built.

### Milestone 9c/9d: console-style game screen + wallpaper — BUILT, awaiting owner test (no new packages)
- Double-clicking (or Enter on) a game/app opens a full-window screen: wallpaper, big title, one Play button, a small playtime area. Right-click "Launch" and the bottom-bar Play button still launch directly. This applies to EVERY launchable item (games and apps alike).
- Play (click, Enter or Space): (1) everything except the wallpaper fades away, (2) the wallpaper is shown alone for 2 s (LAUNCH_DELAY_MS in GameScreen.tsx), (3) only THEN the game is started, (4) the wallpaper stays until the player presses Esc (or Enter/Space) or clicks. Esc during the 2 s cancels (the game is never started). A start failure (file missing...) brings the screen back with a message. History: 9c brought the buttons back after 2 s; 9d tried to return when the window regained focus, but on the owner's PC the focus flickers while a game opens (the buttons reappeared when the game window appeared), so ALL focus-based guessing was removed. Owner's decision: Esc/click is fine for now; automatic return is "to think about more".
- Ideas for an automatic return (NOT built, to be decided): track the game process for .exe games (we start it ourselves; problems: admin/UAC games, launcher-style games that start another program and exit, Steam .lnk/.url shortcuts cannot be tracked at all); this would also give real playtime.
- Games vs apps (automatic, by SECTION): everything inside the top-level "Applications" section (any depth; recognized by id `apps` or a name like "Apps"/"Applications") is an app and launches at once; every other app/game (Games section, or anywhere else) is a game and opens the game screen on double-click. Moving an item between sections changes this by itself. There is no manual switch (owner's decision: the four sections Games, Video, Reading, Applications decide). Code: renderer lib/sections.ts. The wallpaper box in the Edit dialog only appears for games. Database: version 6 (a per-item switch, shipped in 9e) was removed again by version 7 (drops the column); a library at version 6 upgrades itself with an automatic backup.
- Wallpaper (database version 5, column items.wallpaper_file, automatic pre-upgrade backup): Edit dialog of a game/app has a "Wallpaper" box: Choose image… (file dialog), drop a picture on the box, Remove wallpaper. A 16:9 crop step (CropDialog shape 'wallpaper'; saved at up to 1920x1080 JPEG; ipc wallpaper:save). Stored in the same folder as covers (so backup/restore and the cleanup sweep cover it); replacing/removing/deleting an item deletes the old file. Pasting a picture (Ctrl+V) still goes to the COVER, not the wallpaper.
- The game screen shows the wallpaper sharp; without one it shows the cover blurred; without a cover a color gradient.
- Playtime area is a placeholder: "— h" plus "Played N days ago" (from the last-opened time). Real playtime tracking is not built.
- Animations use only transform and opacity; they obey Settings > Motion. Test browser (software drawing): steady 60 fps (median 16.7 ms, 95th percentile 16.8 ms, worst 50 ms); instant start kept the wallpaper-only screen 2.07 s.
- Verified by Claude: 12 new backend checks (wallpaper create/replace/remove/delete, sweep keeps it, validation refuses odd names), migrations v1/v2 -> v5, all older suites; test browser: wallpaper field only for games/apps, 16:9 crop frame, 1920x1080 output, cover crop unchanged (600x900), save/remove patches, own wallpaper shown sharp, launch behaviour (stays wallpaper-only past 2 s and for 5+ s, ignores a focus without having been away, returns after blur+focus, Esc, Enter, click), no errors.
- NOT verified (owner's PC): a real wallpaper picture on the game screen (private protocol); real games.
- Ideas decided but not built: Info drawer (status, rating, notes), real playtime tracking, Steam-style alternative layout as a Settings choice.

### Milestone 10-pre / 9g: drag to reorder (custom order only)
- Only when browsing inside a folder with Sort = Custom order (no search, no filters). Other sorts, search results, All items etc.: no reordering; the old browser-style drag (item onto a folder / sidebar / breadcrumb) still works there.
- Press a card/row and move 6 px: the card lifts (ghost copy follows the pointer, tilted, shadow), the other cards slide aside to open a gap (CSS `translate` transition with a small overshoot), the dashed slot shows where it lands; release and the ghost glides into the gap. Esc cancels and the ghost flies back. Dragging one of several selected items moves the whole group (count badge). Folders and other items can be mixed freely in Custom order (owner's request, 9h); the "Move earlier/later" menu items swap with the direct neighbour, folders included. Name and Type sorts still list folders first.
- Dropping INTO a folder: hover over the middle of a folder card for 0.5 s (DWELL_MS): a round folder icon next to the cursor fills a ring, then pops and turns accent-colored, the folder lights up and grows, the dragged card shrinks; release to move inside. A folder does not jump away when the pointer merely brushes past it (PASS_MS 140 ms). Sidebar entries (Home, sections) and breadcrumbs light up instantly as drop targets. Works in cards, compact and list views.
- Database version 8 (automatic backup): renumbers every folder's contents with folders first, so existing libraries look exactly the same until you rearrange. Custom-order display is now purely by that number.
- Code: lib/reorderMath.ts (pure math, tested), lib/reorderDrag.ts (DOM engine), VirtualItems `reorder` prop, items carry data-item-id/data-kind, sidebar/breadcrumbs carry data-drop-folder. Backend: ItemRepository.placeMany + bulk action `place` (validated in validate.ts). Existing "Move earlier/later" menu items stay.
- Limit: in lists over 150 items (virtualized) there is no auto-scroll while dragging and only the drawn items can be rearranged in one drag; use "Move earlier/later" or drop onto a folder for longer distances.
- Verified by Claude: 19 new checks (math + backend: single/group/end moves, folders vs items, refusals, order numbers 1..n); test browser: tiny move does nothing, ghost + gap, drop calls place with the right neighbour, Esc cancels, folder dwell, sidebar drop, group drag, list view, alphabetical sort disables it, click after a drag does not select; older suites still pass.
- NOT verified (owner's PC): real Electron feel, actual frame rate of the animation, mouse behaviour on real hardware.

### 9i: no bottom bar, bolder selection
- The status bar at the bottom is gone (owner: too busy). Its item count, "N selected" and button row were removed; every action is in the right-click menu (single item: Open, Locate, Edit, favorites, done, Move to, Move earlier/later, Delete; several items: favorites, done, tags, Move to, Delete, Clear selection) and the keyboard (Enter, F2, Delete, Ctrl+A, Esc). Messages and errors now appear as a small floating note at the bottom centre (click to dismiss; info disappears after 7 s, errors stay until dismissed or replaced). CSS: `.statusbar {display:none}` is left in styles.css as a leftover.
- Selected items: 4 px accent frame with a soft halo and accent title (cards), thicker accent bar + stronger tint (list rows).
- Test browser: verified bar gone, 4 px outline, no errors; older drag/wallpaper suites pass. virt-test's "selected" counter line read the old bar and no longer applies.

### 9j: visual refresh (title bar, lighting, 3D covers, springy details, sounds)
- ONE slim bar (48 px, --titlebar-h in styles.css) replaces the Windows title bar + toolbar: the window uses `titleBarStyle: 'hidden'` (no Windows buttons) and the toolbar ends with our OWN minimize / maximize-restore / close buttons (components/WindowControls.tsx; thin rounded line icons, hover tint, close turns red and rotates; window actions through IPC window:control, state back through window:maximizedChanged). Empty parts of the toolbar and the sidebar's brand row drag the window (double-click maximizes); controls are no-drag. Consequence: the Windows 11 snap-layout flyout on the maximize button is not available (Win+Z and dragging to a screen edge still snap). The old app icon is the brand mark in the sidebar's top row.
- Background: dark gray (#1b1e25) with a soft light around the middle and a gentle shade at the bottom (`.app::before`, always on; the accent "Background glow" is separate). Light theme: soft gray (#e4e7ee) with a light centre. Window backgroundColor and the overlay color match.
- Covers: 3D tilt toward the pointer (max 9 deg, perspective 700) + a moving light reflection (`.card-sheen`), no more lift (hover scale 1.03). Tilt only with Motion = Full; sheen hidden when Off; both disabled while dragging. Code: ItemCard.tsx (CSS variables only, one rAF per move).
- Selection frame pulses once when an item becomes selected; the favorite star pops on / shrinks away on toggle (cards); buttons press inward (`press-in`, uses `scale`); menus and dialogs grow out of the last click (lib/clickOrigin.ts, Modal/ContextMenu set transform-origin).
- Sounds (Settings > Animations > Sounds, OFF by default): lib/sound.ts makes WATER-DROPLET sounds with the browser audio engine (no files; rising sine "bloops" with slightly random pitch; a splash with falling drops for the game screen/reader/folder drop): tap on buttons, select, pop (favorite), lift/drop (drag), soft drops for menus/dialogs. Volume raised about 3x in 9k. Setting `sounds` in settings.json. Not tied to the Motion setting.
- Spacing: grid gaps 26 x 22 px (was 22 x 18), compact 17 x 15 (was 14 x 12); VirtualItems constants updated; 5,000-item list still ends exactly at the last item.
- Verified by Claude (test browser): bar 48 px with all controls 32 px, tilt variables/transform/sheen, reset on leave, pulse class on select only, star on/off classes, menu/modal origin, sounds create no audio when off and do when on, background color, gaps, drag/reorder + wallpaper suites, 60 fps while moving over covers (median 16.7 ms, p95 16.7 ms), no errors.
- NOT verified (owner's PC, cannot run Electron): the real window buttons actually minimizing/maximizing/closing, window dragging and double-click maximize, resizing from the edges, maximized-state icon swap; actual sound; the look of the gradient on the owner's screen. If the buttons look off, the numbers to tweak are in main/ipc.ts (overlay colors) and styles.css section 12.

### 9k: sidebar icons (first step of the Xora/iiSU-inspired refresh)
- Owner's references: iiSU / Xora (emulation front-ends: light airy glass, big focused tile, bold rounded titles, capsule badges, button hints). Owner wants BOTH a light look and the Games screen restyled, but for now only individual icons/visual elements, STRUCTURE UNCHANGED.
- Sidebar: every entry has its own color (Home blue, All items violet, Favorites gold, Recent teal, Games pink, Reading orange, Video purple, Applications green, Settings gray) in a 36 px rounded icon tile (21 px icon, bolder stroke); hover grows/tilts the tile; the active entry gets a solid gradient tile with glow and a tinted row; works collapsed and in the light theme. Code: Sidebar.tsx (`tone` prop -> CSS variable --tone), styles.css section 13. Section ids games/reading/video/apps get fixed colors; other folders use gray.
- 9m (same step, remaining icons): clearer cover placeholder icons + bolder initials, bigger golden favorite star with glow, gradient Add button (plus icon turns on hover), larger view-mode icons with a gradient active state, search icon lights up on focus, rounder back/forward buttons, bigger window-button icons, green done check in lists. CSS section 14 only.
- Next candidates (not started, need owner's go): light "Xora-style" theme preset; Games screen with a tile column + big title; bold rounded display font (bundled, offline); capsule badges/buttons; colored kind icons on cover placeholders and toolbar.

### 9n: reader / game screen buttons vs. the window-drag area (bug fix)
- Bug (owner): reader top-bar buttons (Single/Double/Strip...) did not react. Cause: the toolbar and the sidebar's brand row are Electron window-drag areas (`-webkit-app-region: drag`); drag areas swallow clicks even when another element is drawn on top. Fix: while the reader or game screen is open (`.app.overlay-open`, also while a dialog is open) the toolbar and brand row are no-drag; the reader's own top bar is the drag area (buttons no-drag, title draggable); reader and game screen come after the toolbar in the page. Both views now carry their own minimize/maximize/close buttons (they cover the toolbar's).
- Also: `win.on('resize'|'move'|'maximize'|'unmaximize')` written out one by one (Electron 45 typings reject the loop). Owner upgraded to Electron 45.2.1 with `npm audit fix --force` (typecheck passes; app runs). If Electron's binary is "uninstalled" after an upgrade: `node node_modules\electron\install.js`.
- Verified in the test browser: classes/regions, Single/Double/Strip switch layouts, window buttons in reader and game screen, close returns. NOT verified: the real drag-area behaviour in Electron.

### 9o: "Airy" theme (step 2 of the Xora/iiSU-inspired refresh)
- Settings > Appearance > Theme now has Dark / Light / Airy. Airy = bright frosted glass over a pastel sky (lavender, mint, peach blobs + a white glow in the middle), white glass panels, deep blue-gray text, heavier titles, soft blue shadows. Setting value `theme: 'airy'` (ThemeMode in shared/types.ts, sanitizer in shared/settings.ts; old settings files stay valid). CSS: styles.css section 16 (all colors are tokens, so the accent color still works). The reader and game screen stay dark.
- Verified in the test browser (screenshots of the grid and Settings, no errors). NOT verified on the owner's screen (colors/contrast).
- Still open from the plan: step 3 Games screen restyle (tile column + big title + key-hint strip), bundled bold rounded font, capsule badges, colored kind icons.

### 9p: calmer palette, bolder lines, simple sidebar icons (owner feedback)
- Separator lines (all themes): new token --line (dark white 17%, light dark-blue 20%, airy blue 28%), 2 px for the sidebar edge, toolbar bottom, brand row, window-button divider, list header, menu separators; panels/menus/dialogs get a 1 px --line border.
- Sidebar icons replaced by simple SOLID glyphs, 26 px (components/navIcons.tsx): house, three bars (All items), star, clock, gamepad, open book, video, 2x2 apps, sliders, chevrons. No colored tiles any more: one calm look (dim -> accent when active, tinted row). The per-section colors of 9l were removed on request ("too garish and varied").
- Palette calmer: cover placeholders desaturated (hsl s 34-42%), flat accent Add/active-view buttons (no gradients/glows), Airy backdrop now tinted only by the accent color (no lavender/mint/peach).
- Verified in the test browser (3 themes, screenshots; drag + reader tests still pass). NOT verified on the owner's screen.

## Reminders for Claude
- NAME: the app is still called "Library" (working title). Owner asked to be reminded at the last moment, i.e. BEFORE Milestone 10 packaging, to choose the final name. Put the name in one constant (planned for Milestone 3) and keep the data folder independent of the display name (fixed internal ID).

## Known issues / risks
- `npm.cmd run typecheck` run by the owner on their PC (2026-10-17, after Milestone 7): clean, no errors. `npm.cmd run build` (production build) has still not been reported on; do it before Milestone 10 packaging. Run commands from the folder that contains package.json (C:\\Projects\\rancha on the owner's PC).
- The build sandbox cannot reach the npm registry, so Claude cannot install, type-check, build or run anything. All checking happens on the owner's PC.
- On the owner's PowerShell, `npm` must be typed `npm.cmd` (script-execution policy). Use `npm.cmd` / `npx.cmd` in all instructions.
- Project root on the owner's PC is C:\Projects\rancha\rancha (nested folder from unzipping); the folder with package.json is the real root.
- package.json uses "latest" for dependencies; package-lock.json (created on the owner's PC) pins them.

## Next step
1. Owner tests Milestone 9 (big lists), 9b (reader zoom) and 9c (game screen prototype) with `npm.cmd run dev` (no new packages).
2. Owner sends the list of game-section changes and visual changes; Claude groups them into small milestones for approval (ideas so far: wallpaper per game, Info drawer, playtime tracking, status, launch options, quick filters).
3. Later: README + LICENSE, custom tooltips (owner: "ask later"), final app name (REMIND before packaging), then Milestone 10 testing + packaging.

## 9q – Sidebar overhaul: flat colored icons
- The monochrome solid icons of 9p are replaced by small flat illustrations in natural colors (red-roof house, colored books, gold star, alarm clock, slate gamepad with colored buttons, red open book, clapperboard, colored app tiles, gear, amber folder), drawn from scratch in the style of the two example icons.
- Sidebar rows are taller (56px) with 36px icons, soft shadow, springy hover. Collapse arrows stay a plain line icon.
- Verified only in the headless test browser (dark/Airy/light), not in real Electron.

## 9r
- Sidebar icon glow is now centered (no downward offset); icon sits centered in its box.

## 9s
- Sidebar icons got the glossy finish (pack D): soft light-to-shade gradient over each icon shape (SVG mask, per-instance ids via useId). Verified in test browser only.

## 9t
- Sidebar back to the original simple line icons and original row style (the colored/glossy icon set in navIcons.tsx is unused but kept).
- Separator lines: 1px but clearer than at the start (dark .2, light .24, airy .34 alpha).
- New optional theme "Soft" (neumorphic): matte single-color surface, raised buttons/covers, sunken selected/search. Settings -> Theme.
- Verified in test browser only.

## 9u
- Removed the Soft theme (a saved "soft" setting falls back to the default theme).
- No separator lines at all (sidebar, toolbar, brand, headers); the sidebar is told apart by a different background tone, toolbar is transparent. Test browser only.

## 9v
- Font: Poppins (Regular/Medium/Bold, Latin subset woff, OFL) bundled in src/renderer/src/assets/fonts, used in all themes; base size 15px, bolder titles. Persian/Arabic text falls back to Segoe UI.
- Add button: bright green gradient, bigger, bold white text.
- Size slider hides below 1400px wide (it is also in Settings). Test browser only.

## 9w
- Search bar: frosted-glass look in all themes; no color/glow change on focus. Test browser only.

## 9x
- Sidebar icons 20->24px with bolder strokes (all sidebar items, for consistency); back/forward buttons 30->36px with bolder arrows. Test browser only.

## 9y
- Reader follows the theme (dark / light / airy) instead of always dark; top bar kept on one line with the wider font.
- Page-turn effect in Single and Double modes (lib/pageFlip.ts): the page swings around the spine in 3D with shading, forward and back, RTL (manga) mirrored. Not used in Strip, while zoomed, when Motion is Off, or for jumps of more than 2 pages (slider). Subtle motion = shorter turn. Plays the "whoosh" sound if sounds are on.
- Verified in test browser only (also fast repeated presses).

## 9z
- Page-turn effect now only in Double mode (removed from Single).
- Comics made of several folders (Chapter 1/, Chapter 2/ ... inside a folder, CBZ or CBR) are no longer merged into one long book. The first time you open such a comic it turns into a COLLECTION with one item per chapter (natural order, Chapter 2 before Chapter 10), and the app goes inside it. Each chapter is a normal item (cover from its first page, favorite, progress, drag, rename, delete). Where you had stopped is carried over: earlier chapters are marked read and the chapter you were in keeps its page. Chapter items store their location as "<book path>|<folder inside>" (| cannot be in a Windows file name; see shared/chapterTarget.ts). One-folder comics open as before. No database change. Tested with a real folder, a zip and a real database (check-chapters.mts).

## 9z3 - Big Picture mode (XMB-style)
- New "Big Picture" button in the sidebar, above Settings. Opens a fullscreen, controller-friendly mode (desktop mode untouched).
- Layout: cross menu. Top row = categories (Favorites, Recent, each top-level collection, Desktop); below it a vertical list of the items of the chosen category; right side = preview card (cover, title, badges, description). Animated gradient background with soft waves, follows the theme (dark/light/airy). Motion=Off stops the animation.
- Folders open inside the category; focus position is remembered per list.
- Controls - controller: D-pad/left stick (left/right = category, up/down = item, hold to repeat), A open, B back, X favorite, LB/RB category, LT/RT page up/down, Start exit. Keyboard: arrows, Enter/Space, Esc/Backspace, F, Q/E, PageUp/PageDown. Hints at the bottom switch between pad glyphs and keys depending on the last device used. "Desktop" category or Start/Esc at the root leaves the mode.
- Game screen / reader / dialogs work while in Big Picture; pad buttons are forwarded to them as keys.
- Window goes fullscreen on enter and back on exit (new fullscreenOn/fullscreenOff actions on the existing windowControl IPC).
- NOT verified: real Electron fullscreen, real controllers, Steam Deck. Verified only in the headless test browser with a mocked Gamepad API, plus node tests of the pure logic (gamepadMath.ts, bigPicture.ts). Very short button taps can be missed by polling.
- Known limit: no automatic return to Big Picture when a launched game closes (planned).

## 9z4 - Online artwork search (SteamGridDB)
- Settings > Online sources: the user's own free SteamGridDB API key (kept in settings.json; survives "reset settings").
- In an item's edit window: "Search online..." next to the cover and next to the wallpaper. Opens a dialog with the item's name already searched; pick the right game (chips), click a picture, then the normal crop step. Covers = SteamGridDB grids, wallpapers = heroes. Not shown for collections.
- Without a key the dialog shows how to get one. The app only goes online when this dialog is used.
- Safety: main process does the requests (key never leaves it except to steamgriddb.com); only https steamgriddb.com pictures are downloaded (15 MB cap); CSP img-src now also allows https://*.steamgriddb.com for the thumbnails.
- Files: shared/online.ts, main/steamGridDb.ts, IPC online:search/images/download, components/OnlineArtDialog.tsx.
- Verified: client logic with a fake server (check-sgdb: parsing, URL filtering, errors 401/429, key check) and the dialog flow in the test browser with mocked data. NOT verified: the real SteamGridDB server (endpoints and parameters written from memory of API v2), real Electron.
- Later: ScreenScraper (needs a developer id), Libretro thumbnails for emulator games, emulator profiles.

## 9z5 - Designed icons, gradient accents, label fixes
- Your PNG icons (book, gamepad x2, apps grid, play) are used for Games (purple gamepad), Reading (book), Video (play), Applications (apps grid) and the Big Picture button (rose gamepad), in the sidebar and in Big Picture. They are used as a MASK over a gradient (src/renderer/src/components/MaskIcon.tsx, assets/icons/*.png, 160 px), so they take any color.
- Settings > Icon color: Accent (gradient of the chosen accent), White, Black, Colorful (each section its own gradient). New setting iconTone (default accent). White icons are hard to see on the Light theme (your choice).
- Accent colors are now gradients (lib/accent.ts): Blue, Purple, Rose (new), Orange, Yellow, Green, Cyan, plus the custom picker (gradient computed). Gradients are also used on segmented switches, the logo mark, progress bars, the active-entry bar and badges.
- Fixed: labels in switches/buttons ("Left to right" etc.) no longer wrap onto two lines with the wider font.
- Verified in test browser only. Other sidebar icons (Home, All items, Favorites, Recent, Settings) are still the old line icons; the PNGs only replaced the five above.

## 9z6 - Emulators (RetroArch + standalone), step 1
- Database version 9: two new optional columns on items, `emulator` (id of an emulator profile) and `core` (RetroArch core file). Added automatically; existing data untouched (tested on a real database).
- Settings > Emulators: add profiles from presets (RetroArch, Dolphin, PCSX2, DuckStation, PPSSPP, RPCS3, Cemu, Ryujinx/Switch, melonDS, mGBA, Other). Each = program (.exe) + argument template ({rom}, {core}, {romdir}, {romname}). Stored in settings.json (so in backups; survive "reset settings"). Files: shared/emulators.ts, components/EmulatorsPanel.tsx.
- Game edit window: "Run with" (a PC game run directly, or one of the profiles). For RetroArch a core list is read from the "cores" folder next to retroarch.exe; cores that usually play the ROM's file type are marked with a star and the first is chosen automatically (hints in main/emulatorLaunch.ts, from memory).
- Launching (main/ipc.ts runWithEmulator + main/launcher.ts): starts the program WITHOUT a shell, arguments as a list (file names cannot inject commands), working folder = the program's folder. Clear messages for: emulator removed, program not found, core not found, core not chosen.
- NOT verified: the preset command lines and the core name hints are from memory; nothing was run against a real emulator or RetroArch; main/ipc.ts was not type-checked (no Electron types here). Tested: argument building, core suggestion, validation, settings cleanup, real-database migration and create/update, launcher routing (check-emu), and the dialogs in the test browser.
- Not yet: scanning a folder of ROMs, importing RetroArch playlists, Libretro thumbnails/hash matching, automatic return to the library/Big Picture when the emulator closes.

## 9z7 - ROM folder scan + tidier Settings
- "Add a whole folder": new content choice "Console games (ROMs)". Finds console game files by extension (nes, sfc, gba, n64, nds, gcm/rvz/wbfs, iso/cue/chd/pbp/cso, m3u, md, sms, pce ... see shared/emulators.ts ROM_EXTENSIONS). Left out on purpose: .bin (a .cue stands for it) and .zip/.7z (too ambiguous). Names are cleaned: "Super Mario World (USA) [!]" -> "Super Mario World".
- You choose the emulator for the folder ("Run these games with"). With RetroArch, each game also gets the most likely installed core for its file type (none if no installed core fits; edit the game to pick one). Importing the same ROMs again skips duplicates.
- Because .iso/.chd/.cue can be PS1, PS2 or GameCube, scan one console folder at a time (or keep one folder per console, which the scan keeps as collections).
- Settings is now three tabs: Look and feel / Games, reading and online / Backup and about. The last tab used is remembered.
- Verified: scan on a real temp folder, name cleaning, validation, import into a real database (check-roms), dialog and tabs in the test browser. NOT verified: real emulators, real RetroArch core folders, Electron, ipc.ts type-check.

## 9z8 - ROMs separated from PC games, simpler Emulators
- Add menu: "App or game..." became "PC game or app..." and a new "Console game (ROM)..." entry opens the same form in ROM mode: file dialog lists console game files first (no more switching to "All files"), the emulator is preselected (first one in Settings), the name is cleaned ("Game (USA)" -> "Game"), RetroArch core chosen automatically. Also, when you pick an emulator in any game's edit window, Browse switches to the ROM file list.
- Settings > Emulators simplified: pick one from the list -> the program file dialog opens immediately -> done. Each emulator is one compact card (name, program path, Change/Remove); the name and command-line arguments moved under "Advanced".
- Libretro covers dropped from the plan (decision).
- Verified in test browser (menu, dialog flow, saved fields) and node tests; real emulators/Electron not verified; main/ipc.ts and main/fileKinds.ts changes not type-checked.

## 9z9 - Games kept as folders (Wii U, PS3...)
- A ROM can now be a FOLDER: in "Console game (ROM)" there is "Choose folder..." next to Browse.
- New per-emulator setting (Settings > Emulators > Advanced): "Main file inside a game folder" (relative path, `*` allowed, e.g. `code\*.rpx`). New token {entry} in the arguments = that file found inside the game folder ({rom} stays the folder/file itself). If the game is a plain file (e.g. a .wua), {entry} is the file itself. Empty setting = the folder is passed as it is.
- Presets (from research, still UNVERIFIED on a real PC): Cemu `-f -g "{entry}"` + entry `code\*.rpx` (a script on GitHub launches Cemu exactly this way with a .rpx inside code); RPCS3 `--no-gui "{entry}"` + entry `PS3_GAME\USRDIR\EBOOT.BIN` (forum posts say RPCS3 starts from a game folder containing EBOOT.BIN; the exact command line was not confirmed).
- Folder scan, "Console games (ROMs)": new tick "Every sub-folder is one game": each sub-folder of the chosen folder becomes one game named after the folder (loose ROM files too).
- .wua (Wii U archive) added to ROM file types.
- Tests (check-folders): entry search with wildcards and case-insensitivity, ".." rejected, argument building, profile cleanup (old profiles without the field still load), real-folder scan. Dialogs in test browser. Not verified: real Cemu/RPCS3, ipc.ts type-check.

## 9z10 - the emulator must be chosen explicitly
- "Console game (ROM)": no emulator is preselected any more ("Choose an emulator..."); saving without one is refused. With RetroArch a core must be chosen too.
- Folder scan of ROMs: the Add button stays disabled ("Choose an emulator first") until an emulator is picked.
- RetroArch cores are never guessed for file types that fit several consoles (.iso, .cue, .chd, .m3u, .pbp, .ciso): the user picks. Unambiguous types (.sfc, .gba...) still get the likely core filled in, visibly, and it can be changed.
- Known gap: "Add several files at once" / drag and drop cannot handle ROMs (they are skipped as "unsupported file type") and a mix of everything; folders dropped there go to the folder scan one type at a time. Planned: a sorting step that asks an emulator per kind of ROM.

## 9z11 - clear "required" feedback for the emulator field
- Saving a console game without an emulator (or, for RetroArch, without a core) no longer prints a line at the bottom of the form (easy to miss, needed scrolling). Now: a small popup "Missing information" with OK (new components/NoticeDialog.tsx), then the empty field is scrolled into view, focused, outlined in red, with a small red "!" and "Required: choose an emulator/core". The marking disappears when the field is filled.
- Verified in the test browser (screenshots checked); other form errors (e.g. missing name) still use the old line at the bottom.

## Name and icon (decided)
- Final name: **Rancha** (APP_NAME in src/main/appInfo.ts, window title, Settings fallback). APP_ID was `personal-library` until 2026-11-25, then changed to `rancha` (data folder `%APPDATA%\rancha`, Linux `~/.config/rancha`). No automatic move: the release notes must tell users of older versions to move their old `personal-library` folder to the new place by hand.
- App icon saved at build/icon.png (1024x1024) and build/icon-256.png; used later by packaging (Milestone 10). Not yet wired into the window.
- License of the icon artwork and the sidebar PNG icons: origin not yet confirmed by the owner (open item before public release). Project LICENSE not chosen yet.

## 9z12 - Linux readiness (code level)
What changed (all verified only by node tests run on Linux in the test sandbox; never in real Electron, never on a real desktop):
- Launching on Linux (`src/main/platformLaunch.ts`): `.sh`/`.run` are run (with `sh` if not executable), AppImage/`.x86_64` are run directly (clear "chmod +x" message if not executable), extensionless executables are run, `.desktop` launchers run their `Exec=` line (no terminal launchers), `.url` shortcuts open only `steam://` / `http(s)://` links. Windows behaviour is unchanged (system opens the file). Videos/PDFs are never run, even with the execute bit.
- Emulators: a program given by name only (e.g. `retroarch`, found through PATH) is accepted. RetroArch cores are searched in the program's `cores` folder plus, on Linux, `~/.config/retroarch/cores`, the Flatpak data folder and `/usr/lib/libretro` (folders from memory, unverified). Flatpak: set the program to `flatpak` and put `run org.libretro.RetroArch ...` in the arguments (not tested; Flatpak may not see ROM folders without permission).
- Chapter separator for comic chapters changed from `|` to an invisible character; database version 10 converts old data (tested on a real database).
- Duplicate checks are case-insensitive only on Windows (`src/main/pathKey.ts`).
- Program types: Linux also lists `.sh .appimage .desktop .run .x86_64` (Windows keeps its own list); folder scan also finds extensionless executables; file dialogs add "AppImage".
- Texts no longer say "Windows"; example paths follow the system.
Not done / unknown: real Linux desktop run, Steam Deck, Wine/Proton profiles, Flatpak/Snap sandboxes, Linux window frame, packaging (AppImage).

## 9z14 - Packaging and GitHub release (prepared, NOT yet built anywhere)
- electron-builder configured in package.json ("build"): Windows NSIS installer + portable, Linux AppImage; icon from build/icon.png; scripts `dist:win`, `dist:linux`; output folder `release/`.
- `.github/workflows/release.yml` builds both on GitHub (tag `v*` or manual run) and creates a Release.
- README.md, LICENSE (all rights reserved, owner "Aria Sama"), THIRD_PARTY_NOTICES.md, docs/RELEASING.md, docs/RELEASE_NOTES_v0.1.0.md added.
- The sandbox has no npm registry/GitHub access, so electron-builder and the workflow have NEVER been run. First real test: `npm.cmd install` then `npm.cmd run dist:win` on Windows, then the Actions "Run workflow".
- Open: icon artwork license, final LICENSE choice, appId `com.rancha.app` (placeholder), repository URL.
- Update: owner name "Aria Sama"; LICENSE changed to proprietary (all rights reserved); repository should be private, downloads via a separate public releases repository (docs/RELEASING.md). Main app icon is AI-made; the UI icons come from Flaticon (free license, needs attribution; author names still to be supplied by the owner). Credits line added in Settings > About.
- Icon credits added for game (sonnycandra), book (Good Ware), play (UIcons/Flaticon); apps + second game icon still missing links.
- Apps icon credit added (UIcons/Flaticon). All icon credits supplied; video-game.png assumed to be one of the supplied icons (to confirm).

## 0.1.1 (prepared)
- Owner confirmed: tested installed Windows app and 9z5-9z11 features (OK), Linux AppImage tested by two people (OK).
- New libraries start empty (4 top-level sections only; tested with node:sqlite). Existing databases are untouched.
- Skipped by owner for now: classification of "Add several files", automatic return after a game closes. ScreenScraper waits for the owner's devid.
- Flaticon icons stay (credits kept; owner accepted the licence risk).

## 9z19 - card label + book icon (for the next release)
- Cards no longer show "App / Game" / "Video" / "Reading" under the name; a long name now wraps to a second line (max 2, then "..."). Collections still show "N items"; search results still show the location. Card text block has a fixed height (40 px) so the virtualized list keeps equal rows (tested in the test browser: all card heights equal).
- Book icon redrawn (own design, same line weight as the others, ~13 px at 160 px). Good Ware credit removed because the Flaticon book is no longer used.

## 9z20 - main sections protected
- Games, Reading, Video and Applications (ids games/reading/video/apps, top level) can no longer be deleted or moved inside another collection (checked in the database layer, so every path is covered: menu, Delete key, bulk, drag, move dialog). They can still be renamed and filled. The context menu hides Delete and "Move to…" for them; the Delete key shows a short message.
- Older libraries: when a main section is missing, it is created again (empty) every time the library opens, unless a top-level collection with the same name already exists (shared/protectedSections.ts, db/sampleLibrary.ts ensureMainSections). Tested on real node:sqlite and in the test browser.

## 9z21 - manga cover kept when a manga becomes a collection
- Cause: the first time a manga with several chapter folders is opened, it is converted into a collection. Collections cannot show the automatic first-page cover, so the cover disappeared (and did not come back).
- Fix: on conversion the cover the book was showing is saved as the collection's own cover (an own cover is never replaced). Applies to manga opened from now on; a manga already converted has no cover and needs one set by hand once.
- Verified only by a node test with a real database (check-cover-tree); real Electron behaviour is not verified.

## 9z22 - video covers, Big Picture mouse, new icon, hand cursor
- Videos (16:9 covers were tried and dropped again - covers stay 2:3): a video without its own cover shows ONE frame (centre-cropped to the card), grabbed by the interface from a hidden <video> (served by the private `library-video://item/<id>` address, which only serves videos that are in the library). The moment is random between 10% and 25% of the length (past the intro, early enough not to spoil), chosen once and cached like first-page covers. Unsupported formats simply keep the coloured placeholder.
- Big Picture mouse: wheel scrolls the list, Shift+wheel / wheel over the category strip changes category, one click opens, right-click on a row toggles favorite, right-click on empty space or the mouse "back" button goes back, Back / Favorite buttons, click the big cover to open. (Round arrow/chevron buttons were tried and removed - they looked bad.)
- New app icon (build/icon.png, icon-256.png) from the supplied artwork on a rounded white tile.
- Cursor: white pointing hand with a blue outline replaces the pointer everywhere in the app, and is the cursor on all of Big Picture (src/renderer/src/assets/cursors, hotspot = fingertip).
- Verified in the test browser / node only: layout 16:9, wheel/click/arrow behaviour, frame-grab logic with a real WebM served with Range support, previewTime/auto-cover tests. NOT verified: real Electron (the library-video protocol, H.264/MKV playback, cursor hotspot).

## 9z23 - fixes after 9z22
- Removed the arrow / chevron buttons in Big Picture; videos keep 2:3 covers.
- Video preview did not work. Cause (reproduced in the test browser): a picture drawn from a video served from another address (library-video://) makes the canvas "tainted" and the browser refuses to save it. Fix: the video address now answers with a CORS permission (Access-Control-Allow-Origin + corsEnabled scheme) and the video element asks with crossOrigin="anonymous". Checked in the test browser against a real WebM: without the permission it fails, with it it works. NOT verified in real Electron.

## 9z24 - Settings reorganised, emulator list simplified
- Settings now has a side menu with one topic per page: Appearance (colors, shape and effects), Size and motion, Comic reader, Emulators, Online covers, Backup, About. The last page you looked at is remembered (old saved tab names are mapped). Narrow windows show the menu as a row.
- Emulators: one compact line per emulator (name, program path, Choose/Change, remove ✕); name / arguments / main file moved into "Advanced" (also the RetroArch cores note); the add row is one dropdown + "+ Add"; shorter intro text.
- Same settings and options as before, only moved. Verified only in the test browser (every page opened, no errors).

## 9z25 - online art: more databases, chooser, select-then-confirm, loading
- "Search online…" first asks which database: TMDB (movies/series, needs a free key), AniList (anime/manga, no key), TVmaze (series, no key), SteamGridDB (games, needs key). The best one for the item (video -> TMDB, manga/comic -> AniList, games -> SteamGridDB) is marked "Recommended"; databases without a key show "Key needed" and explain how to get it. New Settings > Online covers row for the TMDB key; TMDB credit line in About and THIRD_PARTY_NOTICES.
- A first click on a picture only SELECTS it (bright ring). Click it again, double-click, press Enter, or press "Use this picture" to download it. Spinner while searching, while the picture list loads and while downloading (the dialog dims and shows "Downloading the picture…"), so there is no silent wait.
- Code: main/onlineArt.ts (Tmdb, AniList, TvMaze, OnlineArt service), shared/online.ts (provider list, string ids). Picture hosts are allow-listed per database (https only).
- Verified: node test check-online with MADE-UP server answers (parsing, host checks, keys, errors) and the dialog in the test browser. NOT verified: the real servers (this sandbox has no internet) - e.g. exact TMDB/AniList/TVmaze answers may differ from my reading of their docs.

## 9z26 - online thumbnails of the new databases did not show
- Cause: the page's security policy (img-src in index.html) only allowed thumbnails from steamgriddb.com, so pictures from AniList / TMDB / TVmaze were blocked (broken-image icon), although downloading worked (it goes through the main process). Fix: image.tmdb.org, *.anilist.co and *.tvmaze.com added to img-src. Not verified in real Electron (the sandbox cannot run it).

## 9z28 - music player (5th section "Music")
- New kind of item "audio" (mp3, flac, ogg/oga/opus, wav, m4a, aac, weba - only what the built-in player can decode). **Database schema 10 -> 11** (the allowed-kinds rule of the items table is extended by rebuilding the table; tags, reading progress and covers are kept; a backup is made automatically as for every upgrade). A "Music" section is added to existing libraries.
- Add > "Music file…", "Add several files", "Add a whole folder > Music" (folders = albums are kept). Double-click plays; the songs of the same folder become the queue.
- Player engine (state/usePlayer.ts + shared/playerQueue.ts): play/pause, previous (restarts after 3 s), next, seek, volume, shuffle, repeat off/all/one, continue with next song, skips a broken file, system media keys (Media Session). Streams through a private address library-audio://item/<id> (only audio items of the library, Range supported).
- Overlay (components/MiniPlayer.tsx): hidden / small / expanded, 4 corners, floats over the library, comic reader and game page, only while a song is loaded. Small: title, play/pause, next, enlarge, hide. Expanded: seek bar, controls, volume, queue.
- Music page: the Music section shows a "now playing" panel with the queue above the normal list.
- Big Picture: music button at the top right (or key M) opens a panel with controls and the settings (overlay mode, corner, continue-next); if the overlay was hidden the button brings it back.
- New settings (settings.json): musicVolume, musicOverlay, musicCorner, musicShuffle, musicRepeat, musicAutoplayNext.
- Limits: the overlay lives INSIDE the app window, so it cannot float over an external game or emulator (a separate always-on-top window would be a later step). No cover art/tags from files yet (title = file name). Gamepad buttons do not control the player yet.
- Verified only in node tests (check-music-db: upgrade from a real v10 database, data kept, bad kinds refused, cascade ok; check-player: queue rules + settings; check-music-scan) and in the test browser (a real WAV through the player: play/pause/next/previous/shuffle/overlay states/Big Picture panel). NOT verified in real Electron: the library-audio protocol, codecs, real files.

## 9z29 - music overlay look
- The overlay had dark text on a dark panel in light themes (unreadable): it now always uses its own light-on-dark colours.
- Small state is now only a note icon, a green dot while playing, the song name and one enlarge button (no play/next/hide). Hide (✕) is in the expanded state; Big Picture's music button / Music page checkbox bring it back.
- Verified only in the test browser (screenshots, light theme).

## 9z30 - Big Picture footer, one music indicator, overlay in full-screen reader
- Big Picture footer: only Open / Back-or-Exit / Favorite, plain (no colours), bottom left. Removed: Category hint, mouse tip, Exit Big Picture / Favorite buttons, "Controller connected" note.
- Big Picture showed two music displays (the overlay and the top-right button): now the overlay is not drawn in Big Picture; the music button shows "● song name" and opens the panel.
- Manga reader: full screen uses the browser's real full screen, which shows only the reader element, so the overlay never appeared there. The overlay is now rendered INSIDE the reader (and not twice).
- Verified only in the test browser: Big Picture (screenshot, element counts), reader with the overlay inside it and the fullscreen element being the reader. Real Electron full screen not verified.

## 9z31 - scrolling song names (marquee)
- components/Marquee.tsx: a song name too long for its box slides left to the end, pauses, and restarts; short names stay still; the tooltip shows the full name. Used in the overlay (small and expanded), the Big Picture music button and the Music page header. With animations "off" in Settings it falls back to "…".
- Verified only in the test browser (long name moves, short name does not).

## 9z32 - marquee always on
- Long song names slide even when animations are "off" (Settings) or Windows "reduce motion" is on (override with higher specificity). Verified only in the test browser (data-motion=off: the name still moves).

## 9z33 - built-in video player (stage 1: Chromium engine)
- Videos now play INSIDE the app (full window / full screen, themed with the app's dark/light/airy theme and accent colour). Settings > "Video and music" can switch back to the Windows player. Item context "open" and Big Picture use the same path; `library.open(id, external)` forces the Windows player.
- Controls: play/pause, seek bar (buffered, hover time, drag), ±10 s, volume (wheel), mute, speed 0.5–2×, full screen (F / double-click), auto-hiding bars; keys: Space/K, ←/→ (Shift = 30 s), J/L, ↑/↓, M, F, C, Z/X (subtitle delay), [ ], N/P, Home, Esc.
- Playlist: next/previous video of the same folder (natural order, 2 before 10); when a video ends the next one starts (setting). Reaching 90% marks it as watched. The music overlay is shown inside the player; starting a video pauses music.
- Subtitles: .srt, .vtt, .ass/.ssa next to the video (same name start, or in Subs/Subtitles folders) are found automatically (first one on by default); encodings UTF-8/UTF-16/Windows-1256 (Persian/Arabic)/1252 are detected; "Add a subtitle file…"; size, delay, optional dark box; Persian/Arabic text is shown right-to-left; <i>/<b>/<u> supported; ASS styling is reduced to plain text (no colours/positions).
- Resume position: remembered per video in the app's browser storage (localStorage inside the data folder; NOT part of backups); cleared near the end.
- When a file cannot be played the player says so (error, picture-less, or no decoded sound after 4 s) and offers "Open with the Windows player".
- LIMITS of this stage: only what Electron's Chromium can decode. Embedded subtitle tracks and multiple audio tracks inside MKV are NOT available; HEVC/H.265 depends on the PC, AC3/DTS audio, AVI/WMV and some other formats may fail. Stage 2 (ffmpeg engine: re-wrap/convert on the fly, embedded subtitles, audio-track choice) is the plan for "all formats"; it adds an ffmpeg program (~70–80 MB) to the app.
- Verified only in node tests (check-subs: SRT/VTT/ASS parsing, cue lookup, labels; check-subfiles: finding files, encodings, launcher routing builtin/external) and in the test browser with a real WebM + generated subtitles (play, seek, volume, speed, subtitle switch/delay/add, next/previous, auto-next, resume, themes dark/light). NOT verified in real Electron: the library-video protocol with real files, real codecs, real full screen, the Persian code-page detection with real files.

## 0.3.0 (prepared)
- Version set to 0.3.0 in package.json and package-lock.json; README status line updated.
- Contents: music section and player (9z28-9z32), built-in video player stage 1 (9z33), Linux .tar.gz download.
- Database schema 10 -> 11 on first start; a copy is kept in backups/library-before-upgrade-v10.db; older app versions refuse the upgraded library.
- Dependencies pinned to exact versions again (they had gone back to "latest"); Node >= 22 recorded in package.json "engines" and .nvmrc.
- New CI workflow (npm ci, typecheck, build on every PR and push to main/collab) and Dependabot (weekly npm, monthly GitHub Actions).
- Release workflow: stops if the tag does not match package.json, uploads the .tar.gz, and uses docs/RELEASE_NOTES_<tag>.md as the release text.
- Release notes: docs/RELEASE_NOTES_v0.3.0.md. Not yet built or tested as a release.

## 1.0.0 (prepared)
- Version set to 1.0.0 in package.json and package-lock.json; README status line updated. A major version (not 0.3.1 or 0.4.0) because this release is very different from the earlier ones (for example, the data folder changes name). Release notes: docs/RELEASE_NOTES_v1.0.0.md.
- Data folder: APP_ID is now 'rancha' (was 'personal-library'). Nothing moves the old folder; the release notes explain the manual move for Windows and Linux.
- Music: song details and covers read from the files' own tags (mp3/ID3, FLAC, Ogg Vorbis/Opus, MP4/M4A, WAV), cached in song-info.json; the database is not changed.
- Music player: new Slider (click, drag, wheel, time bubble) for position and volume.
- Seeking fix: Electron's net.fetch on file:// ignores Range (answers 200 with only the asked bytes, no Content-Range), so jumping in a song fell back to the start. src/main/fileRange.ts now answers 200/206/416 by hand for library-audio and library-video. Verified in a node test on a real file (whole, 100-199, 100-, -50, past the end); NOT verified in real Electron playback.
- Queue: the play order (the folder) is hidden; the visible queue holds only songs added by hand ("Add to queue" in the right-click menu, also for a multi-selection). Queued songs play first, then the folder continues from where it was. In the queue: drag to reorder, double-click = play now, right-click = Play now / Move to top / Move to bottom / Remove / Clear. A queue button (with a count) shows or hides the queue in all players (setting musicShowQueue).
- List view: clicking "Name" sorts A-Z / Z-A with an arrow; the Music section hides the Type, Tags and Added columns.
- The small floating player follows the theme (it was always dark); Big Picture's music panel stays dark on purpose.
- Verified: typecheck and build. NOT verified in the running app.

## 1.1.0 (prepared)
- Version set to 1.1.0 in package.json and package-lock.json; README status line updated (only the Linux game section is called untested now). A minor version: new features, no change to the data folder or the database. Release notes: docs/RELEASE_NOTES_v1.1.0.md.
- Music page: three panes (queue "Up next" / the folder's songs / now playing with big cover and controls), side panes resizable with saved widths (musicQueueWidth, musicNowWidth); narrow windows stack "now playing" above the list. Replaces MusicHeader.tsx.
- Song list with columns (cover, title, artist, album, album artist, year, genre, track, disc, length, file name, added, tags), chosen from the header's right-click menu (musicColumns). Click a column name to sort A-Z / Z-A (musicSort); folders first, empty values last, ties keep album order.
- Column widths: drag the edge of a column name (all but cover and title); while dragging only CSS variables (`--mc-<column>`, `--mc-min`) change, the width is saved on release (musicColumnWidths). Double-click the edge or "Normal column widths" resets. The list scrolls sideways when the columns do not fit.
- Songs shown and searched by their tags (title, artist, album, genre); details read in the background, list re-sorted / re-searched as they arrive.
- Queue: middle-click adds a song (list, cards, rows), shown as a hint next to "Add to queue"; the same song can be queued several times (entries handled by position); items show number and small cover; the pane shows count and total length.
- System media controls (MediaSession) show the song's own title, artist and album.
- Seek bar follows a smooth clock every frame and no longer flicks back after a click or drag. Big Picture: fast wheel turns count every step and scroll smoothly.
- Context menus: check-mark entries, entries that keep the menu open, a dimmed hint at the right.
- New settings are sanitized: unknown columns dropped, widths clamped, old null sort values fall back to sorting by title.
- Verified: typecheck. NOT verified in the running app (in particular dragging column edges and the pane handles).

## 1.1.1 (prepared)
- Version set to 1.1.1 in package.json and package-lock.json. A patch version: no new app features, no change to the data folder or the database. Release notes: docs/RELEASE_NOTES_v1.1.1.md.
- Linux: the .tar.gz download is replaced by an Arch Linux package (pacman target, zstd, Rancha-<version>-linux-x86_64.pkg.tar.zst); the AppImage stays. electron-builder's default pacman depends (http-parser, libappindicator-gtk3) no longer exist in the Arch repos, so package.json lists its own: gtk3 nss alsa-lib libxss libxtst libnotify libsecret xdg-utils. maintainer and synopsis set (fpm needs a maintainer).
- Release workflow uploads *.pkg.tar.zst instead of *.tar.gz. README: Arch install/remove lines, AppImage name fixed (x86_64, not x64).
- Dependencies (Dependabot #9): electron 45.2.1 -> 45.4.1, pdfjs-dist 6.4.299 -> 6.5.438, vite 8.3.4 -> 8.3.8, @vitejs/plugin-react 6.1.2 -> 6.3.0, @types/node 26.6.5 -> 26.6.6. GitHub Actions bumped (checkout 7, setup-node 7, upload-artifact 7, download-artifact 8, action-gh-release 3); Dependabot groups action updates into one PR.
- Verified: npm run dist:linux on Arch builds both files; pacman -Qip reads the package (name, version 1.1.0-1 at test time, description, depends). NOT verified: installing it with pacman -U, and the build on GitHub's Ubuntu runner.
