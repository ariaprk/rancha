# Rancha 1.0.0

## Important: the data folder has a new name
Rancha now keeps your library in a folder named after the app:

| | Old folder (0.3.0 and earlier) | New folder (1.0.0) |
|---|---|---|
| Windows | `%APPDATA%\personal-library` | `%APPDATA%\rancha` |
| Linux | `~/.config/personal-library` | `~/.config/rancha` |

**Rancha does not move the old folder for you.** If you used an older version, move it by hand **before** starting 1.0.0, or Rancha will open with an empty library. Nothing is deleted: your old library stays in the old folder until you move it.

### Windows
1. Close Rancha completely.
2. Press **Win + R**, type `%APPDATA%` and press Enter.
3. If a folder named `rancha` is already there (because you started 1.0.0 before moving), rename it to `rancha-empty`.
4. Rename the folder `personal-library` to `rancha`.
5. Start Rancha. Your library, covers and settings are back.

### Linux
Close Rancha completely, then in a terminal:

    # only needed if you already started 1.0.0 once:
    [ -d ~/.config/rancha ] && mv ~/.config/rancha ~/.config/rancha-empty
    mv ~/.config/personal-library ~/.config/rancha

Start Rancha again.

### Good to know
- If you already added things in 1.0.0 before moving, they are in the new (`rancha-empty`) library. Two libraries cannot be merged: add those items again after the move.
- Once everything looks right, you can delete the `rancha-empty` folder.
- Another way: in the old version, **Settings > Backup and restore > Create backup...**, then restore that backup in 1.0.0. Moving the folder is still the better choice, because it keeps everything (for example video resume positions, which are not in backups).
- Backups made by older versions (`personal-library-backup-...` folders) can still be restored. New backups are named `rancha-backup-...`.

## New
- **Song details from the files themselves**: title, artist, album, album artist, year, genre, track and disc number, and length are read from the music file's tags. Supported: mp3 (ID3), FLAC, Ogg Vorbis / Opus, MP4 / M4A and WAV. Files are only read, never changed.
- **Song covers**: the picture stored inside a music file is used as its cover in the library and in the players.
- **Players show the song properly**, like a real music player:
  - Music section: big cover, title, artist, and album · year · genre · track.
  - Overlay player: cover and title with the artist; the expanded player also shows the album.
  - Big Picture music panel: cover, title, artist and album.
  - The queue shows each song's artist next to its title.
- **Library**: cards show the artist under the song name (album in the tooltip); the list view shows artist · album.
- **Edit dialog**: a song now has a read-only **From the file's tags** section with all its details.

- **A real queue**: right-click a song (or several selected songs) and choose **Add to queue**. Queued songs play next, then the folder continues where it was. In the queue you can drag songs to change the order, double-click to play one now, and right-click for **Play now**, **Remove from queue** and **Clear the queue**.
- The queue button (next to the volume) shows or hides the queue in every player; a small number shows how many songs are waiting.
- In the list view, click **Name** to sort A–Z, click again for Z–A (a small arrow shows the direction).

## Changed
- New position and volume bars in the music player: click anywhere to jump, drag to scrub, a small bubble shows the time under the pointer, and the mouse wheel changes the volume (5% per notch).
- The queue no longer lists the whole folder: it only holds the songs you added yourself.
- The Music section's list view shows only the name (with artist · album) and the item count; Type, Tags and Added are left out there.
- The small floating music player now follows the theme (dark, light, airy) instead of always being dark.

## Fixed
- Jumping or dragging in a song no longer throws it back to the start. Music and video files are now served in parts, so the player can seek properly.
- A song without tags still shows its file name, as before.
- Song details are read once and kept in `song-info.json` in the data folder; a replaced or re-tagged file is read again automatically. The library database is not changed.

## Notes
- The Windows installer and the Linux files are unsigned: on Windows choose "More info" > "Run anyway".
- The Linux version is still not tested on real Linux desktops. Bug reports are very welcome.
- TMDB and SteamGridDB need a free key of your own (Settings > Online covers). This product uses the TMDB API but is not endorsed or certified by TMDB.
