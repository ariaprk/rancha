#pragma once
// REPOSITORY: the only code that knows how items are stored. The rest of the app asks it for
// items or tells it about changes, and never writes SQL itself.
//
// Port of the Electron app's src/main/db/itemRepository.ts. Same SQL, same rules, same error
// texts, so both apps change a library in exactly the same way. Every change that touches more
// than one row is ONE transaction: all of it is saved, or nothing.
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "rancha/database.h"
#include "rancha/item.h"

namespace rancha {

/// A field that may be set to a value or cleared (NULL).
using Nullable = std::optional<std::string>;
/// A field of a patch: not present (leave it), or set to a value / cleared.
/// Write `patch.coverFile = Nullable("a.png")` to set and `patch.coverFile = Nullable()` to clear.
using Change = std::optional<Nullable>;

/// A new item (NewItemInput).
struct NewItem {
  std::optional<std::string> parentId;  // none = top level
  ItemKind kind = ItemKind::Collection;
  std::string name;
  std::optional<std::string> description;
  std::optional<std::string> target;
  std::vector<std::string> tags;
  std::optional<int> hue;  // none = a colour made from the name
  std::optional<std::string> coverFile;
  std::optional<std::string> wallpaperFile;
  std::optional<std::string> emulator;
  std::optional<std::string> core;
};

/// What to change in an item (ItemPatch). Only the fields present change.
struct ItemPatch {
  std::optional<std::string> name;
  Change description;
  Change target;
  std::optional<std::vector<std::string>> tags;
  std::optional<int> hue;
  Change coverFile;
  Change wallpaperFile;
  Change emulator;
  Change core;
};

struct UpdateResult {
  Item item;
  std::optional<std::string> removedCover;      // the old cover file, to be deleted by the caller
  std::optional<std::string> removedWallpaper;  // the same for the wallpaper
};

/// One node of a folder import (ImportNodeInput).
struct ImportNode {
  std::string name;
  ItemKind kind = ItemKind::Collection;
  std::optional<std::string> target;
  std::optional<std::string> emulator;
  std::optional<std::string> core;
  std::vector<ImportNode> children;
};

struct TreeImportResult {
  int added = 0;
  int collections = 0;
  int duplicates = 0;  // skipped: the location is already in the library
  bool operator==(const TreeImportResult&) const = default;
};

struct ReadingState {
  int page = 0;
  int pageCount = 0;
  std::string direction = "ltr";  // "ltr" or "rtl"
  bool operator==(const ReadingState&) const = default;
};

/// One chapter of a comic that becomes a collection.
struct Chapter {
  std::string name;
  std::string target;
  int start = 0;  // its first page in the whole book
  int count = 0;  // how many pages it has
};

struct DeleteResult {
  int deleted = 0;
  std::vector<std::string> covers;  // picture files of the deleted items
};

enum class ReorderDirection { Earlier, Later };

/// A stable pleasant colour (0-359) for a name, used until the user picks one.
int hueFromName(std::string_view name);
/// The five main sections can be renamed and filled, but not deleted or moved.
bool isProtectedSection(std::string_view id, const std::optional<std::string>& parentId);
/// Duplicate checks compare locations. Windows ignores upper/lower case in paths, Linux does not.
/// Note: only A-Z are folded (JavaScript's toLowerCase also folds other letters).
#ifdef _WIN32
inline constexpr bool kWindowsPaths = true;
#else
inline constexpr bool kWindowsPaths = false;
#endif
std::string pathKey(std::string_view path, bool windows = kWindowsPaths);
/// A random version-4 UUID in lower case (what crypto.randomUUID() gives).
std::string randomUuid();

class ItemRepository {
 public:
  explicit ItemRepository(db::Database& db) : db_(db) {}

  // ---- reading
  std::vector<Item> listItems();
  std::optional<Item> getItem(const std::string& id);
  /// Every picture file in use: covers and wallpapers (they share one folder).
  std::vector<std::string> listCoverFiles();
  std::unordered_set<std::string> existingTargets();
  int countItems();
  std::optional<ReadingState> getReadingState(const std::string& itemId);

  // ---- changing (errors are db::Error with a text for the user)
  Item createItem(const NewItem& input);
  TreeImportResult importTree(const std::optional<std::string>& parentId, const std::vector<ImportNode>& nodes);
  UpdateResult updateItem(const std::string& id, const ItemPatch& patch);
  void setFavorite(const std::string& id, bool value);
  void snapshotTo(const std::string& filePath);  // UTF-8 path
  void saveReadingState(const std::string& itemId, const ReadingState& state, std::int64_t now = db::nowMs());
  void convertToChapters(const std::string& id, const std::vector<Chapter>& chapters, int resumePage,
                         const std::string& resumeDirection, const std::optional<std::string>& keepCover = {});
  std::int64_t markOpened(const std::string& id, std::int64_t now = db::nowMs());
  std::vector<std::string> deleteItem(const std::string& id);
  void moveItem(const std::string& id, const std::optional<std::string>& newParentId);

  // ---- several at once (each is one transaction); they return how many items changed
  int setFavoriteMany(const std::vector<std::string>& ids, bool value);
  int setDoneMany(const std::vector<std::string>& ids, bool value);
  int addTagMany(const std::vector<std::string>& ids, const std::string& tag);
  int removeTagMany(const std::vector<std::string>& ids, const std::string& tag);
  int moveMany(const std::vector<std::string>& ids, const std::optional<std::string>& newParentId);
  DeleteResult deleteMany(const std::vector<std::string>& ids);
  void moveWithinFolder(const std::string& id, ReorderDirection direction);
  int placeMany(const std::vector<std::string>& ids, const std::optional<std::string>& beforeId);

 private:
  template <class Work>
  void transaction(Work&& work);
  std::string insertItem(const NewItem& input);
  std::vector<std::string> deleteUnchecked(const std::string& id);
  bool moveUnchecked(const std::string& id, const std::optional<std::string>& newParentId);
  std::vector<std::string> outermost(const std::vector<std::string>& ids);
  std::unordered_set<std::string> leavesOf(const std::vector<std::string>& ids);
  void assertValidParent(const std::optional<std::string>& parentId);
  bool isInside(const std::string& rootId, const std::string& candidateId);
  bool exists(const std::string& id);
  std::int64_t nextSortOrder(const std::optional<std::string>& parentId);
  void replaceTags(const std::string& itemId, const std::vector<std::string>& tags);
  std::unordered_map<std::string, std::vector<std::string>> loadTags(const std::optional<std::string>& itemId);
  std::unordered_map<std::string, double> loadProgress(const std::optional<std::string>& itemId);
  int changes();

  db::Database& db_;
};

}  // namespace rancha
