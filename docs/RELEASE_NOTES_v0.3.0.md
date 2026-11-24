# Rancha 0.3.0

## New
- **Music**: a fifth main section. Add music files, several files or a whole folder (folders are kept as albums). Supported: mp3, flac, ogg/oga/opus, wav, m4a, aac, weba.
- **Music player**: play/pause, previous, next, seek, volume, shuffle and repeat (off / all / one). Songs of the same folder become the queue, and the next song can start by itself.
- **Music overlay**: a small player that floats over the library, the comic reader (also in full screen) and the game page. Three sizes (hidden / small / expanded), any of the four corners. Long song names scroll.
- **Big Picture**: music button at the top right (or key **M**) with the player controls and music settings.
- **Built-in video player**: videos now play inside the app, in the window or full screen, with the app's theme and accent colour. Seek bar, ±10 s, volume, mute, speed 0.5–2×, full screen (**F** or double-click).
  - Next / previous video of the same folder; when a video ends the next one can start by itself. A video counts as watched at 90%.
  - The position is remembered per video and playback resumes there.
  - Subtitles: .srt, .vtt and .ass/.ssa files next to the video (or in a `Subs` / `Subtitles` folder) are found automatically.
  - If a file cannot be played, the app says so and offers to open it in the Windows player.
- **Linux**: a `.tar.gz` download next to the AppImage, for systems where AppImage is not wanted.
- New settings page: **Video and music**.

## Changed
- Big Picture footer is simpler: only Open, Back/Exit and Favorite, at the bottom left.

## Important: your library is upgraded
- The first start of 0.3.0 upgrades the library database (version 10 → 11) to support music.
- Before the upgrade, a copy of the old library is saved in the data folder: `backups/library-before-upgrade-v10.db`.
- After the upgrade, **older versions of Rancha (0.2.0 and earlier) cannot open the library**. To go back, restore the copy above.

## Limits
- The video player plays what Electron's built-in Chromium can decode. Subtitle tracks and extra audio tracks inside MKV files are not available yet, and some formats (for example HEVC/H.265) may not play. Use the Windows player for those.
- The music overlay lives inside the app window; it cannot float over an external game or emulator.
- Video resume positions are not included in backups.

## Notes
- The Windows installer and the Linux files are unsigned: on Windows choose "More info" > "Run anyway".
- The Linux version is still not tested on real Linux desktops. Bug reports are very welcome.
- TMDB and SteamGridDB need a free key of your own (Settings > Online covers). This product uses the TMDB API but is not endorsed or certified by TMDB.
