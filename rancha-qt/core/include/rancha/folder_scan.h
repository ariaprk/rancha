#pragma once
// FOLDER SCAN: looks through a folder on the PC and builds a preview tree of what could be added to the library:
// programs, videos, comics/PDFs, music, ROMs, and folders of pictures (which become one readable comic each).
// Nothing is changed on disk or in the library by scanning.
//
// Port of the Electron app's src/main/folderScan.ts (and the "Add a folder" preview logic of
// src/renderer/src/lib/scanTree.ts, see scan_tree.h).
#include <optional>
#include <string>
#include <unordered_set>
#include <vector>

#include "rancha/file_kinds.h"
#include "rancha/item.h"

namespace rancha {

inline constexpr int kMaxScanNodes = 5000;

struct ScanNode {
  std::string id;  // unique inside one scan (its path)
  std::string name;
  ItemKind kind = ItemKind::Collection;
  std::optional<std::string> target;  // not for collections
  std::vector<ScanNode> children;     // only for collections
  bool duplicate = false;             // already in the library (same location)
  bool suggested = true;              // false = probably not wanted (installers...), unticked at first
};

/// What the user says the folder contains; decides what the scan looks for.
enum class ScanContent { Games, Roms, Videos, Comics, Music, All };
const char* toString(ScanContent content);
ScanContent scanContentFromString(const std::string& text);  // unknown text gives All

struct ScanOptions {
  bool subfolders = true;  // look inside sub-folders too
  ScanContent content = ScanContent::All;
  bool allPrograms = false;  // games: every program of a game folder instead of the best guess
  bool gameFolders = false;  // ROMs: every sub-folder is ONE game (Wii U, PS3...)
};

struct FolderScan {
  std::string rootPath;
  std::string rootName;
  std::vector<ScanNode> nodes;
  int ignoredFiles = 0;    // files of unsupported types that were skipped
  int unreadable = 0;      // folders that could not be opened
  bool truncated = false;  // too many things found; the list was cut off
};

/// `rootPath` is UTF-8. Reads the real file system.
FolderScan scanFolder(const std::string& rootPath, const ScanOptions& options, Platform platform = kPlatform);

/// Marks nodes whose location is already in the library (keys made with pathKey).
void markDuplicates(std::vector<ScanNode>& nodes, const std::unordered_set<std::string>& existingKeys,
                    bool windowsPaths);

/// A program found inside a game folder.
struct ScanProgram {
  std::string path;
  std::string stem;
  int depth = 0;
  bool helper = false;  // an uninstaller, redistributable, crash reporter...
};
bool isHelperProgram(const std::string& stem);
/// Higher = more likely to be the program that starts the game. `size` in bytes.
double scoreProgram(const ScanProgram& program, const std::string& folderName, double size);

}  // namespace rancha
