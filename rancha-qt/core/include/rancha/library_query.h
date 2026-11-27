#pragma once
// SEARCH, FILTERS AND SORTING: the "brain" behind the search box, the tag filter, the type
// filter, "All items", "Favorites" and "Recent".
//
// Port of the Electron app's src/renderer/src/lib/libraryQuery.ts. Plain functions over a list
// of items, no screen code, so they are tested on their own.
//
// Known difference: lower-casing folds ASCII letters only (JavaScript's toLowerCase folds every
// script). Persian and Arabic have no case, so for them the result is the same.
#include <cstddef>
#include <functional>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#include "rancha/item.h"
#include "rancha/library_view.h"

namespace rancha {

struct Filters {
  std::vector<ItemKind> kinds;  // empty = any type (collections are never in this list)
  bool favoritesOnly = false;
  std::vector<std::string> tags;  // an item must have ALL of these (case-insensitive)
};

bool hasFilters(const Filters& filters);

/// Item id -> position in the list.
using ItemIndex = std::unordered_map<std::string, std::size_t>;
ItemIndex indexById(const std::vector<Item>& items);

/// The folders above an item, from the top level down to its direct parent (positions in `items`).
std::vector<std::size_t> ancestorsOf(const std::vector<Item>& items, const ItemIndex& byId, std::size_t item);
/// Where an item lives, as text: "Video › Anime". Top-level items say "Home".
std::string locationOf(const std::vector<Item>& items, const ItemIndex& byId, std::size_t item);
/// True if the item is somewhere below the folder (at any depth).
bool isInsideFolder(const std::vector<Item>& items, const ItemIndex& byId, std::size_t item, std::string_view folderId);

/// ASCII lower case (see the note at the top).
std::string lowerAscii(std::string_view text);
/// Splits what the user typed into lower-case words. "Dark  Souls" -> {"dark", "souls"}.
std::vector<std::string> splitWords(std::string_view query);

/// What a song's own tags add to the search: its title, and its artist / album / genre.
struct SongText {
  std::string title;
  std::string extra;
};

struct QueryResult {
  std::size_t item;  // position in `items`
  int score = 0;     // higher = better match (0 when there is no search text)
};

struct QueryInput {
  const std::vector<Item>* items = nullptr;
  const ItemIndex* byId = nullptr;
  std::string query;
  Filters filters;
  std::optional<std::string> scopeFolderId;  // none = the whole library
  std::function<std::optional<SongText>(const std::string& id)> songText;  // optional
};

/// The items matching ALL search words (in the name, tags, description or folder names) and the
/// filters, inside the scope. Best matches first; equal scores by name.
std::vector<QueryResult> runQuery(const QueryInput& input);

/// Sorts item positions. Folders come first for the name and type sorts; the custom order mixes them.
std::vector<std::size_t> sortItems(const std::vector<Item>& items, std::vector<std::size_t> list, SortMode sort);
/// Orders flattened results (search, "All items", filters): custom order means best match when
/// searching, otherwise by name.
std::vector<std::size_t> sortResults(const std::vector<Item>& items, const std::vector<QueryResult>& results,
                                     SortMode sort, bool searching);

struct TagCount {
  std::string tag;  // the spelling of the first item that has it
  int count = 0;
  bool operator==(const TagCount&) const = default;
};
/// Every tag in the library with how many items have it (case-insensitive), most used first.
std::vector<TagCount> collectTags(const std::vector<Item>& items);

// ---- the list on screen (App.tsx: "Decide which items to show")

enum class ViewType { Folder, All, Recent, Favorites };

struct ViewRequest {
  ViewType type = ViewType::Folder;
  std::optional<std::string> folderId;  // Folder view: none = Home (the top level)
  std::string query;                    // what is typed in the search box
  Filters filters;
  SortMode sort = SortMode::Custom;
  bool searchHere = true;  // search only inside the open folder ("here") or the whole library
  std::function<std::optional<SongText>(const std::string& id)> songText;  // optional
};

struct ViewResult {
  std::string title;               // "Home", "All items", "Search results for “x” in Video"...
  std::vector<std::size_t> items;  // positions in `items`, in display order
  bool flat = false;               // true = a list of matches from many folders (show where each lives)
};

/// Plain browsing shows one folder; a search, a filter, All items, Favorites and Recent show a
/// flat list of matches. "Recent" in custom order means most recently opened first.
ViewResult buildView(const std::vector<Item>& items, const ItemIndex& byId, const ViewRequest& request);

}  // namespace rancha
