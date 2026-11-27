# Status of the Qt rewrite

## Decisions (agreed)

- Rewrite from scratch in C++20 and Qt 6 (Qt Quick/QML), in this folder, next to the Electron app (which stays as it is).
- Windows and Linux together from the start. Order of the milestones: see MILESTONES.md.
- Qt-free core (testable without a window) + thin Qt/QML layer. SQLite will keep the current schema (v11) so existing libraries import.
- The sandbox where Claude works has no Qt and no internet to fetch it: Claude can build and run only the core and its tests.
  The Qt window is built by the owner (and by CI) and results are reported back. Everything Qt-related is "unverified" until then.

## Q1 - skeleton - WRITTEN, waiting for the first build on the owner's PC

- core: `rancha::naturalCompare` (numbers inside names compared by value: "Episode 2" before "Episode 10") + 257 checks.
  VERIFIED (built with g++ 13, cmake, ctest; passed).
- app: a Qt Quick window that shows the core version and a natural-sort demo through a QML singleton (`CoreInfo`).
  NOT VERIFIED: never compiled (no Qt here). Expect small CMake/QML fixes on the first build.
- CI: `.github/workflows/qt-ci.yml` builds and tests on windows-latest and ubuntu-latest with Qt 6.8.* (jurplel/install-qt-action@v4).
  NOT VERIFIED: never run.
- The Windows preset uses the "Visual Studio 17 2022" generator (needs VS 2022 Build Tools).

## Q2 - theme, sidebar of five sections, sample library UI - WRITTEN, waiting for the build on the owner's PC

- core (VERIFIED, 320 checks, g++ 13): colors (hex/hsl/mix), theme palette (dark/light/airy, accent presets, corners, glass, motion;
  values ported from the Electron CSS), placeholder covers (gradient from hue + initials, UTF-8 aware), library sorting
  (natural name order, 7 sort modes) and breadcrumb path, the invented sample library (42 items) and a deterministic stress library.
- app (NOT VERIFIED, never compiled): `ThemeBridge` (palette -> QML), `LibraryModel` (QAbstractListModel), QML: sidebar with the
  five sections, top bar (back/home/breadcrumb, covers/compact/list, sort), settings strip (theme, accent, corners, glass,
  motion, card size), virtualized grid + list, favorite star (memory only), test libraries of 5 000 / 50 000 items.
- Known simplifications: no real icons yet (Electron PNG icons come later), glass is only a translucent color (no blur yet),
  cards use a vertical gradient (not diagonal), nothing is saved (settings come with Q3).
- What to check: window opens; section click opens its folders; folders open on click, breadcrumb works; theme/accent buttons change
  colors; scrolling stays smooth with 50 000 items. Send any error text.

## Q2.1 - look closer to the Electron app - WRITTEN, waiting for the build

- After the first screenshots (Q2 worked on Windows: build, windeployqt, window opens) the look was brought closer to Electron:
  Poppins fonts (the same .woff files), line icons drawn as vector paths (`Icon.qml`), the designed PNG section icons tinted with the accent
  (`SectionIcon.qml`, QtQuick.Effects), new cards (no frame, name + "N items" under the cover, faint kind icon, initials, hover ring),
  sidebar (Home / All items / Favorites / Recent / COLLECTIONS / Big Picture / Settings / Collapse), top bar (Add, search, tag filter,
  size slider, sort menu, three views), look settings moved into a panel opened from "Settings".
- Only drawn, not working yet: Add, search, tag filter, All items, Favorites, Recent, Big Picture, forward button (Q4/Q5/Q9).
- Core: unchanged (still 320 checks, VERIFIED). Counts of items per folder are computed in the Qt model (not tested separately).
- NOT VERIFIED: everything in app/ (never compiled here). Risks: .woff loading (if it fails the system font is used and a warning is
  printed), "Poppins Medium" family name, MultiEffect tint, vector icon rendering.

## Q3 - data model and storage - WRITTEN AND TESTED (core), app part waits for a look on screen

- `core/` stays without Qt. New libraries (owner's OK): SQLite (the system one on Linux; the 3.54.1 amalgamation in
  `third_party/sqlite/` with `RANCHA_BUNDLED_SQLITE=ON`, used on Windows) and nlohmann/json 3.12.0 (`third_party/nlohmann/`).
- `database`: schema v11 with the same 11 migrations as `src/main/db/database.ts`, a copy in `backups/` before an upgrade,
  a newer library is refused, the five main sections always exist.
- `data_paths`: the Electron data folder exactly (`%APPDATA%\rancha`, `$XDG_CONFIG_HOME/rancha` or `~/.config/rancha`).
- `settings`: the full `sanitizeSettings` + emulators + `SettingsStore` (safe save, damaged file moved aside, reset keeps keys,
  backup choice and emulators); the file looks exactly like `JSON.stringify(settings, null, 2)`.
- `item_repository`: every method of `itemRepository.ts` (create, import tree, update, favorites, done, tags, move, delete,
  reorder, place, reading progress, chapters, snapshot) with the same SQL and error texts. `Item` now has all fields.
- App: `LibraryModel` opens the real library (falls back to the sample and prints why); favorites are saved.
  `ThemeBridge` reads the look from `settings.json` and saves every change. `setDesktopFileName("rancha")`.
  Sidebar test chips: Library / Sample / 5 000 / 50 000.
- VERIFIED on Arch (Qt 6.12.0, g++): core + app build with no warnings, 549 checks pass (also with the bundled SQLite);
  copies of two real libraries and settings files opened with the right counts; first start in an empty folder creates a
  v11 library with the five sections; the app starts offscreen with no QML errors.
- NOT VERIFIED: the window on KDE/Windows, a build on Windows. `pathKey` folds only A-Z on Windows (JavaScript folds all
  letters). Left for later: `Backup` (Q7), item editing in the UI (Q4), song-info.json and window.json (Q12 / window work).

## Q5 - search, filters, sorting, All items / Favorites / Recent - DONE (core tested, app built), waiting for a look on screen

- Done before Q4 because it needs no editing UI.
- core: `library_query` is a port of `src/renderer/src/lib/libraryQuery.ts` and of the "Decide which items to show" part of
  `App.tsx`: word scoring (exact name, start of name, start of a word, inside the name, song title / artist, tags,
  folder names, description), every word must match, filters (type, favorites, tags = ALL of them, any case), search
  limited to a folder and everything below it, `sortItems` / `sortResults` (custom order = best match while searching),
  tag list with counts, where an item lives ("Video › Anime"), and `buildView`: plain browsing shows one folder; a search,
  a filter, All items, Favorites and Recent show a flat list ("Recent" in custom order = most recently opened first).
- app: `LibraryModel` uses `buildView`. Sidebar Home / All items / Favorites / Recent work. Search box (Ctrl+K, Esc clears),
  "Only here / Everywhere" chip while searching inside a folder, tag menu (tick to add or remove, "Clear tags"). A flat list
  shows its title and count instead of the path, and each card says where the item lives. Opening another place clears the
  search and the tags (as `navigate()` does in Electron). Taking an item out of Favorites on the Favorites page removes it.
- VERIFIED on Arch (Qt 6.12.0, g++): core + app build with no warnings, 581 checks pass (`tests/test_library_query.cpp`),
  the app starts offscreen with no QML errors.
- NOT VERIFIED: the window by eye (on Linux or Windows), a build on Windows. Known differences: lower case folds A-Z only
  (Persian/Arabic have no case, so the same result). Not done yet: a type-filter control on screen, song tags in the search
  (Q12), the forward button / history (later).
- What to check: type in the search box at Home and inside a folder (try "Only here"), pick one and then two tags, open All
  items / Favorites / Recent, change the sort on each, remove a favorite on the Favorites page, try it with the 50 000 library.

## Q4 - adding, editing, moving, menus, drag and drop - DONE (core tested, app built), waiting for a look on screen

- `nav_history` (back / forward trail, skips deleted places, keeps the last 60) and `selection` (Ctrl+click, Shift+click range,
  Ctrl+Shift+click, Ctrl+A, prune after delete/move, display order): ports of the Electron lib files.
- `crop_math` (cover / wallpaper cropper: fill, fit, zoom around the center, drag limits, output and stored sizes),
  `file_kinds` (Node-like basename / dirname / extname, item kind by extension per system, display names, ROM names,
  page pictures, UTF-8 paths) and `launch` (chapter targets, tokenize, .desktop / .url, the Linux launch plan,
  opening an item, missing items, games vs. apps, "Played 3 days ago" in the local time zone, done status and labels).
  `file_kinds.cpp` and `launch.cpp` are now part of `rancha_core`.
- `folder_scan` + `scan_tree` (the "Add a folder" scan): content choice (all / videos / comics / games), with or without
  sub-folders, picture folders as comics (one picture is not a comic), hidden folders and node_modules skipped, natural
  order, game folders (main program found even when buried deeper, helpers / installers / redists left out or unticked,
  folders of games become collections, "every program" option, native executables need the execute bit, .lnk shortcuts),
  counts of ignored and unreadable files, and marking things already in the library (`markDuplicates` / `pathKey`).
  `folder_scan.cpp` and `scan_tree.cpp` are part of `rancha_core`.
- `reorder_math` (drag-to-reorder: nearest slot, arrange a group, "before which item", no-change check) and
  `cover_store` (covers folder: random names, only valid cover names are accepted / served / deleted, sweep of unused
  covers; auto-cover name check). Pictures are made by the app with Qt, the core only stores the finished bytes.
- app: "Add a folder" works. Add (top bar) opens a menu, then "What are you adding?" (the six content choices), the
  system folder picker, and the preview dialog: the scan runs in the background, then the tree with tick boxes
  (folders show all / some / none), open / close folders, Expand all / Collapse all, Select all / none, search in the
  list (Esc clears it first), content choice, sub-folders, every program (games), every sub-folder is one game (ROMs),
  emulator choice (ROMs, from settings.json), folder structure or one plain list, "put it all in a new collection",
  notes about ignored / unreadable files, "already in library" / "probably not wanted". Things are added into the open
  folder (Home on the flat pages) with `importTree`, the library is read again, and a short message says what was added.
  `app/FolderImport.{h,cpp}`, `qml/ContentTypeDialog.qml`, `qml/FolderImportDialog.qml`.
- VERIFIED (g++, ctest): `tests/test_nav_history.cpp`, `test_selection.cpp`, `test_crop_math.cpp`, `test_file_kinds.cpp`,
  `test_launch.cpp`, `test_folder_scan.cpp`, `test_reorder_cover.cpp`; 878 checks pass. The full Linux build
  (`build/linux`, core + app) finishes with no warnings, and the app starts offscreen with no QML errors.
- NOT VERIFIED: the dialogs, menus and both kinds of drag by eye or by clicking (no test drives the window), a build
  on Windows. Only
  Linux paths are tested ("/"); the Windows branches of `baseName` / `dirName` ("\\", "C:") are not tested yet.
- Differences from Electron: no program icons in the preview list yet, ROM imports get the emulator but not the
  guessed RetroArch core (comes with Q11), dropping several folders on the window (the queue exists) is not wired yet.
- app (second part): the item dialog (add / edit one item, cover and wallpaper with the cropper, paste a picture with
  Ctrl+V or Shift+Insert), Move to…, Delete… (with the count of hidden items below), bulk tags, multi-select in the
  window (Ctrl / Shift click, Ctrl+A, Esc), F2 / Del / Enter, the item and selection right-click menus.
  `qml/ItemEditorDialog.qml`, `CropDialog.qml`, `MoveDialog.qml`, `DeleteDialog.qml`, `BulkTagDialog.qml`, `ItemMenu.qml`.
- menus: `qml/RMenu.qml`, `RMenuItem.qml`, `RMenuSeparator.qml` give every pop-up menu (right-click, Add, Tags, Sort)
  the look of the Electron ContextMenu: rounded surface, glass border, deep shadow, accent highlight, red danger rows,
  dimmed hints at the right, check marks (Tags and Sort show the chosen ones).
- drag files in: files and folders dropped on the window go to the open folder (folders through "What are you
  adding?" and the preview); the dimmed overlay with the dashed accent card says where they will go. Not taken while
  a dialog is open; on the flat pages it says "Open Home or a collection first".
- drag-to-reorder (Custom order inside a folder): move a card or a list row 6 px to lift it, an accent bar shows where
  it lands, holding it 0.5 s over the middle of a folder lights the folder up and drops it inside, the selection
  travels together, the view scrolls near the edges, Esc cancels. `LibraryModel::placeItems` uses
  `ItemRepository::placeMany` (the Electron bulk "place").
- Differences from Electron: the other cards do not slide aside while dragging (a bar marks the spot instead), the
  sidebar and the breadcrumbs are not drop targets yet.
- What to check: Add > Add a folder… at Home and inside a section, try each content choice, tick / untick folders,
  search the list, "One plain list" and "new collection", Add, then add the same folder again ("already in library").
