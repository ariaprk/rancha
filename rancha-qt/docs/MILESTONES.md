# Milestones of the Qt rewrite

The order follows the Electron app's milestones (docs/STATUS.md of the main project), with the changes decided in the
conversations since. Each step is small, has a clear thing to run and see, and ends with an owner check.
Rules: never claim something works unless it was run; say what is NOT verified; no silent changes of stack or database;
ask before adding a library; keep versions pinned; keep this file and STATUS.md up to date.

| Step | Content | Electron origin |
|---|---|---|
| Q1 | Skeleton: CMake, core library + tests, Qt Quick window, CI on Windows and Linux | M1 |
| Q2 | Theme system (dark/light/airy, accent colors, glass, corners, motion), sidebar with the five sections, sample library UI (virtual grid/list with covers) | M2, 9q, 9z5 |
| Q3 | Data model and storage: SQLite, schema v11 and migrations, settings file, import of an existing Rancha library | M3 |
| Q4 | Add / edit / delete / organize, folders and collections, covers (+ cropper), "add a whole folder", multi-select | M4, 7b, 8b |
| Q5 | Search, filters, sorting (natural), "All items" | M5 |
| Q6 | Launching, opening, missing files; main sections protected | M6, 9z20 |
| Q7 | Settings page, more customization, backup and restore | M7 |
| Q8 | Readers: comics (CBZ, CBR/RAR, image folders), PDF, manga right-to-left, chapters | M8, 9z9... |
| Q9 | Big Picture mode, then gamepad | 9z3 |
| Q10 | Online artwork search (SteamGridDB and the other databases), automatic covers | 9z4, 9z25, 9z22 |
| Q11 | Emulators and ROM folders | 9z6-9z11, 9z24 |
| Q12 | Music: library, tags, queue, mini player, overlay, scrolling names | 9z28-9z32 |
| Q13 | Video: libmpv inside the window, all formats, sound and subtitle choice from the app's own menu, resume | new |
| Q14 | Packaging and release: Windows installer, AppImage, Arch package, CI releases | 9z14, 9z12, 1.1.x |

Later / to ask again: always-on-top player over external games, gamepad control of the players, license (GPL/LGPL: Qt, libmpv,
unrar, PDF library), README/CONTRIBUTING, ScreenScraper, auto-update, playtime, Wine/Steam Deck.

Targets to measure (not promises): start under 500 ms, idle memory far below the Electron app, smooth scrolling (60 fps)
with tens of thousands of items.
