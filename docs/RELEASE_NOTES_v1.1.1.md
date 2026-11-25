# Rancha 1.1.1

A small update: a real package for Arch Linux, and newer building blocks under the hood. Your library, settings and data folder stay as they are: nothing needs to be moved when updating from 1.1.0.

## New
- **Arch Linux package**: `Rancha-1.1.1-linux-x86_64.pkg.tar.zst`. Install it with

      sudo pacman -U Rancha-1.1.1-linux-x86_64.pkg.tar.zst

  Rancha then appears in the app menu and can be started with `rancha`. To remove it: `sudo pacman -R rancha`. pacman installs the few system libraries it needs (GTK 3, NSS, ALSA and similar) if they are missing.

## Changed
- The Linux **.tar.gz** download is gone; the `.pkg.tar.zst` replaces it. The **AppImage** is still there for every other Linux system.
- Electron updated from 45.2.1 to 45.4.1 (bug and security fixes of the built-in browser).
- The PDF reader (pdf.js) updated from 6.4.299 to 6.5.438.

## Notes
- The Windows installer and the Linux files are unsigned: on Windows choose "More info" > "Run anyway".
- The game section of the Linux version is still not tested on real Linux desktops. Bug reports are very welcome.
- TMDB and SteamGridDB need a free key of your own (Settings > Online covers). This product uses the TMDB API but is not endorsed or certified by TMDB.
