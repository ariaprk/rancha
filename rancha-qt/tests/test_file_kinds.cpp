#include <string>

#include "check.h"
#include "rancha/file_kinds.h"

using namespace rancha;

// The tests run on Linux, so only "/" separates folders here.
void testFileKinds() {
  // Node's path.basename / dirname / extname
  CHECK(baseName("/games/My Game/game.exe") == "game.exe");
  CHECK(baseName("/games/rpg/") == "rpg");
  CHECK(baseName("game.exe") == "game.exe");
  CHECK(baseName("") == "");
  CHECK(dirName("/games/rpg/game.exe") == "/games/rpg");
  CHECK(dirName("/games/rpg/") == "/games");
  CHECK(dirName("/game.exe") == "/");
  CHECK(dirName("/") == "/");
  CHECK(dirName("game.exe") == ".");
  CHECK(dirName("a/b") == "a");
  CHECK(dirName("") == ".");

  // The Windows branches (path.win32): "\" separates too, "C:" is a drive that is never removed.
  constexpr Platform W = Platform::Windows;
  CHECK(baseName("C:\\Games\\My Game\\game.exe", W) == "game.exe");
  CHECK(baseName("C:\\Games\\rpg\\", W) == "rpg");
  CHECK(baseName("D:/mixed\\sep/b.txt", W) == "b.txt");
  CHECK(baseName("C:game.exe", W) == "game.exe");
  CHECK(baseName("C:\\", W) == "");
  CHECK(baseName("C:", W) == "");
  CHECK(baseName("game.exe", W) == "game.exe");
  CHECK(dirName("C:\\Games\\rpg\\game.exe", W) == "C:\\Games\\rpg");
  CHECK(dirName("C:\\Games\\rpg\\", W) == "C:\\Games");
  CHECK(dirName("C:\\game.exe", W) == "C:\\");
  CHECK(dirName("C:\\", W) == "C:\\");
  CHECK(dirName("C:", W) == "C:");
  CHECK(dirName("C:game.exe", W) == "C:");
  CHECK(dirName("C:/a/b", W) == "C:/a");
  CHECK(dirName("a\\b", W) == "a");
  CHECK(dirName("game.exe", W) == ".");
  CHECK(dirName("\\game.exe", W) == "\\");
  // On Linux "\" is an ordinary letter of a name.
  CHECK(baseName("a\\b", Platform::Linux) == "a\\b");
  CHECK(dirName("a\\b", Platform::Linux) == ".");
  CHECK(dirName("C:\\x", Platform::Linux) == ".");

  CHECK(extensionOf("/videos/Movie.MKV") == "mkv");
  CHECK(extensionOf("/home/u/.bashrc") == "");
  CHECK(extensionOf("noext") == "");
  CHECK(extensionOf("/a.b/noext") == "");
  CHECK(hasExtension("a.") && !hasExtension(".bashrc") && !hasExtension("..") && hasExtension("x.tar.gz"));
  CHECK(stemOf("/x/game.tar.gz") == "game.tar");
  CHECK(stemOf(".bashrc") == ".bashrc");

  // kinds by extension
  CHECK(launchableExtensions(Platform::Windows).size() == 6);
  CHECK(launchableExtensions(Platform::Linux).size() == 11);
  CHECK(detectKind("/g/game.EXE", Platform::Windows) == ItemKind::Launchable);
  CHECK(detectKind("/g/game.exe", Platform::Linux) == ItemKind::Launchable);  // Wine / Proton
  CHECK(detectKind("/g/start.sh", Platform::Linux) == ItemKind::Launchable);
  CHECK(!detectKind("/g/start.sh", Platform::Windows));
  CHECK(detectKind("/g/Game.AppImage", Platform::Linux) == ItemKind::Launchable);
  CHECK(detectKind("/v/a.mkv") == ItemKind::Video);
  CHECK(detectKind("/b/b.CBZ") == ItemKind::Readable);
  CHECK(detectKind("/b/b.pdf") == ItemKind::Readable);
  CHECK(detectKind("/m/c.flac") == ItemKind::Audio);
  CHECK(!detectKind("/d/notes.txt"));
  CHECK(!detectKind("/d/noext"));

  // display names
  CHECK(nameFromPath("/g/my_game_v2.exe") == "my game v2");
  CHECK(nameFromPath("/g/  Spaced   Out  .mkv") == "Spaced Out");
  CHECK(nameFromPath("/g/My__Folder.v2", true) == "My Folder.v2");
  CHECK(nameFromPath("/g/___.exe") == "___.exe");  // nothing left: the file name stays
  CHECK(nameFromPath("/g/Persian سلام_دنیا.mp4") == "Persian سلام دنیا");

  // ROMs and pages
  CHECK(isRomFile("Mario.SFC") && isRomFile("disc.chd") && !isRomFile("a.txt") && !isRomFile(".nes") && !isRomFile("nes"));
  CHECK(cleanRomName("Super Mario World (USA) [!]") == "Super Mario World");
  CHECK(cleanRomName("Zelda (USA)  -  Link") == "Zelda - Link");
  CHECK(cleanRomName("Game (beta") == "Game (beta");
  CHECK(cleanRomName(" (USA) ") == "(USA)");  // never empty
  CHECK(isPageImage("p01.JPG") && isPageImage("x/p.webp") && !isPageImage("p.txt") && !isPageImage("jpg"));

  // UTF-8 paths survive the round trip
  const std::string persian = "/tmp/کتاب ها/فصل ۱.cbz";
  CHECK(utf8Of(pathFromUtf8(persian)) == persian);
  CHECK(utf8Of(pathFromUtf8(persian).filename()) == "فصل ۱.cbz");

  // the file picker filters (fileKinds.ts targetFilters / romFilters / allSupportedFilter)
  constexpr Platform L = Platform::Linux;
  const auto video = pickerFilters(ItemKind::Video, false, L);
  CHECK(video.size() == 2);
  CHECK(video[0].rfind("Video files (*.mp4 *.mkv ", 0) == 0);
  CHECK(video[1] == "All files (*)");
  const auto programs = pickerFilters(ItemKind::Launchable, false, L);
  CHECK(programs[0].find("*.appimage") != std::string::npos && programs[0].find("*.AppImage)") != std::string::npos);
  CHECK(pickerFilters(ItemKind::Launchable, false, W)[0] == "Programs and shortcuts (*.exe *.lnk *.bat *.cmd *.url *.msi)");
  CHECK(pickerFilters(ItemKind::Launchable, true, L)[0].rfind("Console games (ROMs) (*.nes ", 0) == 0);
  const auto all = pickerFilters(std::nullopt, false, L);
  CHECK(all.size() == 6);
  CHECK(all[0].rfind("Supported files (*.exe ", 0) == 0 && all[0].find("*.weba") != std::string::npos);
  CHECK(all[4].rfind("Music files (", 0) == 0);
  CHECK((pickerFilters(ItemKind::Collection, false, L) == std::vector<std::string>{"All files (*)"}));
  CHECK((kindExtensions(ItemKind::Readable) == std::vector<std::string>{"cbz", "cbr", "pdf"}));
  CHECK(kindExtensions(ItemKind::Collection).empty() && romExtensions().size() == 48);
}
