# Electron feature and decision checklist (for the Qt rewrite)

Made 2026-11-28 from `docs/STATUS.md` and the release notes of the Electron app (v1.1.1). It lists what the owners asked for,
line by line, so nothing is forgotten while rebuilding. `[OWNER]` = an explicit owner decision. `(?)` = the old doc was unclear.
Tick a line (`[x]`) in this file when the Qt app does it the same way, and say how it was checked in `STATUS.md`.
The milestone order in `MILESTONES.md` says WHEN; this file says WHAT and HOW EXACTLY (numbers, defaults, wording).

Already known to differ in the Qt app (fixed in Q2.2 unless marked open): frame of the system window (now own bar), lines between
areas (removed), kind labels under card names (removed), placeholder cover colors (now the calm ones), card gaps, Add button color.
Still open: 3D tilt + light on hover, selection pulse, springy details, custom hand cursor, sounds, glass blur, window size memory
(`window.json`), music artist under the title, 2-line names when searching ("Video > Anime" line), the UI scale 80-140 %.

Source: STATUS.md (last entries: built-in video player removed; 1.1.1 prepared) + RELEASE_NOTES v1.0.0 / v1.1.0 / v1.1.1.
Legend: [OWNER] = explicit owner decision/request in the doc. "(?)" = doc unclear/contradictory. Nothing below is invented.
Doc caveat: most UI behaviour was only verified in a headless test browser, never on real Electron by Claude; owner tested up to ~9z11 + 0.1.1 installed app.

== 0. GENERAL / PRINCIPLES ==
[ ] Platform: Windows 11 primary; Linux supported (AppImage, Arch pkg). Offline-first, no accounts. [OWNER]
[ ] Media files referenced by path, never copied (only covers/wallpapers/caches are copied into data folder).
[ ] App name "Rancha" (single constant APP_NAME) + permanent APP_ID "rancha" (data folder independent of display name). [OWNER]
[ ] Data folder: Windows %APPDATA%\rancha, Linux ~/.config/rancha. Old "personal-library" folder is NOT migrated automatically (manual move, documented in 1.0.0 notes).
[ ] Data folder contents: library.db, covers\ (covers+wallpapers), cover-cache\ (auto covers), backups\ (+ backups\auto\, before-restore-<time>\, library-before-upgrade-vN.db), settings.json, window.json, song-info.json (music tag cache; DB untouched).
[ ] Fully offline by default [OWNER 2026-10-17]; later exception: online art search only when the user opens that dialog with own keys (see section 13). (Initial "no online downloads" was relaxed in 9z4; the doc does not state the owner re-decided - treat as owner-requested feature.)
[ ] Layering: UI -> bridge -> IPC (ids only, never real paths to UI) -> repository -> SQLite. Backend reads path from DB when launching.
[ ] Private URL schemes used for media: library-cover://file/<name>, library-cover://auto/<name>, library-page://<session>, library-video://item/<id> (frames only now), library-audio://item/<id>. Rewrite equivalent: only serve library items, Range support (200/206/416 by hand, fileRange.ts).
[ ] Security habits: launch without shell, args as list; validate all input; refuse DBs from newer app versions; max 3 reader sessions; page index validated.

== 1. WINDOW / TITLE BAR / TOOLBAR ==
[ ] ONE slim bar 48 px (--titlebar-h) replaces OS title bar + toolbar; frameless (titleBarStyle hidden). [OWNER 9j]
[ ] Own minimize / maximize-restore / close buttons, 32 px, thin rounded line icons; hover tint; close turns red and rotates; icon swaps when maximized. Reader and game screen carry their own copies.
[ ] Empty toolbar parts + sidebar brand row drag the window; double-click maximizes; controls are no-drag. While reader/game screen/dialog is open, toolbar + brand row are no-drag (bug 9n).
[ ] Known consequence: no Win11 snap-layout flyout (Win+Z and edge snap still work).
[ ] Minimum window size 900x600 (window memory) / 900 px minimum width noted in 7b.
[ ] Toolbar contents: back/forward buttons (36 px, bold arrows, round), breadcrumbs ("Home" root), search box (frosted glass, no color/glow change on focus, icon), tag picker next to search, Add menu (green bright gradient, bigger, bold white text), card-size slider, view-mode buttons (covers/compact/list), sort control.
[ ] Card-size slider hidden below 1400 px window width (was 1150; 9v changed to 1400); same setting in Settings.
[ ] Toolbar z-index above cards (Add menu was painted behind cards; z-index 5 fix) - ensure menus overlay everything.
[ ] Bottom status bar REMOVED [OWNER 9i "too busy"]; all actions via right-click menu + keyboard. Messages = small floating note bottom-centre: click dismisses; info auto-hides after 7 s; errors stay until dismissed/replaced.
[ ] Custom hand cursor everywhere (white pointing hand, blue outline, hotspot = fingertip), also all of Big Picture.
[ ] Font: Poppins Regular/Medium/Bold (Latin subset, OFL) bundled, base 15 px, bolder titles; Persian/Arabic falls back to Segoe UI. [OWNER-requested look]
[ ] Persian/Arabic text must display correctly (owner is a user: RTL subtitles were planned; names in Persian).

== 2. SIDEBAR ==
[ ] Collapsible, glass look; rows 56 px (9q) then "back to original simple line icons and row style" (9t); icons ~24 px bolder strokes (9x). Final state (?): original line icons for Home/All items/Favorites/Recent/Settings; PNG icons for the five items below.
[ ] Entries: Home, All items, Favorites, Recent, top-level collections only (Games, Reading, Video, Applications, Music), Big Picture button (above Settings), Settings.
[ ] PNG icons (own artwork + Flaticon) used as MASK over gradient: Games (purple gamepad), Reading (book, own redraw 9z19), Video (play), Applications (apps grid), Big Picture (rose gamepad); in sidebar and Big Picture.
[ ] Setting iconTone: Accent (default) / White / Black / Colorful (per-section gradient). White is hard to see on Light theme (owner's choice).
[ ] Active entry: animated selection bar (accent gradient), tinted row; hover springy. No separator lines anywhere (9u): sidebar distinguished by different background tone.
[ ] Sidebar/breadcrumb/Home are drag-drop targets (light up instantly) for move.
[ ] Main sections protected (9z20): ids games/reading/video/apps (+ music section added for v11), top level, cannot be deleted or moved into another collection (enforced in DB layer; menu hides Delete/Move to; Delete key shows short message); can be renamed and filled. Missing main sections are re-created empty at every library open unless a same-name top-level collection exists.
[ ] New libraries start EMPTY with only the main sections (0.1.1). (Old sample library of 41 items existed only for development.)

== 3. GRID / LIST / CARDS ==
[ ] Views: cover grid, compact grid, detailed list. Card-size slider. Covers 2:3 (videos tried 16:9, dropped). Cover max 600x900 JPEG.
[ ] Grid gaps 26x22 px (cover), compact 17x15 px. List row fixed height 52 px.
[ ] Card text: name wraps to max 2 lines then "..."; text block fixed 40 px; NO kind label ("App / Game"/"Video"/"Reading") under name; collections show "N items"; search results show location ("Video > Anime"); music cards show artist under title (album in tooltip); list shows artist . album for songs.
[ ] Missing file: orange "Missing" badge + dimmed cover.
[ ] Done (watched/read/completed): NO badge on cover [OWNER]; title slightly dimmed in grid; small check beside name in list (green). Unfinished comics: progress bar at bottom of cover; % in list view.
[ ] Favorite star: bigger golden star with glow; pops on/off animation (cards).
[ ] Hover: 3D tilt toward pointer max 9 deg, perspective 700 + moving light reflection (.card-sheen); hover scale 1.03; no lift. Tilt only with Motion=Full; sheen hidden when Off; both disabled while dragging. One rAF per move.
[ ] Selected: 4 px accent frame + soft halo + accent title (cards); thicker accent bar + stronger tint (rows); frame pulses once on becoming selected. [OWNER 9i bolder selection]
[ ] Cover placeholders: desaturated colors (hsl s 34-42%), initials + faint kind icon; games/apps with no cover show Windows exe icon centered on placeholder (grid/compact/list/edit preview); icon via system file icon, lazy batches of 40, session cache.
[ ] Auto covers: comic folder/CBZ/CBR/PDF without own cover = first page (cached in cover-cache; key = hash(item id + size + mtime); stale swept at start; prepared only when card near screen); video without cover = one frame at random 10-25% of length, chosen once and cached. User-chosen covers always win.
[ ] Virtualization: above 150 items only visible rows drawn; Show-in-folder scrolls into view; multi-select works across undrawn rows. Measured: 5,000 items.
[ ] Done-state of collection: done only when everything inside is (empty never).

== 4. THEMES / APPEARANCE SETTINGS ==
[ ] Theme (setting `theme`): Dark / Light / Airy. (Soft/neumorphic added 9t then REMOVED 9u; saved "soft" falls back to default.)
[ ] Dark bg #1b1e25 with soft light around middle + gentle shade at bottom (.app::before, always on); Light bg #e4e7ee with light centre; Airy = bright frosted glass, white panels, deep blue-gray text, heavier titles, soft blue shadows, backdrop tinted ONLY by accent (no lavender/mint/peach after 9p).
[ ] Reader follows theme (dark/light/airy) since 9y (was dark only; 9o said reader/game screen stay dark - superseded). Game screen stays dark (?). Floating music player follows theme (but overlay later forced light-on-dark - see section 14; 1.0.0 notes say follows theme; STATUS 9z29 says always its own light-on-dark - conflicting (?)).
[ ] Accent colors as gradients: Blue, Purple, Rose, Orange, Yellow, Green, Cyan + custom picker (gradient computed). Gradients also on segmented switches, logo mark, progress bars, active-entry bar, badges.
[ ] Motion level Full/Subtle/Off (also honors OS reduce-motion). Animations use only transform+opacity. Marquee song names ALWAYS slide even with Off/reduce-motion.
[ ] Interface size 80-140% (zoom). Corners Sharp/Soft/Round. Frosted glass Off/Normal/Strong (Off = nearly solid). Background glow On/Off (accent glow).
[ ] Scrollbar 14 px, accent on hover. Content area must scroll (bug 7b).
[ ] Menus/dialogs grow out of last click position (transform-origin); buttons press inward; spring details.
[ ] Settings pages (9z24): side menu - Appearance, Size and motion, Comic reader, Emulators, Online covers, Backup, About (+ Music tab again after video removal; Sounds under Animations). Last page remembered; narrow window shows menu as row.
[ ] Settings.json: atomic write (temp + rename); damaged file set aside as settings.damaged-<time>.json; every value validated/clamped; unknown values dropped; "Reset settings" keeps online keys + emulator profiles.
[ ] No separator lines; 1 px/2 px --line experiments abandoned (9u final: none).

== 5. ADD / EDIT / DELETE / ORGANIZE ==
[ ] Add menu: New collection; PC game or app...; Console game (ROM)...; Video; Comic/manga/PDF; Music file...; Add several files at once (kind by extension: exe/lnk/bat/cmd/url/msi=app; mp4/mkv/avi...=video; cbz/cbr/pdf=reading; audio=music; Linux: .sh .appimage .desktop .run .x86_64); Add a whole folder... (see 6). Drag files from Explorer onto window adds to current folder; folders/unknown types skipped with message. ROMs skipped in "add several"/drop (known gap; classification step skipped by owner).
[ ] Item form: name, location (Browse / Folder for comics), description, tags (comma separated), cover (placeholder color or image), wallpaper (games only), "Run with" (games). Edit via right-click, F2.
[ ] Cover: Choose image (PNG/JPG/BMP; webp not supported originally), Ctrl+V paste, drop picture on cover box -> crop step 2:3 (drag, zoom slider/wheel up to 4x, Fill/Fit, rule of thirds; output 600x900 JPEG; dropped/pasted downsized to 1400 px). Transparent PNG gets black background. Re-crop needs picking again (originals not kept). "Remove image" restores auto first page. "Choose a page from the book" thumbnails grid -> crop.
[ ] Edit dialog for songs: read-only "From the file's tags" section.
[ ] Delete: Delete key/right-click, confirmation; deleting collection deletes everything inside + its cover copies; real files never touched; warns about hidden items inside.
[ ] Move: right-click "Move to..." dialog, drag onto folder/sidebar/breadcrumb; cycles refused; Move earlier/later (swap with neighbour, folders included).
[ ] Done: "Mark as watched / read / completed" (word by kind; collections "Mark everything inside as done"); reading to last page auto-marks read. Un-mark by hand.
[ ] Favorites toggle (also bulk). Tags case-insensitive, replace on edit.
[ ] Missing "Locate file..." / "Locate folder..." ; "Show in Explorer"; "Show in its folder" for flat lists.
[ ] Esc closes only the top-most dialog (dialog stack); no tab-trapping (known limit).
[ ] Required-field feedback (9z11): popup "Missing information" + OK, then field scrolled, focused, red outline, red "!" , "Required: choose an emulator/core"; other errors (missing name) still a line at form bottom.
[ ] Chapter-folder comics convert on first open to a COLLECTION, one item per chapter (natural order, Chapter 2 before 10); progress carried (earlier chapters read, current keeps page); cover of the book saved as collection cover (9z21). Chapter target = "<book path><invisible char><folder>" (was '|', DB v10 converts).

== 6. FOLDER IMPORT ("Add a whole folder") ==
[ ] Flow: ask "What are you adding?" (Games and apps / Videos, anime, series / Comics, manga, books / Console games (ROMs) / Music / A mix of everything) -> folder picker -> scan (changes nothing) -> preview dialog with tick boxes -> "Add N items". Dropped folders previewed one after another. "What is in this folder?" list switches type and rescans.
[ ] Scan rules: recognizes exe/lnk/bat/cmd/url/msi, videos, cbz/cbr/pdf, folders with >=2 pictures = one comic. Skips hidden (.name), $RECYCLE.BIN, System Volume Information, node_modules, empty folders. Depth <= 8; max 5000 things (flagged when cut). Natural order, folders first.
[ ] Games mode: one entry per game folder = best program. Score: name matches folder (+), shallow (+), bigger (+, capped); helpers heavily penalised and hidden (unins*, redist, vc_redist, setup, install, updater, crash*, UnityCrashHandler, EasyAntiCheat); launcher/config/editor/server/tool/patcher slightly penalised. Finds buried exe (Binaries/Win64/Game.exe). Folder of game folders = collection; category with single game collapses into the game; setup-only folder kept but unticked; loose exe/lnk/url listed as is. Option "Show every program inside each game folder".
[ ] Exe icons loaded in batches of 40 (first 400); files:icons accepts only exe/lnk/url/bat/cmd, max 60 per request.
[ ] Preview options: look inside sub-folders, keep structure vs one plain list, wrap in new collection (name editable), tri-state ticks, select all/none, expand/collapse, search box (all words match name or path; "select shown/unselect shown" only on matches; Esc clears search first, second Esc closes).
[ ] Defaults per type [OWNER]: Games = "One plain list", wrap UNchecked; Videos and Comics = "Keep the folder structure" + "Put it all in a new collection named <folder name>" CHECKED; Mix = structure, wrap unchecked. Reapplied when type switched.
[ ] Installers/uninstallers/redistributables start unticked ("probably not wanted"); items already in library (same location; case-insensitive on Windows only) start unticked "already in library" and skipped again.
[ ] Add = ONE DB transaction (all or nothing); empty collections never created. Preview cannot rename items.
[ ] ROM mode: extensions in shared/emulators.ts ROM_EXTENSIONS (nes, sfc, gba, n64, nds, gcm/rvz/wbfs, iso/cue/chd/pbp/cso, m3u, md, sms, pce, wua ... full list not in doc). Excludes .bin (cue stands for it) and .zip/.7z. Names cleaned "Super Mario World (USA) [!]" -> "Super Mario World". Tick "Every sub-folder is one game". Emulator must be chosen: Add disabled ("Choose an emulator first"). Scan one console folder at a time.
[ ] Music mode: folders = albums kept.

== 7. MULTI-SELECT / BULK ==
[ ] Ctrl+click toggle, Shift+click range, Ctrl+A all shown, Esc clears, click empty space clears; works in all views.
[ ] Bulk actions via right-click menu: favorites add/remove, done, Add tag..., Remove tag..., Move to..., Delete, Clear selection. Each = one transaction. Nested selection: only outer collection moved/deleted. Only currently shown items count (filters never act on hidden items). Delete key opens confirmation.

== 8. DRAG-REORDER & DRAG-INTO-FOLDER ==
[ ] Reorder only inside a folder with Sort=Custom, no search/filter. Press+move 6 px lifts card (tilted ghost with shadow, others slide aside with small overshoot, dashed slot, ghost glides into place); Esc cancels (ghost flies back). Group drag with count badge. Folders and items mixed freely in Custom order [OWNER 9h]; Name/Type sorts still list folders first.
[ ] Drop INTO folder: hover middle of folder card DWELL_MS = 500 ms (ring fills, pops accent, folder grows, dragged card shrinks); PASS_MS = 140 ms (no jump when merely passing). Sidebar entries and breadcrumbs light up instantly. Works in cards/compact/list.
[ ] DB v8 renumbers contents (folders first) so existing libraries look unchanged. Sort_order 1..n.
[ ] Limit: lists over 150 items (virtualized): no auto-scroll while dragging; use Move earlier/later for long distances. A click after a drag must not select.

== 9. SEARCH / FILTER / SORT ==
[ ] Search: Ctrl+K focuses; several words, ALL must match across name, tags, description, names of containing folders; rank: exact name > starts-with > tag > folder name > description. Esc or x clears. Inside a folder: one-line note "Everywhere / In this folder" above results. Music: matches title/artist/album/genre from tags.
[ ] Filter bar "Show" chip row REMOVED [OWNER]; type/favorite filter code exists but no UI. Tag picker in toolbar (counts; several tags = AND). Filters inside a folder look through all depths. "Clear filters". Filters/search scope reset on navigation.
[ ] Flat results (search, filters, All items, Favorites, Recent) show location; right-click "Show in its folder".
[ ] Sorts: Custom/best match, Name A-Z, Name Z-A, Newest, Oldest, Last opened, Type; remembered in settings. Custom only inside one folder; in flat lists = best match when searching else by name. Recent defaults to last opened.
[ ] "Hide watched" filter: NOT built, asked if wanted (idea).

== 10. LAUNCHING / MISSING FILES / GAME SCREEN ==
[ ] Double-click, Enter or right-click Launch/Play open. Apps/scripts/shortcuts started like Explorer double-click (shell open); videos -> default OS player again [OWNER: built-in player removed]. Records last-opened (Recent page, sort).
[ ] Missing check at startup, after changes, on window focus; "File not found" message; launching missing item explains.
[ ] NOT done on purpose: launch args / working dir options, web or steam:// links (but .url steam:// and http(s) allowed on Linux), run as admin.
[ ] Linux launching: .sh/.run run (via sh if not executable), AppImage/.x86_64 run directly (clear chmod +x message), extensionless executables, .desktop Exec= (no terminal), .url only steam:// or http(s)://; videos/PDFs never executed.
[ ] GAME SCREEN: applies to games, not apps. Decided by SECTION [OWNER]: everything under top-level Applications (id apps or name Apps/Applications, any depth) = app, launches at once; all else = game and double-click/Enter opens game screen. No manual switch (DB v6 switch removed in v7). Right-click Launch still launches directly.
[ ] Screen: full window, wallpaper, big title, one Play button, playtime placeholder ("- h" + "Played N days ago" from last-opened); real playtime NOT built.
[ ] Play (click/Enter/Space): all UI fades except wallpaper; wallpaper alone for LAUNCH_DELAY_MS = 2000 ms; THEN game starts; wallpaper stays until Esc/Enter/Space/click. Esc within the 2 s cancels (never started). Start failure returns screen + message. [OWNER] Esc/click return accepted; focus-based auto-return REMOVED (focus flickers); automatic return "to think about more".
[ ] Background: wallpaper sharp; else blurred cover; else colour gradient. Obeys Motion setting.
[ ] Wallpaper: DB v5 column wallpaper_file; Edit dialog box (Choose image, drop picture, Remove); 16:9 crop, up to 1920x1080 JPEG; stored in covers folder; old file deleted on replace/remove/delete; Ctrl+V still goes to cover. Only for games.
[ ] Ideas decided but NOT built: Info drawer (status, rating, notes), real playtime tracking, Steam-style alternative layout, process tracking for auto-return (UAC/launcher/steam shortcut problems).

== 11. EMULATORS / ROMs ==
[ ] DB v9 columns items.emulator (profile id) and items.core (RetroArch core file).
[ ] Settings > Emulators: one dropdown + "+ Add" from presets: RetroArch, Dolphin, PCSX2, DuckStation, PPSSPP, RPCS3, Cemu, Ryujinx/Switch, melonDS, mGBA, Other; picking opens program file dialog; one compact line per emulator (name, path, Choose/Change, remove x); name/args/"Main file inside a game folder" under Advanced. Stored in settings.json (in backups).
[ ] Arg tokens: {rom} {core} {romdir} {romname} {entry}. {entry} = file found via relative pattern with `*` inside a game folder (e.g. code\*.rpx), ".." rejected, case-insensitive; if ROM is a plain file {entry}=file. Presets (UNVERIFIED, from memory/research): Cemu `-f -g "{entry}"` entry `code\*.rpx`; RPCS3 `--no-gui "{entry}"` entry `PS3_GAME\USRDIR\EBOOT.BIN`. Command lines/core hints for others also unverified.
[ ] Launch: NO shell, args as list, cwd = emulator folder. Messages: emulator removed, program not found, core not found, core not chosen. Program given by name only (PATH) accepted. Flatpak: program `flatpak`, args `run org.libretro.RetroArch ...` (untested).
[ ] RetroArch cores read from "cores" folder next to retroarch.exe; Linux also ~/.config/retroarch/cores, Flatpak data folder, /usr/lib/libretro. Likely core starred; auto-filled ONLY for unambiguous types (.sfc, .gba...); NEVER guessed for .iso .cue .chd .m3u .pbp .ciso (user picks). [OWNER 9z10]
[ ] Emulator MUST be chosen explicitly (no preselection); with RetroArch core required too; refuse save otherwise. [OWNER]
[ ] "Console game (ROM)" form: file dialog lists ROM types first; "Choose folder..." for folder-games (Wii U, PS3); name cleaned; picking emulator in any game switches Browse to ROM list.
[ ] DROPPED: Libretro covers/thumbnails [OWNER decision]. Not yet: RetroArch playlist import, hash matching, ScreenScraper (waits for owner's devid), auto-return when emulator closes, Wine/Proton profiles.

== 12. READERS (CBZ / CBR / PDF) ==
[ ] Sources: picture folder (subfolders included), .cbz/.zip (own ZIP reader: stored+deflate, no ZIP64/encryption), .cbr/.rar (node-unrar-js; whole archive in RAM), PDF (pdf.js built-in, legacy build, offline). Type detected by first bytes. Natural page sort; ignore __MACOSX, Thumbs.db, dot files. [OWNER: .cbr, PDF wanted]
[ ] Layouts: Single / Double (cover alone then pairs) / Strip; Fit page / Fit width; direction Comic -> / <- Manga (arrows, click zones, double order, slider follow); page slider; full screen (F).
[ ] Keys: arrows, Space/Shift+Space, PageUp/PageDown, Home/End, D = direction, F = fullscreen, Esc = close; zoom + - 0, Ctrl+ +/-/0. Library shortcuts (Delete/F2) blocked while reading. Next pages preloaded.
[ ] Zoom 100%-600% (buttons, % reset, Ctrl+wheel, pinch); zoom follows pointer; drag to pan; wheel/arrows pan; arrow/Space at edge turns page starting at corner (top-right for manga); page turn keeps zoom; layout/fit change resets; double-click-to-zoom NOT built.
[ ] PDF: chunks 1 MB (reader:pdfRange); page cache 40 pages; sharper redraw after zoom pause (up to 16 MP, 6 buckets of 0.5, 6 zoomed pages cached). Failure (damaged/password/slow) -> reason + "Open in the PDF window instead". Password PDFs unsupported.
[ ] Page-turn 3D effect (lib/pageFlip.ts) ONLY in Double mode (9z); not in Strip, zoomed, Motion Off, jumps > 2 pages; Subtle = shorter; whoosh if sounds on; RTL mirrored.
[ ] Remembers page + direction per comic (DB v2 reading_progress) + layout/fit/default direction (settings > Comic reader). Last page = auto read. Library refreshes when reader closes.
[ ] Known limits: wide landscape pages not auto-single in Double; strip scroll drift while loading; no ZIP64.
[ ] Music overlay rendered INSIDE reader (needed for real full screen).

== 13. ONLINE ART (optional, user's own keys) ==
[ ] Edit dialog "Search online..." next to cover and wallpaper (not for collections). Chooser: TMDB (video, needs free key), AniList (manga/comic, no key), TVmaze (series, no key), SteamGridDB (games, needs key: grids=covers, heroes=wallpapers). Best marked "Recommended"; keyless shows "Key needed". Click selects (ring), click again/double-click/Enter/"Use this picture" downloads -> normal crop. Spinners. Only https allow-listed hosts, 15 MB cap; keys stay in main process; CSP img-src: *.steamgriddb.com, image.tmdb.org, *.anilist.co, *.tvmaze.com. TMDB credit text in About + THIRD_PARTY_NOTICES ("not endorsed or certified by TMDB"). Keys in settings.json, survive reset. Endpoints written from memory (unverified).

== 14. MUSIC PLAYER / MINI PLAYER ==
[ ] 5th section "Music"; item kind audio (mp3, flac, ogg/oga/opus, wav, m4a, aac, weba). DB schema 11 (table rebuilt; backup automatic). Add > Music file / several / folder.
[ ] Engine: play/pause, previous (restarts if >3 s), next, seek, volume, shuffle, repeat off/all/one, auto-next, skips broken file, system media keys (MediaSession with own title/artist/album). Settings: musicVolume, musicOverlay, musicCorner, musicShuffle, musicRepeat, musicAutoplayNext, musicShowQueue, musicQueueWidth, musicNowWidth, musicColumns, musicSort, musicColumnWidths (--mc-<column>, --mc-min).
[ ] Tags read (ID3 mp3, FLAC, Ogg Vorbis/Opus, MP4/M4A, WAV): title, artist, album, album artist, year, genre, track, disc, length; embedded picture = cover; cached in song-info.json; reread if file changes; no tags -> file name.
[ ] Music page (1.1.0) 3 panes: Up next queue | songs | now playing (big cover, title, artist, album . year . genre . track); side panes resizable, double-click handle = normal width, widths saved; narrow window stacks now-playing above.
[ ] Columns: cover, title, artist, album, album artist, year, genre, track, disc, length, file name, added, tags; choose via header right-click; click name sorts A-Z/Z-A; folders on top, empty values last, ties keep album order; column widths draggable (except cover and title), double-click edge or "Normal column widths" resets; list scrolls sideways. Music section hides Type/Tags/Added in list view.
[ ] Queue: "Add to queue" (right-click, multi-select), middle-click (hint "Middle click" shown); same song multiple times; drag reorder; double-click = play now; menu Play now / Move to top / Move to bottom / Remove / Clear; items show number + small cover + artist; header shows count + total length; queue button with count. Folder order hidden; queued songs play first then folder continues.
[ ] Slider: click jumps, drag scrubs, time bubble, wheel = volume 5% per notch; position bar smooth clock per frame; no snap-back after click.
[ ] Mini overlay: hidden/small/expanded, 4 corners, only while song loaded, floats over library/reader/game page; small = note icon + green dot while playing + marquee song name + enlarge; expanded = seek, controls, volume, queue, hide (x); always own light-on-dark colours (9z29) vs 1.0.0 notes "follows theme" (conflict ?). Overlay lives inside app window (cannot float over external games). Not drawn in Big Picture (button shows "dot song name"). Gamepad does not control player yet.
[ ] Marquee: long names slide left, pause, restart; short stay still; tooltip full name.

== 15. VIDEO (CURRENT BEHAVIOUR) ==
[ ] Videos open in the DEFAULT OS player [OWNER: built-in player (9z33) REMOVED]. No built-in controls, subtitles, resume positions, video settings (old values ignored).
[ ] Kept: video frame grab for automatic cover (library-video address, CORS fix for tainted canvas; previewTime 10-25%); Mark watched is manual (the 90% auto-mark died with the player). Release notes 1.0.0 mention video resume positions - stale (?).

== 16. BIG PICTURE / GAMEPAD ==
[ ] Sidebar "Big Picture" button; fullscreen on enter/off on exit (fullscreenOn/Off). XMB-style cross menu: top row categories (Favorites, Recent, each top-level collection, Desktop); vertical item list; right preview card (cover, title, badges, description); animated gradient waves following theme; Motion Off stops; folders open inside category; focus remembered per list.
[ ] Controller: D-pad/left stick (hold repeat), A open, B back, X favorite, LB/RB category, LT/RT page up/down, Start exit. Keyboard: arrows, Enter/Space, Esc/Backspace, F, Q/E, PageUp/PageDown, M = music panel. Hints switch pad glyphs/keys by last device. Desktop category or Start/Esc at root exits. Pad buttons forwarded as keys to game screen/reader/dialogs. Short taps may be missed by polling.
[ ] Footer: only Open / Back-or-Exit / Favorite, plain, bottom left (9z30).
[ ] Mouse: wheel scrolls list, Shift+wheel/wheel over category strip changes category, one click opens, right-click on row toggles favorite, right-click empty / mouse back = back, click big cover opens. Round arrow/chevron buttons REMOVED. Wheel fast = no skipped steps, smooth scroll. Music panel stays dark.
[ ] Not done: automatic return to Big Picture when a game closes.

== 17. SETTINGS / BACKUP / RESTORE ==
[ ] Backup: "Create backup..." -> folder rancha-backup-<date>_<time> with library.db (VACUUM INTO snapshot), covers\, settings.json, backup-info.json; media never copied. Older personal-library-backup-* still restorable. Resume positions not in backups (moot now).
[ ] Restore: pick folder, validate (real library DB, integrity check, not newer), show item count/date, confirm, restart; swap at START of next run: current library moved (not deleted) to backups\before-restore-<time>\.
[ ] Auto backups: ON default, switchable; at startup, at most one per 20 h, keep newest 5 in backups\auto\. "Open folder" button. Known: whole-folder copy, no zip, no settings-only restore.
[ ] DB schema versions: v1 items+item_tags (PRAGMA user_version); v2 reading_progress; v3 items.is_done; v4 index items(parent_id, sort_order); v5 wallpaper_file; v6 per-item game switch (shipped then dropped); v7 drops v6 column; v8 renumber sort order; v9 emulator + core; v10 chapter separator change; v11 audio kind. Automatic copy to backups\library-before-upgrade-vN.db before upgrading; older app refuses newer DB; foreign keys on; cascade delete.
[ ] Settings > About: version, data folder, credits (Flaticon authors, TMDB line, icon credits).

== 18. WINDOW MEMORY / NAVIGATION ==
[ ] window.json: size, position, maximized; position reused only if visible on a connected screen; minimum 900x600.
[ ] Back/forward: buttons beside breadcrumbs, mouse side buttons 4th/5th, Alt+Left/Alt+Right; history max 60; skips deleted collections; forward trail cleared on new visit; ignored while dialog or reader open. Real mouse buttons unverified.
[ ] Keyboard summary: Ctrl+K search, Enter open, F2 edit, Delete delete, Ctrl+A, Esc, Ctrl+V cover paste in dialog.

== 19. SOUNDS / TOOLTIPS ==
[ ] Sounds: Settings > Animations > Sounds, OFF by default (setting `sounds`); WATER-DROPLET style synthesized (no files; rising sine bloops, slightly random pitch; splash with falling drops for game screen/reader/folder drop; tap, select, pop favorite, lift/drop drag, soft menu/dialog drops; whoosh for page turn). Volume raised ~3x (9k). Independent of Motion setting.
[ ] Tooltips: native OS tooltips (full names, album in music tooltip); custom tooltip layer NOT built [OWNER "ask later"].

== 20. PERFORMANCE ==
[ ] Virtualization >150 items; DB index; in-memory walks for bulk/done; 5,000 items: search keystroke 0.15-0.25 s, Ctrl+A 55 ms (browser test); 60 fps target (median 16.7 ms) for hover/animations.
[ ] Lazy: covers via IntersectionObserver-style near-screen only, icons batches of 40, auto-cover queue one at a time, music tags read in background and list re-sorted as they arrive.
[ ] Separate thumbnail cache NOT built (auto covers cached on disk is enough).

== 21. PACKAGING / RELEASE ==
[ ] Version history: 0.1.0 .. 0.1.1 (tested Win + AppImage by two people), 0.3.0, 1.0.0 (data folder rename), 1.1.0 (music UI), 1.1.1 (Arch pkg; Electron 45.2.1->45.4.1; pdfjs 6.4.299->6.5.438). Node >= 22.
[ ] Targets: Windows NSIS installer + portable; Linux AppImage (Rancha-<ver>-linux-x86_64) + Arch Rancha-1.1.1-linux-x86_64.pkg.tar.zst (depends gtk3 nss alsa-lib libxss libxtst libnotify libsecret xdg-utils; binary `rancha`; pacman -U / -R rancha). Linux .tar.gz dropped in 1.1.1. Output folder release/. Installers UNSIGNED (Windows "More info > Run anyway").
[ ] Icon: build/icon.png 1024 + icon-256.png (own artwork on rounded white tile). appId com.rancha.app (placeholder, open). Repo private; downloads via separate public releases repo.
[ ] License: proprietary, all rights reserved, owner "Aria Sama"; THIRD_PARTY_NOTICES; Flaticon credits required (owner accepted licence risk).
[ ] CI: typecheck+build on PR/push; Dependabot weekly npm, monthly actions; release workflow on tag v* (tag must match version; uses docs/RELEASE_NOTES_<tag>.md).
[ ] Release notes always carry: unsigned note, Linux game section untested, TMDB/SteamGridDB own-key note + TMDB disclaimer.

== DEFERRED / DROPPED by owner ==
DROPPED / REMOVED
[ ] Online covers as a rule (SteamGridDB rejected 2026-10-17, later re-added in 9z4 as optional user-key feature) - treat online art as optional.
[ ] "Show" filter chip row (type/favorites) removed [OWNER].
[ ] Bottom status bar removed [OWNER].
[ ] Colored/glossy sidebar icon sets (9k/9q/9s) removed as "too garish" [OWNER]; solid glyphs (9p) replaced; back to line icons.
[ ] "Soft" neumorphic theme removed; all separator lines removed.
[ ] 16:9 video covers dropped (2:3 kept); round arrow buttons in Big Picture removed.
[ ] Built-in video player (stage 1) + subtitles + resume positions + video settings removed [OWNER]; ffmpeg/mpv experiments never merged. Stage 2 ffmpeg engine (~70-80 MB) was only a plan.
[ ] Libretro covers/thumbnails dropped.
[ ] Per-item game/app manual switch (DB v6) dropped; decided by section only [OWNER].
[ ] Focus-based automatic return after launching a game removed.
[ ] Custom tooltip layer not built (Windows native kept).
[ ] Separate thumbnail cache not built.
[ ] Linux .tar.gz download dropped.
[ ] Page-turn effect removed from Single mode (Double only).
DEFERRED / "later"
[ ] Automatic return to library/Big Picture when game/emulator closes; process tracking; real playtime ("to think about more").
[ ] Info drawer (status, rating, notes), Steam-style alternative game layout, light "Xora-style" preset, capsule badges/buttons, colored kind icons (need owner go).
[ ] Classification step for "Add several files"/drag-drop of ROMs and mixed content [OWNER skipped for now].
[ ] ScreenScraper (waits for owner devid); RetroArch playlist import; hash matching; Wine/Proton profiles.
[ ] Launch args/working dir, run as admin, steam:// launching (Windows).
[ ] Gamepad control of music player; separate always-on-top mini player window (to float over external games).
[ ] Password-protected PDFs, ZIP64/encrypted CBZ, double-click zoom, wide-page auto-single, "hide watched" filter.
[ ] Re-crop of existing cover without re-picking; rename in folder-import preview; restore settings only; zip backups.
[ ] Final LICENSE choice, appId, repo URL, icon artwork license; pacman -U install and GitHub Ubuntu runner build unverified.
[ ] Real Linux desktop/Steam Deck testing of game section.
UNVERIFIED on real hardware (re-test in Qt rewrite): mouse side buttons, gamepad, real emulators/presets, window-drag/close buttons, wallpaper protocol, real PDFs/CBR.
