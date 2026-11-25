# Rancha 1.1.0

This release is mostly about the **Music** section. Your library, settings and data folder stay as they are: nothing needs to be moved when updating from 1.0.0.

## New
- **A new Music page** with three panes, like a desktop music player:
  - left: the queue (**Up next**),
  - middle: the songs of the folder,
  - right: the song that is playing, with a big cover and the controls.
- The side panes can be made wider or narrower by dragging the handles between them; double-click a handle for the normal width. The widths are remembered. In a narrow window, "now playing" moves above the list.
- **Song list with columns**: cover, title, artist, album, album artist, year, genre, track, disc, length, file name, added and tags. Right-click the list's header to choose which columns to show.
- **Sorting by any column**: click a column's name to sort A–Z, click again for Z–A. Folders stay at the top, songs with an empty value go last, and songs with the same value keep their album order.
- **Column widths**: drag the edge of a column's name to make it wider or narrower (every column except the cover and the title). Double-click the edge, or choose **Normal column widths** in the header's right-click menu, to go back. When the columns do not fit, the list scrolls sideways.
- **Middle-click a song** (in the list, on a card or in a row) to add it to the queue. The right-click menu shows "Middle click" next to **Add to queue** as a reminder.

## Changed
- Songs are shown and searched by their own title, artist, album and genre from their tags, not only by the file name. Song details are read in the background, and the list is sorted and searched again as they arrive.
- The same song can now be in the queue more than once.
- Queue items show their number and a small cover, and the queue shows how many songs it holds and their total length.
- The system's media controls (for example the media keys' pop-up) show the song's own title, artist and album.
- The position bar now moves smoothly instead of jumping a few times a second.
- Big Picture: turning the mouse wheel fast no longer skips steps, and the scrolling is smooth.

## Fixed
- The position bar no longer jumps back for a moment after you click or drag it.

## Notes
- The Windows installer and the Linux files are unsigned: on Windows choose "More info" > "Run anyway".
- The game section of the Linux version is still not tested on real Linux desktops. Bug reports are very welcome.
- TMDB and SteamGridDB need a free key of your own (Settings > Online covers). This product uses the TMDB API but is not endorsed or certified by TMDB.
