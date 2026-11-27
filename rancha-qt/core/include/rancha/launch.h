#pragma once
// OPENING THINGS: how an item is started on each system, which items are missing, and the small rules around it
// (games vs. apps, chapter targets, "Played 3 days ago", "Mark as watched").
//
// Port of the Electron app's src/main/launcher.ts, src/main/platformLaunch.ts, src/main/emulatorLaunch.ts
// (tokenize), src/shared/chapterTarget.ts, src/renderer/src/lib/sections.ts, lastPlayed.ts and doneStatus.ts.
// The file system is passed in, so all of it is tested without touching real files.
#include <cstdint>
#include <functional>
#include <map>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_set>
#include <vector>

#include "rancha/file_kinds.h"
#include "rancha/item.h"
#include "rancha/library_query.h"

namespace rancha {

// ---- chapter targets: "<book path>\x1f<folder inside it>" ("." = loose pictures at the top)
inline constexpr char kChapterSeparator = '\x1f';
std::string joinChapterTarget(std::string_view bookPath, std::string_view folder);
struct ChapterTarget {
  std::string path;
  std::optional<std::string> chapter;  // none = an ordinary location, "" = loose pictures at the top
};
ChapterTarget splitChapterTarget(std::string_view target);

/// Does the item point at a file or folder at all? (Collections do not.)
bool hasLocation(const Item& item);

// ---- how a program is started
/// Splits a command line into words; "double quotes" keep spaces (emulatorLaunch.ts tokenize).
std::vector<std::string> tokenize(std::string_view command);
/// "Key=Value" lines of the [Desktop Entry] section (the first value of a key wins).
std::map<std::string, std::string> parseDesktopEntry(std::string_view text);
/// The command of a .desktop Exec= line: %f %u ... are removed, "%%" becomes "%".
std::vector<std::string> desktopCommand(std::string_view exec);
/// The address inside an Internet Shortcut (.url) file.
std::optional<std::string> urlFromShortcut(std::string_view text);

struct LaunchPlan {
  enum class Type { Open, External, Spawn, Error };
  Type type = Type::Open;
  std::string path;     // Open: the file to hand to the system's default program
  std::string url;      // External: a steam:// or web link
  std::string command;  // Spawn
  std::vector<std::string> args;
  std::string cwd;
  std::string message;  // Error: a text for the user
};

struct PlatformFs {
  std::function<bool(const std::string&)> isExecutable;           // a regular file with an "execute" bit
  std::function<std::optional<std::string>(const std::string&)> readText;  // none = could not be read
};

/// Windows: ask the system to open the file. Linux: .desktop runs Exec=, .url opens its link, scripts / AppImages /
/// executables run directly, everything else is opened with the default program.
LaunchPlan planLaunch(const std::string& path, Platform platform, const PlatformFs& fs);

// ---- opening an item
struct OpenResult {
  enum class Status { Opened, Missing, NoTarget, Failed };
  Status status = Status::Opened;
  std::string path;     // Missing: where it was looked for
  std::string message;  // Failed
  std::int64_t openedAt = 0;
};

struct LauncherDeps {
  std::function<bool(const std::string&)> exists;
  /// Starts the item ('' = started, otherwise an error text). Readers and emulators come later (R6 / R9).
  std::function<std::string(const Item&)> start;
  std::function<std::int64_t(const std::string&)> markOpened;
};

/// Throws std::runtime_error for a collection (they are opened in the library, not launched).
OpenResult openLibraryItem(const Item& item, const LauncherDeps& deps);
/// Ids of items whose file or folder no longer exists. Items without a location are never "missing".
std::vector<std::string> findMissing(const std::vector<Item>& items, const std::function<bool(const std::string&)>& exists);

// ---- games and apps
/// The top-level collection an item sits in (by its parent id). None for a top-level item.
std::optional<std::size_t> topSectionOf(const std::vector<Item>& items, const ItemIndex& byId,
                                        const std::optional<std::string>& parentId);
/// The Applications section: id "apps", or a name like "Apps" / "Applications" (any case).
bool isAppsSection(const Item& section);
/// Double-clicking opens the game screen (a game) instead of launching at once (an app in Applications).
bool opensGameScreen(const std::vector<Item>& items, const ItemIndex& byId, const Item& item);

/// "Not played yet", "Played today", "Played 3 days ago", "Played 2 months ago"... `utcOffsetMs` = the local time zone.
std::string lastPlayedText(std::optional<std::int64_t> openedAt, std::int64_t now, std::int64_t utcOffsetMs = 0);

// ---- done status
std::string doneWord(ItemKind kind);              // "Watched", "Read", "Listened", "Completed", "Done"
std::string markLabel(ItemKind kind, bool done);  // "Mark as watched", "Mark everything inside as not done"...
/// Finished items, plus collections whose items (all the way down) are all finished. Empty collections never count.
std::unordered_set<std::string> doneIdsOf(const std::vector<Item>& items);
/// The words of the Open entry of the context menu: Open, Launch, Play, Read.
std::string openLabel(ItemKind kind);

}  // namespace rancha
