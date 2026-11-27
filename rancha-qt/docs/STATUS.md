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
