// Port of src/main/folderScan.ts.
#include "rancha/folder_scan.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <filesystem>
#include <regex>
#include <system_error>

#include "rancha/item_repository.h"
#include "rancha/natural_compare.h"

namespace rancha {
namespace {

namespace fs = std::filesystem;

constexpr int kMaxDepth = 8;
constexpr int kMinComicPages = 2;
constexpr int kMaxGameDepth = 4;
constexpr std::size_t kMaxCandidates = 60;

std::string lower(std::string_view text) {
  std::string out(text);
  for (char& c : out) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return out;
}

bool isSkippedFolder(const std::string& name) {
  const std::string key = lower(name);
  return key == "$recycle.bin" || key == "system volume information" || key == "node_modules";
}

// Files that are almost never what you want in a library (unticked at first).
const std::regex& noisePattern() {
  static const std::regex pattern(
      R"(^(unins\w*|uninstall\w*|.*vc_?redist.*|dxsetup|dotnet.*|oalinst|crash\w*|ue4prereq\w*|.*redist.*|setup\w*launcher)$)",
      std::regex::ECMAScript | std::regex::icase);
  return pattern;
}
const std::regex& helperPattern() {
  static const std::regex pattern(
      "(unins|uninstall|redist|vc_?redist|dxsetup|dxwebsetup|directx|dotnet|ndp\\d|oalinst|crash|ue4prereq|prereq|setup|"
      "install|updater|update|helper|notification|cefsubprocess|vulkan|physx|anticheat|easyanticheat|battleye|handler|"
      "diagnostic|bugreport|reporter)",
      std::regex::ECMAScript | std::regex::icase);
  return pattern;
}
const std::regex& weakPattern() {
  static const std::regex pattern("(launcher|config|settings|editor|server|benchmark|tool|patcher|dedicated)",
                                  std::regex::ECMAScript | std::regex::icase);
  return pattern;
}

bool isNoise(const std::string& stem) { return std::regex_search(stem, noisePattern()); }

struct State {
  int count = 0;
  int ignored = 0;
  int unreadable = 0;
  bool truncated = false;
};

/// One directory entry, like a Node Dirent: a symbolic link is neither a file nor a folder.
struct Entry {
  std::string name;
  bool isFile = false;
  bool isDirectory = false;
};

bool isSeparator(char c, Platform platform) { return c == '/' || (platform == Platform::Windows && c == '\\'); }

std::string join(const std::string& dir, const std::string& name, Platform platform) {
  if (dir.empty()) return name;
  if (isSeparator(dir.back(), platform)) return dir + name;
  return dir + (platform == Platform::Windows ? '\\' : '/') + name;
}

std::optional<std::vector<Entry>> readDir(const std::string& dir) {
  std::error_code error;
  fs::directory_iterator it(pathFromUtf8(dir), error);
  if (error) return std::nullopt;
  std::vector<Entry> entries;
  for (const fs::directory_iterator end; it != end; it.increment(error)) {
    if (error) break;
    std::error_code statusError;
    const fs::file_status status = it->symlink_status(statusError);
    Entry entry;
    entry.name = utf8Of(it->path().filename());
    if (!statusError) {
      entry.isFile = fs::is_regular_file(status);
      entry.isDirectory = fs::is_directory(status);
    }
    entries.push_back(std::move(entry));
  }
  return entries;
}

void sortByName(std::vector<Entry>& entries, bool foldersFirst) {
  std::stable_sort(entries.begin(), entries.end(), [&](const Entry& a, const Entry& b) {
    if (foldersFirst && a.isDirectory != b.isDirectory) return a.isDirectory;
    return naturalCompare(a.name, b.name) < 0;
  });
}

bool allows(ScanContent content, ItemKind kind) {
  switch (content) {
    case ScanContent::Roms: return kind == ItemKind::Launchable;
    case ScanContent::Videos: return kind == ItemKind::Video;
    case ScanContent::Comics: return kind == ItemKind::Readable;
    case ScanContent::Music: return kind == ItemKind::Audio;
    case ScanContent::Games:
    case ScanContent::All: return kind != ItemKind::Collection;
  }
  return false;
}

ScanNode leaf(const std::string& path, std::string name, ItemKind kind, bool suggested) {
  ScanNode node;
  node.id = path;
  node.name = std::move(name);
  node.kind = kind;
  node.target = path;
  node.suggested = suggested;
  return node;
}

ScanNode collection(const std::string& id, std::string name, std::vector<ScanNode> children) {
  ScanNode node;
  node.id = id;
  node.name = std::move(name);
  node.kind = ItemKind::Collection;
  node.children = std::move(children);
  node.suggested = true;
  return node;
}

struct DirResult {
  std::vector<ScanNode> nodes;
  int images = 0;
};

DirResult scanDir(const std::string& dir, int depth, const ScanOptions& options, Platform platform, State& state) {
  DirResult result;
  auto entries = readDir(dir);
  if (!entries) {
    ++state.unreadable;
    return result;
  }
  sortByName(*entries, true);  // folders first, then files, each in natural order
  const bool comics = allows(options.content, ItemKind::Readable);

  for (const Entry& entry : *entries) {
    if (!entry.name.empty() && entry.name.front() == '.') continue;
    if (state.count >= kMaxScanNodes) {
      state.truncated = true;
      break;
    }
    const std::string path = join(dir, entry.name, platform);

    if (entry.isFile && options.content == ScanContent::Roms) {
      if (isRomFile(entry.name)) {
        ++state.count;
        result.nodes.push_back(leaf(path, cleanRomName(stemOf(entry.name)), ItemKind::Launchable, true));
      } else {
        ++state.ignored;
      }
    } else if (entry.isFile) {
      const auto kind = detectKind(entry.name, platform);
      if (kind && allows(options.content, *kind)) {
        ++state.count;
        result.nodes.push_back(leaf(path, nameFromPath(path), *kind, !isNoise(stemOf(entry.name))));
      } else if (!kind && isPageImage(entry.name)) {
        ++result.images;
      } else {
        ++state.ignored;
      }
    } else if (entry.isDirectory) {
      if (!options.subfolders || depth >= kMaxDepth || isSkippedFolder(entry.name)) continue;
      DirResult inner = scanDir(path, depth + 1, options, platform, state);
      if (comics && inner.nodes.empty() && inner.images >= kMinComicPages) {
        ++state.count;  // a folder that only holds pictures is a comic
        result.nodes.push_back(leaf(path, nameFromPath(path, true), ItemKind::Readable, true));
      } else if (!inner.nodes.empty()) {
        ++state.count;
        result.nodes.push_back(collection(path, nameFromPath(path, true), std::move(inner.nodes)));
      }
    }
  }
  return result;
}

/// ROMs kept as folders (Wii U, PS3...): every sub-folder is ONE game; loose ROM files are listed too.
std::vector<ScanNode> scanGameFolders(const std::string& rootPath, Platform platform, State& state) {
  auto entries = readDir(rootPath);
  if (!entries) {
    ++state.unreadable;
    return {};
  }
  sortByName(*entries, false);
  std::vector<ScanNode> nodes;
  for (const Entry& entry : *entries) {
    if ((!entry.name.empty() && entry.name.front() == '.') || isSkippedFolder(entry.name)) continue;
    if (static_cast<int>(nodes.size()) >= kMaxScanNodes) {
      state.truncated = true;
      break;
    }
    const std::string path = join(rootPath, entry.name, platform);
    if (entry.isDirectory) nodes.push_back(leaf(path, cleanRomName(entry.name), ItemKind::Launchable, true));
    else if (entry.isFile && isRomFile(entry.name))
      nodes.push_back(leaf(path, cleanRomName(stemOf(entry.name)), ItemKind::Launchable, true));
    else ++state.ignored;
  }
  return nodes;
}

// ---- games and apps: every game folder becomes ONE entry, the program that most likely starts the game.

bool isProgramFile(const std::string& name, Platform platform) {
  const std::string extension = extensionOf(name);
  if (extension.empty() || extension == "msi") return false;
  const auto list = launchableExtensions(platform);
  return std::find(list.begin(), list.end(), extension) != list.end();
}

/// A program by name, or (Linux) a file with no extension that has an "execute" bit.
bool isProgramEntry(const std::string& path, const std::string& name, Platform platform) {
  if (isProgramFile(name, platform)) return true;
  if (platform == Platform::Windows || hasExtension(name)) return false;
  std::error_code error;
  const fs::file_status status = fs::status(pathFromUtf8(path), error);
  if (error || !fs::is_regular_file(status)) return false;
  const auto exec = fs::perms::owner_exec | fs::perms::group_exec | fs::perms::others_exec;
  return (status.permissions() & exec) != fs::perms::none;
}

ScanProgram makeProgram(const std::string& path, const std::string& fileName, int depth) {
  const std::string stem = stemOf(fileName);
  return {path, stem, depth, isHelperProgram(stem)};
}

std::vector<ScanProgram> programsIn(const std::string& dir, int maxDepth, Platform platform, State& state, int depth = 0) {
  auto entries = readDir(dir);
  if (!entries) {
    ++state.unreadable;
    return {};
  }
  sortByName(*entries, false);
  std::vector<ScanProgram> found;
  for (const Entry& entry : *entries) {
    if ((!entry.name.empty() && entry.name.front() == '.') || found.size() >= kMaxCandidates) continue;
    const std::string path = join(dir, entry.name, platform);
    if (entry.isFile && isProgramEntry(path, entry.name, platform)) {
      found.push_back(makeProgram(path, entry.name, depth));
    } else if (entry.isDirectory && depth < maxDepth && !isSkippedFolder(entry.name)) {
      auto inner = programsIn(path, maxDepth, platform, state, depth + 1);
      found.insert(found.end(), inner.begin(), inner.end());
    } else if (entry.isFile) {
      ++state.ignored;
    }
  }
  return found;
}

double sizeOf(const std::string& path) {
  std::error_code error;
  const auto size = fs::file_size(pathFromUtf8(path), error);
  return error ? 0 : static_cast<double>(size);
}

struct Ranked {
  ScanProgram program;
  double score = 0;
};

std::vector<Ranked> ranked(const std::vector<ScanProgram>& programs, const std::string& folderName) {
  std::vector<Ranked> out;
  for (const ScanProgram& program : programs) out.push_back({program, scoreProgram(program, folderName, sizeOf(program.path))});
  std::stable_sort(out.begin(), out.end(), [](const Ranked& a, const Ranked& b) {
    if (a.score != b.score) return a.score > b.score;
    return naturalCompare(a.program.path, b.program.path) < 0;
  });
  return out;
}

/// One game folder -> one entry (or, if asked, a collection of all its programs).
ScanNode gameNode(const std::string& dir, const std::vector<ScanProgram>& programs, const ScanOptions& options, State& state) {
  const std::string folderName = nameFromPath(dir, true);
  const auto order = ranked(programs, folderName);
  const bool allHelpers = std::all_of(order.begin(), order.end(), [](const Ranked& r) { return r.program.helper; });
  std::vector<Ranked> usable;
  for (const Ranked& r : order)
    if (allHelpers || !r.program.helper) usable.push_back(r);
  if (!options.allPrograms || usable.size() == 1) {
    ++state.count;
    ScanNode node = leaf(order.front().program.path, folderName, ItemKind::Launchable, !allHelpers);
    node.id = dir;
    return node;
  }
  std::vector<ScanNode> children;
  for (std::size_t i = 0; i < usable.size(); ++i)
    children.push_back(leaf(usable[i].program.path, nameFromPath(usable[i].program.path), ItemKind::Launchable, i == 0 && !allHelpers));
  state.count += static_cast<int>(children.size()) + 1;
  return collection(dir, folderName, std::move(children));
}

std::optional<ScanNode> gameFolder(const std::string& dir, int level, const ScanOptions& options, Platform platform, State& state) {
  if (state.count >= kMaxScanNodes) {
    state.truncated = true;
    return std::nullopt;
  }
  auto entries = readDir(dir);
  if (!entries) {
    ++state.unreadable;
    return std::nullopt;
  }
  sortByName(*entries, false);

  // 1. Programs lying directly in this folder: this IS a game folder.
  std::vector<ScanProgram> direct;
  for (const Entry& entry : *entries) {
    if (!entry.isFile || (!entry.name.empty() && entry.name.front() == '.')) continue;
    const std::string path = join(dir, entry.name, platform);
    if (isProgramEntry(path, entry.name, platform)) direct.push_back(makeProgram(path, entry.name, 0));
  }
  if (std::any_of(direct.begin(), direct.end(), [](const ScanProgram& p) { return !p.helper; }))
    return gameNode(dir, direct, options, state);

  // 2. A folder of games (one more level down).
  if (level < 2) {
    std::vector<ScanNode> children;
    for (const Entry& entry : *entries) {
      if (!entry.isDirectory || (!entry.name.empty() && entry.name.front() == '.') || isSkippedFolder(entry.name)) continue;
      if (auto child = gameFolder(join(dir, entry.name, platform), level + 1, options, platform, state))
        children.push_back(std::move(*child));
    }
    if (children.size() == 1) {
      ScanNode only = std::move(children.front());
      only.name = nameFromPath(dir, true);
      only.id = dir;
      return only;
    }
    if (children.size() > 1) return collection(dir, nameFromPath(dir, true), std::move(children));
  }

  // 3. The program is buried deeper (Binaries/Win64/Game.exe): only for a top-level game folder.
  if (level > 1) return std::nullopt;
  std::vector<ScanProgram> deep = direct;
  for (ScanProgram& p : programsIn(dir, kMaxGameDepth, platform, state)) {
    const bool known = std::any_of(direct.begin(), direct.end(), [&](const ScanProgram& d) { return d.path == p.path; });
    if (!known) deep.push_back(std::move(p));
  }
  if (deep.empty()) return std::nullopt;
  return gameNode(dir, deep, options, state);
}

std::vector<ScanNode> scanGames(const std::string& rootPath, const ScanOptions& options, Platform platform, State& state) {
  auto entries = readDir(rootPath);
  if (!entries) {
    ++state.unreadable;
    return {};
  }
  sortByName(*entries, true);
  std::vector<ScanNode> nodes;
  for (const Entry& entry : *entries) {
    if (!entry.name.empty() && entry.name.front() == '.') continue;
    const std::string path = join(rootPath, entry.name, platform);
    if (entry.isFile) {
      if (isProgramEntry(path, entry.name, platform)) {
        if (!isHelperProgram(stemOf(entry.name))) {  // loose programs and shortcuts are listed as they are
          ++state.count;
          nodes.push_back(leaf(path, nameFromPath(path), ItemKind::Launchable, true));
        }
      } else {
        ++state.ignored;
      }
    } else if (entry.isDirectory && options.subfolders && !isSkippedFolder(entry.name)) {
      if (auto node = gameFolder(path, 1, options, platform, state)) nodes.push_back(std::move(*node));
    }
  }
  return nodes;
}

std::string lettersOf(std::string_view text) {
  std::string out;
  for (char c : lower(text))
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) out += c;
  return out;
}

}  // namespace

const char* toString(ScanContent content) {
  switch (content) {
    case ScanContent::Games: return "games";
    case ScanContent::Roms: return "roms";
    case ScanContent::Videos: return "videos";
    case ScanContent::Comics: return "comics";
    case ScanContent::Music: return "music";
    case ScanContent::All: break;
  }
  return "all";
}

ScanContent scanContentFromString(const std::string& text) {
  if (text == "games") return ScanContent::Games;
  if (text == "roms") return ScanContent::Roms;
  if (text == "videos") return ScanContent::Videos;
  if (text == "comics") return ScanContent::Comics;
  if (text == "music") return ScanContent::Music;
  return ScanContent::All;
}

bool isHelperProgram(const std::string& stem) { return std::regex_search(stem, helperPattern()); }

double scoreProgram(const ScanProgram& program, const std::string& folderName, double size) {
  const std::string folder = lettersOf(folderName);
  const std::string name = lettersOf(program.stem);
  double score = 0;
  if (!name.empty() && name == folder) {
    score += 100;
  } else if (name.size() >= 3 && folder.size() >= 3 &&
             (folder.find(name) != std::string::npos || name.find(folder) != std::string::npos)) {
    score += 60;
  } else {
    std::size_t shared = 0;
    while (shared < name.size() && shared < folder.size() && name[shared] == folder[shared]) ++shared;
    if (shared >= 4) score += 30;
  }
  if (program.helper) score -= 200;
  if (std::regex_search(program.stem, weakPattern())) score -= 20;
  const std::string extension = extensionOf(program.path);
  if (extension == "lnk" || extension == "url") score += 5;
  if (extension == "bat" || extension == "cmd" || extension == "sh") score -= 10;
  score -= program.depth * 10;
  score += std::min(20.0, std::log2(size / 1048576 + 1) * 4);
  return score;
}

FolderScan scanFolder(const std::string& rootPath, const ScanOptions& options, Platform platform) {
  State state;
  FolderScan scan;
  scan.rootPath = rootPath;
  scan.rootName = nameFromPath(rootPath, true);
  if (options.content == ScanContent::Games) {
    scan.nodes = scanGames(rootPath, options, platform, state);
  } else if (options.content == ScanContent::Roms && options.gameFolders) {
    scan.nodes = scanGameFolders(rootPath, platform, state);
  } else {
    DirResult top = scanDir(rootPath, 0, options, platform, state);
    scan.nodes = std::move(top.nodes);
    if (allows(options.content, ItemKind::Readable) && scan.nodes.empty() && top.images >= kMinComicPages) {
      scan.nodes.push_back(leaf(rootPath, nameFromPath(rootPath, true), ItemKind::Readable, true));  // the folder is a comic
    }
  }
  scan.ignoredFiles = state.ignored;
  scan.unreadable = state.unreadable;
  scan.truncated = state.truncated;
  return scan;
}

void markDuplicates(std::vector<ScanNode>& nodes, const std::unordered_set<std::string>& existingKeys, bool windowsPaths) {
  for (ScanNode& node : nodes) {
    if (node.target && existingKeys.count(pathKey(*node.target, windowsPaths))) {
      node.duplicate = true;
      node.suggested = false;
    }
    markDuplicates(node.children, existingKeys, windowsPaths);
  }
}

}  // namespace rancha
