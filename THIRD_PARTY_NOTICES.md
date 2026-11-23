# Third-party notices

Rancha is built on the following open-source software. Each keeps its own license; the full texts are in the packages themselves (the `node_modules` folder when building, and inside the installed app).

| Component | Used for | License |
| --- | --- | --- |
| Electron | desktop app shell | MIT |
| React / React DOM | user interface | MIT |
| Vite / electron-vite | build tools | MIT |
| pdfjs-dist (PDF.js) | PDF reading | Apache-2.0 |
| node-unrar-js | reading .cbr (RAR) comics | see the package's own license |
| Poppins font (Regular, Medium, Bold) | interface font | SIL Open Font License 1.1 |

Artwork:
- The app icon (Rancha) was created with an AI image tool by the project owner.
- The interface icons come from **Flaticon** (www.flaticon.com), used under Flaticon's free license, which requires attribution. Credits found so far (author names taken from the icon pages):
  - Game icon by [sonnycandra](https://www.flaticon.com/free-icon/game_10953366) (pack "Essential UI") from www.flaticon.com
  - Play/video icon: "UIcons" by [Flaticon](https://www.flaticon.com/free-icon-font/play-alt_3914307) (the page names Flaticon itself as author)
  - Apps icon: "UIcons" by [Flaticon](https://www.flaticon.com/free-icon-font/apps_3917618) (the page names Flaticon itself as author)
  - Note: five icon files ship with the app; the owner supplied links for the game, book, play and apps icons (the "video game" file is taken to be one of the supplied game/video icons — owner to confirm).
  Free-license icons may not be redistributed as a stand-alone icon pack, which is another reason to keep the source repository private.

Optional online feature: cover search uses the SteamGridDB API with the user's own key; its terms apply to that use.

Run `npx license-checker --production --summary` in the project folder for a complete, current list of dependency licenses.

## Online picture databases (only when you press Search online)
- TMDB: this product uses the TMDB API but is not endorsed or certified by TMDB.
- AniList, TVmaze and SteamGridDB: pictures are fetched on request; the pictures belong to their owners.
