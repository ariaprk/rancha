// Port of src/renderer/src/lib/libraryQuery.ts and the "Decide which items to show" part of App.tsx.
#include "rancha/library_query.h"

#include <algorithm>
#include <unordered_set>

#include "rancha/natural_compare.h"

namespace rancha {

namespace {

bool isSpace(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v'; }

// The separators of /[\s\-_:.,]+/ in nameScore.
bool isWordBreak(char c) { return isSpace(c) || c == '-' || c == '_' || c == ':' || c == '.' || c == ',' ; }

bool startsWith(std::string_view text, std::string_view head) {
  return text.size() >= head.size() && text.compare(0, head.size(), head) == 0;
}

bool contains(std::string_view text, std::string_view part) { return text.find(part) != std::string_view::npos; }

int nameScore(std::string_view word, std::string_view name) {
  if (name == word) return 100;
  if (startsWith(name, word)) return 80;
  std::size_t i = 0;
  while (i <= name.size()) {
    std::size_t end = i;
    while (end < name.size() && !isWordBreak(name[end])) ++end;
    if (startsWith(name.substr(i, end - i), word)) return 60;
    if (end >= name.size()) break;
    i = end;
    while (i < name.size() && isWordBreak(name[i])) ++i;
  }
  if (contains(name, word)) return 40;
  return 0;
}

int scoreWord(std::string_view word, const Item& item, std::string_view folderNames, const std::optional<SongText>& song) {
  int best = nameScore(word, lowerAscii(item.name));
  if (song && !song->title.empty()) best = std::max(best, nameScore(word, lowerAscii(song->title)));
  if (song && !song->extra.empty() && contains(lowerAscii(song->extra), word)) best = std::max(best, 30);

  bool exact = false;
  bool partial = false;
  for (const auto& tag : item.tags) {
    const std::string lower = lowerAscii(tag);
    if (lower == word) exact = true;
    else if (contains(lower, word)) partial = true;
  }
  if (exact) best = std::max(best, 35);
  else if (partial) best = std::max(best, 25);

  if (contains(folderNames, word)) best = std::max(best, 15);
  if (contains(lowerAscii(item.description), word)) best = std::max(best, 8);
  return best;
}

bool matchesFilters(const Item& item, const Filters& filters) {
  if (!filters.kinds.empty() && std::find(filters.kinds.begin(), filters.kinds.end(), item.kind) == filters.kinds.end())
    return false;
  if (filters.favoritesOnly && !item.isFavorite) return false;
  if (!filters.tags.empty()) {
    std::unordered_set<std::string> have;
    for (const auto& tag : item.tags) have.insert(lowerAscii(tag));
    for (const auto& tag : filters.tags)
      if (!have.count(lowerAscii(tag))) return false;
  }
  return true;
}

int kindOrder(ItemKind kind) {
  switch (kind) {
    case ItemKind::Collection: return 0;
    case ItemKind::Launchable: return 1;
    case ItemKind::Video: return 2;
    case ItemKind::Readable: return 3;
    case ItemKind::Audio: return 4;
  }
  return 0;
}

int byName(const Item& a, const Item& b) { return naturalCompare(a.name, b.name); }

}  // namespace

bool hasFilters(const Filters& filters) {
  return !filters.kinds.empty() || filters.favoritesOnly || !filters.tags.empty();
}

ItemIndex indexById(const std::vector<Item>& items) {
  ItemIndex byId;
  byId.reserve(items.size());
  for (std::size_t i = 0; i < items.size(); ++i) byId.emplace(items[i].id, i);
  return byId;
}

std::vector<std::size_t> ancestorsOf(const std::vector<Item>& items, const ItemIndex& byId, std::size_t item) {
  std::vector<std::size_t> chain;
  std::unordered_set<std::string> seen{items[item].id};  // protects against a damaged (looping) tree
  auto parentOf = [&](std::size_t at) -> std::optional<std::size_t> {
    const auto& parentId = items[at].parentId;
    if (!parentId) return std::nullopt;
    const auto found = byId.find(*parentId);
    if (found == byId.end()) return std::nullopt;
    return found->second;
  };
  auto parent = parentOf(item);
  while (parent && !seen.count(items[*parent].id)) {
    chain.push_back(*parent);
    seen.insert(items[*parent].id);
    parent = parentOf(*parent);
  }
  std::reverse(chain.begin(), chain.end());
  return chain;
}

std::string locationOf(const std::vector<Item>& items, const ItemIndex& byId, std::size_t item) {
  const auto chain = ancestorsOf(items, byId, item);
  if (chain.empty()) return "Home";
  std::string text;
  for (std::size_t i = 0; i < chain.size(); ++i) {
    if (i) text += " \xe2\x80\xba ";  // " › "
    text += items[chain[i]].name;
  }
  return text;
}

bool isInsideFolder(const std::vector<Item>& items, const ItemIndex& byId, std::size_t item, std::string_view folderId) {
  for (const auto folder : ancestorsOf(items, byId, item))
    if (items[folder].id == folderId) return true;
  return false;
}

std::string lowerAscii(std::string_view text) {
  std::string out(text);
  for (char& c : out)
    if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
  return out;
}

std::vector<std::string> splitWords(std::string_view query) {
  const std::string lower = lowerAscii(query);
  std::vector<std::string> words;
  std::size_t i = 0;
  while (i < lower.size()) {
    while (i < lower.size() && isSpace(lower[i])) ++i;
    std::size_t end = i;
    while (end < lower.size() && !isSpace(lower[end])) ++end;
    if (end > i) words.push_back(lower.substr(i, end - i));
    i = end;
  }
  return words;
}

std::vector<QueryResult> runQuery(const QueryInput& input) {
  const auto& items = *input.items;
  const auto& byId = *input.byId;
  const auto words = splitWords(input.query);
  std::vector<QueryResult> results;
  for (std::size_t i = 0; i < items.size(); ++i) {
    const Item& item = items[i];
    if (!matchesFilters(item, input.filters)) continue;
    if (input.scopeFolderId && !isInsideFolder(items, byId, i, *input.scopeFolderId)) continue;
    if (words.empty()) {
      results.push_back({i, 0});
      continue;
    }
    std::string folderNames;
    for (const auto folder : ancestorsOf(items, byId, i)) {
      if (!folderNames.empty()) folderNames += ' ';
      folderNames += lowerAscii(items[folder].name);
    }
    std::optional<SongText> song;
    if (item.kind == ItemKind::Audio && input.songText) song = input.songText(item.id);
    int total = 0;
    bool allMatch = true;
    for (const auto& word : words) {
      const int score = scoreWord(word, item, folderNames, song);
      if (score == 0) {
        allMatch = false;
        break;
      }
      total += score;
    }
    if (allMatch) results.push_back({i, total});
  }
  std::stable_sort(results.begin(), results.end(), [&](const QueryResult& a, const QueryResult& b) {
    if (a.score != b.score) return a.score > b.score;
    return byName(items[a.item], items[b.item]) < 0;
  });
  return results;
}

std::vector<std::size_t> sortItems(const std::vector<Item>& items, std::vector<std::size_t> list, SortMode sort) {
  const bool foldersFirst = sort == SortMode::Name || sort == SortMode::NameDesc || sort == SortMode::Type;
  auto compare = [&](std::size_t left, std::size_t right) -> int {
    const Item& a = items[left];
    const Item& b = items[right];
    const bool folderA = a.kind == ItemKind::Collection;
    const bool folderB = b.kind == ItemKind::Collection;
    if (foldersFirst && folderA != folderB) return folderA ? -1 : 1;
    switch (sort) {
      case SortMode::Name: return byName(a, b);
      case SortMode::NameDesc: return byName(b, a);
      case SortMode::Added:
        if (a.createdAt != b.createdAt) return b.createdAt > a.createdAt ? 1 : -1;
        return byName(a, b);
      case SortMode::AddedOld:
        if (a.createdAt != b.createdAt) return a.createdAt > b.createdAt ? 1 : -1;
        return byName(a, b);
      case SortMode::Opened: {
        // Never-opened items go last.
        const auto l = a.lastOpenedAt.value_or(-1);
        const auto r = b.lastOpenedAt.value_or(-1);
        if (l != r) return r > l ? 1 : -1;
        return byName(a, b);
      }
      case SortMode::Type:
        if (kindOrder(a.kind) != kindOrder(b.kind)) return kindOrder(a.kind) - kindOrder(b.kind);
        return byName(a, b);
      case SortMode::Custom: return a.sortOrder - b.sortOrder;
    }
    return 0;
  };
  // JavaScript's sort is stable, so equal items keep the order they came in.
  std::stable_sort(list.begin(), list.end(), [&](std::size_t a, std::size_t b) { return compare(a, b) < 0; });
  return list;
}

std::vector<std::size_t> sortResults(const std::vector<Item>& items, const std::vector<QueryResult>& results,
                                     SortMode sort, bool searching) {
  std::vector<std::size_t> list;
  list.reserve(results.size());
  for (const auto& result : results) list.push_back(result.item);
  if (sort == SortMode::Custom) return searching ? list : sortItems(items, std::move(list), SortMode::Name);
  return sortItems(items, std::move(list), sort);
}

std::vector<TagCount> collectTags(const std::vector<Item>& items) {
  std::vector<TagCount> counts;
  std::unordered_map<std::string, std::size_t> at;  // lower-case tag -> position in counts
  for (const auto& item : items) {
    std::unordered_set<std::string> once;
    for (const auto& tag : item.tags) {
      const std::string lower = lowerAscii(tag);
      if (!once.insert(lower).second) continue;
      const auto found = at.find(lower);
      if (found != at.end()) {
        counts[found->second].count += 1;
      } else {
        at.emplace(lower, counts.size());
        counts.push_back({tag, 1});
      }
    }
  }
  std::stable_sort(counts.begin(), counts.end(), [](const TagCount& a, const TagCount& b) {
    if (a.count != b.count) return a.count > b.count;
    return naturalCompare(a.tag, b.tag) < 0;
  });
  return counts;
}

ViewResult buildView(const std::vector<Item>& items, const ItemIndex& byId, const ViewRequest& request) {
  const bool searching = !splitWords(request.query).empty();
  const bool filtering = hasFilters(request.filters);

  std::string folderName = "Home";
  if (request.type == ViewType::Folder && request.folderId) {
    const auto found = byId.find(*request.folderId);
    if (found != byId.end()) folderName = items[found->second].name;
  }

  // Plain browsing: the contents of one folder, in the chosen order.
  if (request.type == ViewType::Folder && !searching && !filtering) {
    std::vector<std::size_t> children;
    for (std::size_t i = 0; i < items.size(); ++i)
      if (items[i].parentId == request.folderId) children.push_back(i);
    // The repository lists items by sort_order, created_at; keep that as the starting order.
    return {folderName, sortItems(items, std::move(children), request.sort), false};
  }

  // Everything else is a flat list of matches.
  std::string base = "Home";
  std::vector<bool> candidate(items.size(), true);
  if (request.type == ViewType::All) {
    for (std::size_t i = 0; i < items.size(); ++i) candidate[i] = items[i].kind != ItemKind::Collection;
    base = "All items";
  } else if (request.type == ViewType::Recent) {
    for (std::size_t i = 0; i < items.size(); ++i) candidate[i] = items[i].lastOpenedAt.has_value();
    base = "Recently opened";
  } else if (request.type == ViewType::Favorites) {
    base = "Favorites";
  } else {
    base = folderName;
  }

  std::optional<std::string> scope;
  if (request.type == ViewType::Folder && request.folderId && (!searching || request.searchHere)) scope = request.folderId;
  Filters filters = request.filters;
  if (request.type == ViewType::Favorites) filters.favoritesOnly = true;

  QueryInput input;
  input.items = &items;
  input.byId = &byId;
  input.query = request.query;
  input.filters = filters;
  input.scopeFolderId = scope;
  input.songText = request.songText;
  std::vector<QueryResult> results;
  for (const auto& result : runQuery(input))
    if (candidate[result.item]) results.push_back(result);

  // The "Recent" page means most-recently-opened first unless told otherwise.
  const SortMode order = request.type == ViewType::Recent && request.sort == SortMode::Custom ? SortMode::Opened : request.sort;

  std::string title = base;
  if (searching) {
    std::string trimmed = request.query;
    while (!trimmed.empty() && isSpace(trimmed.back())) trimmed.pop_back();
    std::size_t start = 0;
    while (start < trimmed.size() && isSpace(trimmed[start])) ++start;
    title = "Search results for \xe2\x80\x9c" + trimmed.substr(start) + "\xe2\x80\x9d";
    if (scope) title += " in " + base;
  } else if (filtering) {
    title = base + " (filtered)";
  }
  return {title, sortResults(items, results, order, searching), true};
}

}  // namespace rancha
