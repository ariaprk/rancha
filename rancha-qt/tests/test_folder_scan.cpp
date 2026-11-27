#include <filesystem>
#include <fstream>
#include <random>
#include <string>
#include <vector>

#include "check.h"
#include "rancha/folder_scan.h"
#include "rancha/item_repository.h"
#include "rancha/scan_tree.h"

using namespace rancha;
namespace fs = std::filesystem;

namespace {

/// A fresh folder under the system temp folder, removed again at the end.
struct TempDir {
  fs::path root;
  TempDir() {
    std::random_device rd;
    root = fs::temp_directory_path() / ("rancha-scan-" + std::to_string(rd()) + std::to_string(rd()));
    fs::create_directories(root);
  }
  ~TempDir() {
    std::error_code error;
    fs::remove_all(root, error);
  }
  std::string path(const std::string& relative = "") const {
    return relative.empty() ? root.string() : (root / relative).string();
  }
  void file(const std::string& relative, std::size_t bytes = 1) const {
    const fs::path at = root / relative;
    fs::create_directories(at.parent_path());
    std::ofstream(at, std::ios::binary) << std::string(bytes, 'x');
  }
  void executable(const std::string& relative) const {
    file(relative);
    fs::permissions(root / relative, fs::perms::owner_exec, fs::perm_options::add);
  }
};

std::vector<std::string> namesOf(const std::vector<ScanNode>& nodes) {
  std::vector<std::string> out;
  for (const ScanNode& node : nodes) out.push_back(node.name);
  return out;
}

ScanOptions optionsFor(ScanContent content) {
  ScanOptions options;
  options.content = content;
  return options;
}

void testMediaScan() {
  TempDir dir;
  dir.file("Anime/Show/ep 1.mkv");
  dir.file("Anime/Show/ep 10.mkv");
  dir.file("Anime/Show/ep 2.mkv");
  dir.file("Comic/p1.jpg");
  dir.file("Comic/p2.png");
  dir.file("OnePage/p1.jpg");  // one picture is not a comic
  dir.file(".hidden/x.mkv");
  dir.file("node_modules/x.mkv");
  dir.file("notes.txt");
  dir.file("my_movie.mp4");
  dir.file("book.pdf");
  dir.file("vcredist_x64.exe");

  const FolderScan all = scanFolder(dir.path(), optionsFor(ScanContent::All), Platform::Linux);
  CHECK(all.rootPath == dir.path());
  CHECK(namesOf(all.nodes) == (std::vector<std::string>{"Anime", "Comic", "book", "my movie", "vcredist x64"}));
  CHECK(all.ignoredFiles == 1 && all.unreadable == 0 && !all.truncated);  // notes.txt
  const ScanNode& anime = all.nodes[0];
  CHECK(anime.kind == ItemKind::Collection && anime.id == dir.path("Anime") && !anime.target);
  CHECK(anime.children.size() == 1 && namesOf(anime.children[0].children) == (std::vector<std::string>{"ep 1", "ep 2", "ep 10"}));
  CHECK(anime.children[0].children[2].target == dir.path("Anime/Show/ep 10.mkv"));
  CHECK(all.nodes[1].kind == ItemKind::Readable && all.nodes[1].target == dir.path("Comic"));
  CHECK(all.nodes[2].kind == ItemKind::Readable && all.nodes[3].kind == ItemKind::Video);
  CHECK(all.nodes[4].kind == ItemKind::Launchable && !all.nodes[4].suggested);  // an installer: unticked at first
  CHECK(all.nodes[3].suggested);

  // only videos: the picture folder and the PDF are left out
  const FolderScan videos = scanFolder(dir.path(), optionsFor(ScanContent::Videos), Platform::Linux);
  CHECK(namesOf(videos.nodes) == (std::vector<std::string>{"Anime", "my movie"}));
  CHECK(videos.ignoredFiles == 3);  // notes.txt, book.pdf, vcredist_x64.exe

  // no sub-folders
  ScanOptions flat = optionsFor(ScanContent::All);
  flat.subfolders = false;
  CHECK(namesOf(scanFolder(dir.path(), flat, Platform::Linux).nodes) ==
        (std::vector<std::string>{"book", "my movie", "vcredist x64"}));

  // the chosen folder itself is a comic
  const FolderScan comic = scanFolder(dir.path("Comic"), optionsFor(ScanContent::Comics), Platform::Linux);
  CHECK(comic.nodes.size() == 1 && comic.nodes[0].kind == ItemKind::Readable && comic.nodes[0].target == dir.path("Comic") &&
        comic.rootName == "Comic");

  // a folder that cannot be opened
  const FolderScan missing = scanFolder(dir.path("nowhere"), optionsFor(ScanContent::All), Platform::Linux);
  CHECK(missing.nodes.empty() && missing.unreadable == 1);

  // things already in the library
  std::vector<ScanNode> nodes = all.nodes;
  markDuplicates(nodes, {pathKey(dir.path("my_movie.mp4"), false), pathKey(dir.path("Anime/Show/ep 2.mkv"), false)}, false);
  CHECK(nodes[3].duplicate && !nodes[3].suggested && nodes[0].children[0].children[1].duplicate);
  CHECK(!nodes[2].duplicate);
}

void testGamesScan() {
  TempDir dir;
  dir.file("My Game/MyGame.exe", 3 * 1024 * 1024);
  dir.file("My Game/unins000.exe");
  dir.file("My Game/Redist/vcredist.exe");
  dir.file("My Game/readme.txt");
  dir.file("Other/Binaries/Win64/Other.exe");
  dir.file("Other/Engine/Binaries/CrashReportClient.exe");
  dir.file("Collection/Alpha/Alpha.exe");
  dir.file("Collection/Beta/Beta.exe");
  dir.file("OnlyHelpers/setup.exe");
  dir.executable("Native/start");
  dir.file("NotNative/start");  // no execute bit
  dir.file("setup.exe");        // a loose installer is left out
  dir.file("Tool.lnk");
  dir.file("notes.txt");

  const FolderScan scan = scanFolder(dir.path(), optionsFor(ScanContent::Games), Platform::Linux);
  CHECK(namesOf(scan.nodes) == (std::vector<std::string>{"Collection", "My Game", "Native", "OnlyHelpers", "Other", "Tool"}));
  const auto byName = [&](const std::string& name) -> const ScanNode& {
    for (const ScanNode& node : scan.nodes)
      if (node.name == name) return node;
    return scan.nodes.front();
  };
  const ScanNode& game = byName("My Game");
  CHECK(game.kind == ItemKind::Launchable && game.id == dir.path("My Game") && game.target == dir.path("My Game/MyGame.exe") &&
        game.suggested);
  const ScanNode& other = byName("Other");  // the program is buried deeper
  CHECK(other.kind == ItemKind::Launchable && other.target == dir.path("Other/Binaries/Win64/Other.exe"));
  const ScanNode& group = byName("Collection");  // a folder of games
  CHECK(group.kind == ItemKind::Collection && namesOf(group.children) == (std::vector<std::string>{"Alpha", "Beta"}));
  CHECK(byName("Native").target == dir.path("Native/start"));
  CHECK(!byName("OnlyHelpers").suggested && byName("OnlyHelpers").target == dir.path("OnlyHelpers/setup.exe"));
  CHECK(byName("Tool").target == dir.path("Tool.lnk"));
  CHECK(scan.ignoredFiles >= 1);

  // every program of a game folder (helpers left out)
  dir.file("My Game/MyGame Launcher.exe");
  ScanOptions every = optionsFor(ScanContent::Games);
  every.allPrograms = true;
  const FolderScan all = scanFolder(dir.path(), every, Platform::Linux);
  const ScanNode* mine = nullptr;
  for (const ScanNode& node : all.nodes)
    if (node.name == "My Game") mine = &node;
  CHECK(mine && mine->kind == ItemKind::Collection && namesOf(mine->children) == (std::vector<std::string>{"MyGame", "MyGame Launcher"}));
  CHECK(mine && mine->children[0].suggested && !mine->children[1].suggested);

  // scoring
  const ScanProgram plain{"/g/Game.exe", "Game", 0, false};
  CHECK(scoreProgram(plain, "Game", 0) == 100);
  CHECK(scoreProgram(plain, "Game", 1048576) == 104);
  CHECK(scoreProgram(plain, "Game", 1e15) == 120);
  CHECK(scoreProgram({"/g/x/Game.exe", "Game", 2, false}, "The Game", 0) == 40);
  CHECK(scoreProgram({"/g/GameLauncher.exe", "GameLauncher", 0, false}, "Game", 0) == 40);
  CHECK(scoreProgram({"/g/Gamexyz.bat", "Gamexyz", 0, false}, "Gamexx", 0) == 20);
  CHECK(scoreProgram({"/g/unins000.exe", "unins000", 0, true}, "Game", 0) == -200);
  CHECK(isHelperProgram("UnityCrashHandler64") && isHelperProgram("SETUP") && !isHelperProgram("Hollow Knight"));
}

void testRomScan() {
  TempDir dir;
  dir.file("SNES/Super Mario World (USA) [!].sfc");
  dir.file("SNES/readme.txt");
  dir.file("Wii U/Zelda (USA)/code/app.rpx");
  dir.file("Mario.NES");

  const FolderScan scan = scanFolder(dir.path(), optionsFor(ScanContent::Roms), Platform::Linux);
  CHECK(namesOf(scan.nodes) == (std::vector<std::string>{"SNES", "Wii U", "Mario"}));
  CHECK(namesOf(scan.nodes[0].children) == (std::vector<std::string>{"Super Mario World"}));
  CHECK(scan.ignoredFiles == 1);

  ScanOptions folders = optionsFor(ScanContent::Roms);
  folders.gameFolders = true;
  const FolderScan wiiU = scanFolder(dir.path("Wii U"), folders, Platform::Linux);
  CHECK(wiiU.nodes.size() == 1 && wiiU.nodes[0].name == "Zelda" && wiiU.nodes[0].target == dir.path("Wii U/Zelda (USA)"));
  const FolderScan top = scanFolder(dir.path(), folders, Platform::Linux);
  CHECK(namesOf(top.nodes) == (std::vector<std::string>{"Mario", "SNES", "Wii U"}));
}

void testTruncated() {
  TempDir dir;
  for (int i = 0; i < kMaxScanNodes + 5; ++i) dir.file("v" + std::to_string(i) + ".mkv", 0);
  const FolderScan scan = scanFolder(dir.path(), optionsFor(ScanContent::Videos), Platform::Linux);
  CHECK(static_cast<int>(scan.nodes.size()) == kMaxScanNodes && scan.truncated);
}

ScanNode leafNode(const std::string& id, ItemKind kind = ItemKind::Video, bool suggested = true, bool duplicate = false) {
  ScanNode node;
  node.id = id;
  node.name = id;
  node.kind = kind;
  node.target = "/x/" + id + ".file";
  node.suggested = suggested;
  node.duplicate = duplicate;
  return node;
}

ScanNode folderNode(const std::string& id, std::vector<ScanNode> children) {
  ScanNode node;
  node.id = id;
  node.name = id;
  node.kind = ItemKind::Collection;
  node.children = std::move(children);
  return node;
}

void testScanTree() {
  using namespace rancha::scan;
  const std::vector<ScanNode> nodes{
      folderNode("Anime", {folderNode("Show", {leafNode("ep1"), leafNode("ep2", ItemKind::Video, true, true)}),
                           leafNode("setup", ItemKind::Launchable, false)}),
      folderNode("Empty", {}),
      leafNode("movie"),
  };
  CHECK(leavesOf(nodes).size() == 4 && leavesOf(nodes)[0]->id == "ep1" && leavesOf(nodes)[3]->id == "movie");

  const Checked start = initialChecked(nodes);
  CHECK(start == (Checked{"ep1", "movie"}));
  CHECK(stateOf(nodes[0], start) == CheckState::Some);
  CHECK(stateOf(nodes[1], start) == CheckState::None);
  CHECK(stateOf(nodes[2], start) == CheckState::All);
  CHECK(nextOn(CheckState::Some) && nextOn(CheckState::None) && !nextOn(CheckState::All));

  const Checked full = setNode(nodes[0], true, start);
  CHECK(full == (Checked{"ep1", "ep2", "setup", "movie"}) && stateOf(nodes[0], full) == CheckState::All);
  CHECK(setNode(nodes[0], false, full) == (Checked{"movie"}));
  CHECK(setNode(nodes[2], false, start) == (Checked{"ep1"}));
  CHECK(setAll(nodes, true).size() == 4 && setAll(nodes, false).empty());

  // the tree keeps folders that have something ticked; empty ones are left out
  const auto tree = buildImport(nodes, start, Layout::Tree, "");
  CHECK(tree.size() == 2 && tree[0].name == "Anime" && tree[0].children.size() == 1 && tree[0].children[0].name == "Show" &&
        tree[0].children[0].children.size() == 1 && tree[0].children[0].children[0].target == "/x/ep1.file" &&
        tree[1].name == "movie" && tree[1].kind == ItemKind::Video);
  CHECK(countImport(tree) == 2);
  const auto flat = buildImport(nodes, full, Layout::Flat, "");
  CHECK(flat.size() == 4 && flat[0].name == "ep1" && flat[3].name == "movie" && countImport(flat) == 4);
  const auto wrapped = buildImport(nodes, start, Layout::Flat, "  My anime  ");
  CHECK(wrapped.size() == 1 && wrapped[0].name == "My anime" && wrapped[0].kind == ItemKind::Collection &&
        wrapped[0].children.size() == 2 && countImport(wrapped) == 2);
  CHECK(buildImport(nodes, {}, Layout::Tree, "Wrap").empty());  // nothing ticked: no empty wrapper
  CHECK(buildImport(nodes, start, Layout::Tree, "   ").size() == 2);

  CHECK(defaultsFor(ScanContent::Games).layout == Layout::Flat && !defaultsFor(ScanContent::Games).wrap);
  CHECK(defaultsFor(ScanContent::Roms).layout == Layout::Tree && defaultsFor(ScanContent::Roms).wrap);
  CHECK(defaultsFor(ScanContent::Videos).wrap && defaultsFor(ScanContent::Music).wrap && !defaultsFor(ScanContent::All).wrap);

  CHECK(searchWords("  Dark   SOULS ") == (std::vector<std::string>{"dark", "souls"}));
  CHECK(filterTree(nodes, {}).size() == 3);
  const auto byEp = filterTree(nodes, {"ep2"});
  CHECK(byEp.size() == 1 && byEp[0].children.size() == 1 && byEp[0].children[0].children.size() == 1);
  CHECK(filterTree(nodes, {"anime"})[0].children.size() == 2);  // a matching folder is kept whole
  CHECK(filterTree(nodes, {"file", "movie"}).size() == 1);      // words may match the path
  CHECK(filterTree(nodes, {"ep", "zzz"}).empty());
  CHECK(setLeaves(byEp, true, start) == (Checked{"ep1", "ep2", "movie"}));
  CHECK(setLeaves(byEp, false, full) == (Checked{"ep1", "setup", "movie"}));
  CHECK(collectionIds(nodes) == (std::vector<std::string>{"Anime", "Show", "Empty"}));

  CHECK(scanContentFromString(toString(ScanContent::Comics)) == ScanContent::Comics);
  CHECK(scanContentFromString("??") == ScanContent::All);
}

}  // namespace

void testFolderScan() {
  testMediaScan();
  testGamesScan();
  testRomScan();
  testTruncated();
  testScanTree();
}
