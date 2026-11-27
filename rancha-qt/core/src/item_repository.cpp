// Port of src/main/db/itemRepository.ts (plus pathKey.ts and shared/protectedSections.ts).
// The SQL and the error texts are copied from the TypeScript code on purpose.
#include "rancha/item_repository.h"

#include <sqlite3.h>

#include <algorithm>
#include <array>
#include <cstdio>
#include <random>
#include <variant>

namespace rancha {

using db::Error;
using db::Statement;

namespace {

constexpr const char* kColumns =
    "id, parent_id, kind, name, description, target, cover_path, wallpaper_file, emulator, core, hue, "
    "sort_order, is_favorite, is_done, created_at, last_opened_at";

// "Everything inside this item": the item, its children, their children...
constexpr const char* kSubtree =
    "WITH RECURSIVE subtree(id) AS ("
    " SELECT id FROM items WHERE id = ?"
    " UNION ALL"
    " SELECT i.id FROM items i JOIN subtree s ON i.parent_id = s.id"
    ")";

constexpr std::array<const char*, 5> kProtectedSections = {"games", "reading", "video", "apps", "music"};

const char* const kGone = "This item no longer exists.";

/// The ids without duplicates, in the order first given (as [...new Set(ids)]).
std::vector<std::string> unique(const std::vector<std::string>& ids) {
  std::vector<std::string> out;
  std::unordered_set<std::string> seen;
  for (const auto& id : ids)
    if (seen.insert(id).second) out.push_back(id);
  return out;
}

/// Decodes UTF-8 into code points (a broken byte counts as itself, so nothing is lost).
std::vector<char32_t> codePoints(std::string_view text) {
  std::vector<char32_t> out;
  for (std::size_t i = 0; i < text.size();) {
    const auto c = static_cast<unsigned char>(text[i]);
    int extra = c >= 0xF0 ? 3 : c >= 0xE0 ? 2 : c >= 0xC0 ? 1 : 0;
    char32_t cp = extra == 3 ? (c & 0x07) : extra == 2 ? (c & 0x0F) : extra == 1 ? (c & 0x1F) : c;
    if (c >= 0x80 && c < 0xC0) extra = 0;
    bool ok = i + extra < text.size() || extra == 0;
    for (int k = 1; ok && k <= extra; ++k) {
      const auto next = static_cast<unsigned char>(text[i + k]);
      if ((next & 0xC0) != 0x80) ok = false;
      else cp = (cp << 6) | (next & 0x3F);
    }
    if (!ok) {
      cp = c;
      extra = 0;
    }
    out.push_back(cp);
    i += 1 + extra;
  }
  return out;
}

Item readItem(Statement& row) {
  Item item;
  item.id = row.text(0);
  item.parentId = row.optionalText(1);
  item.kind = itemKindFromString(row.text(2));
  item.name = row.text(3);
  item.description = row.text(4);
  item.target = row.optionalText(5);
  item.coverFile = row.optionalText(6);
  item.wallpaperFile = row.optionalText(7);
  item.emulator = row.optionalText(8);
  item.core = row.optionalText(9);
  item.hue = static_cast<int>(row.integer(10));
  item.sortOrder = static_cast<int>(row.integer(11));
  item.isFavorite = row.integer(12) == 1;
  item.isDone = row.integer(13) == 1;
  item.createdAt = row.integer(14);
  item.lastOpenedAt = row.optionalInteger(15);
  return item;
}

void finish(Item& item, std::unordered_map<std::string, std::vector<std::string>>& tags,
            const std::unordered_map<std::string, double>& progress) {
  if (auto found = tags.find(item.id); found != tags.end()) item.tags = std::move(found->second);
  if (!item.isDone)
    if (auto found = progress.find(item.id); found != progress.end()) item.progress = found->second;
}

}  // namespace

// ------------------------------------------------------------------ helpers without a database

int hueFromName(std::string_view name) {
  long long hue = 0;
  for (const char32_t cp : codePoints(name)) hue = (hue * 31 + static_cast<long long>(cp)) % 360;
  return static_cast<int>(hue);
}

bool isProtectedSection(std::string_view id, const std::optional<std::string>& parentId) {
  if (parentId) return false;
  return std::find(kProtectedSections.begin(), kProtectedSections.end(), id) != kProtectedSections.end();
}

std::string pathKey(std::string_view path, bool windows) {
  std::string key(path);
  if (windows)
    for (char& c : key)
      if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
  return key;
}

std::string randomUuid() {
  static thread_local std::mt19937_64 engine([] {
    std::random_device device;
    std::seed_seq seed{device(), device(), device(), device(), device(), device(), device(), device()};
    return std::mt19937_64(seed);
  }());
  std::array<unsigned char, 16> bytes{};
  for (std::size_t i = 0; i < bytes.size(); i += 8) {
    const std::uint64_t value = engine();
    for (std::size_t k = 0; k < 8; ++k) bytes[i + k] = static_cast<unsigned char>(value >> (8 * k));
  }
  bytes[6] = static_cast<unsigned char>((bytes[6] & 0x0F) | 0x40);  // version 4
  bytes[8] = static_cast<unsigned char>((bytes[8] & 0x3F) | 0x80);  // RFC 4122 variant
  char text[37];
  std::snprintf(text, sizeof text, "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x", bytes[0],
                bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7], bytes[8], bytes[9], bytes[10],
                bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]);
  return text;
}

// ------------------------------------------------------------------ private helpers

template <class Work>
void ItemRepository::transaction(Work&& work) {
  db_.exec("BEGIN");
  try {
    work();
    db_.exec("COMMIT");
  } catch (...) {
    db_.exec("ROLLBACK");
    throw;
  }
}

int ItemRepository::changes() { return sqlite3_changes(db_.handle()); }

void ItemRepository::assertValidParent(const std::optional<std::string>& parentId) {
  if (!parentId) return;
  auto query = db_.prepare("SELECT kind FROM items WHERE id = ?");
  query.bind(1, *parentId);
  if (!query.step()) throw Error("The destination folder no longer exists.");
  if (query.text(0) != "collection") throw Error("Items can only be placed inside collections.");
}

bool ItemRepository::isInside(const std::string& rootId, const std::string& candidateId) {
  auto query = db_.prepare(std::string(kSubtree) + " SELECT 1 AS found FROM subtree WHERE id = ?");
  query.bind(1, rootId).bind(2, candidateId);
  return query.step();
}

bool ItemRepository::exists(const std::string& id) {
  auto query = db_.prepare("SELECT 1 AS found FROM items WHERE id = ?");
  query.bind(1, id);
  return query.step();
}

std::int64_t ItemRepository::nextSortOrder(const std::optional<std::string>& parentId) {
  auto query = db_.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM items WHERE parent_id IS ?");
  query.bind(1, parentId);
  query.step();
  return query.integer(0);
}

void ItemRepository::replaceTags(const std::string& itemId, const std::vector<std::string>& tags) {
  db_.prepare("DELETE FROM item_tags WHERE item_id = ?").bind(1, itemId).run();
  auto insert = db_.prepare("INSERT INTO item_tags (item_id, tag) VALUES (?, ?)");
  for (const auto& tag : tags) insert.bind(1, itemId).bind(2, tag).run();
}

std::unordered_map<std::string, std::vector<std::string>> ItemRepository::loadTags(
    const std::optional<std::string>& itemId) {
  auto query = itemId ? db_.prepare("SELECT item_id, tag FROM item_tags WHERE item_id = ? ORDER BY tag COLLATE NOCASE")
                      : db_.prepare("SELECT item_id, tag FROM item_tags ORDER BY tag COLLATE NOCASE");
  if (itemId) query.bind(1, *itemId);
  std::unordered_map<std::string, std::vector<std::string>> byItem;
  while (query.step()) byItem[query.text(0)].push_back(query.text(1));
  return byItem;
}

std::unordered_map<std::string, double> ItemRepository::loadProgress(const std::optional<std::string>& itemId) {
  auto query = itemId ? db_.prepare("SELECT item_id, page, page_count FROM reading_progress WHERE item_id = ?")
                      : db_.prepare("SELECT item_id, page, page_count FROM reading_progress");
  if (itemId) query.bind(1, *itemId);
  std::unordered_map<std::string, double> map;
  while (query.step()) {
    const auto page = query.integer(1);
    const auto count = query.integer(2);
    if (page > 0 && count > 1)
      map[query.text(0)] = std::min(1.0, static_cast<double>(page + 1) / static_cast<double>(count));
  }
  return map;
}

// ------------------------------------------------------------------ reading

std::vector<Item> ItemRepository::listItems() {
  auto query = db_.prepare(std::string("SELECT ") + kColumns + " FROM items ORDER BY sort_order, created_at");
  std::vector<Item> items;
  while (query.step()) items.push_back(readItem(query));
  auto tags = loadTags({});
  const auto progress = loadProgress({});
  for (auto& item : items) finish(item, tags, progress);
  return items;
}

std::optional<Item> ItemRepository::getItem(const std::string& id) {
  auto query = db_.prepare(std::string("SELECT ") + kColumns + " FROM items WHERE id = ?");
  query.bind(1, id);
  if (!query.step()) return std::nullopt;
  Item item = readItem(query);
  auto tags = loadTags(id);
  finish(item, tags, loadProgress(id));
  return item;
}

std::vector<std::string> ItemRepository::listCoverFiles() {
  auto query = db_.prepare(
      "SELECT cover_path AS name FROM items WHERE cover_path IS NOT NULL "
      "UNION SELECT wallpaper_file FROM items WHERE wallpaper_file IS NOT NULL");
  std::vector<std::string> names;
  while (query.step()) names.push_back(query.text(0));
  return names;
}

std::unordered_set<std::string> ItemRepository::existingTargets() {
  auto query = db_.prepare("SELECT target FROM items WHERE target IS NOT NULL AND target <> ''");
  std::unordered_set<std::string> keys;
  while (query.step()) keys.insert(pathKey(query.text(0)));
  return keys;
}

int ItemRepository::countItems() {
  auto query = db_.prepare("SELECT count(*) AS n FROM items");
  query.step();
  return static_cast<int>(query.integer(0));
}

std::optional<ReadingState> ItemRepository::getReadingState(const std::string& itemId) {
  auto query = db_.prepare("SELECT page, page_count, direction FROM reading_progress WHERE item_id = ?");
  query.bind(1, itemId);
  if (!query.step()) return std::nullopt;
  return ReadingState{static_cast<int>(query.integer(0)), static_cast<int>(query.integer(1)),
                      query.text(2) == "rtl" ? "rtl" : "ltr"};
}

// ------------------------------------------------------------------ changing

std::string ItemRepository::insertItem(const NewItem& input) {
  const std::string id = randomUuid();
  const std::int64_t now = db::nowMs();
  auto insert = db_.prepare(
      "INSERT INTO items (id, parent_id, kind, name, description, target, cover_path, wallpaper_file, emulator, core, "
      "hue, sort_order, is_favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)");
  insert.bind(1, id)
      .bind(2, input.parentId)
      .bind(3, toString(input.kind))
      .bind(4, input.name)
      .bind(5, input.description)
      .bind(6, input.target)
      .bind(7, input.coverFile)
      .bind(8, input.wallpaperFile)
      .bind(9, input.emulator)
      .bind(10, input.core)
      .bind(11, input.hue ? *input.hue : hueFromName(input.name))
      .bind(12, nextSortOrder(input.parentId))
      .bind(13, now)
      .bind(14, now)
      .run();
  replaceTags(id, input.tags);
  return id;
}

Item ItemRepository::createItem(const NewItem& input) {
  std::string id;
  transaction([&] {
    assertValidParent(input.parentId);
    id = insertItem(input);
  });
  return *getItem(id);
}

TreeImportResult ItemRepository::importTree(const std::optional<std::string>& parentId,
                                            const std::vector<ImportNode>& nodes) {
  TreeImportResult result;
  auto known = existingTargets();
  auto add = [&](auto& self, const std::optional<std::string>& parent, const std::vector<ImportNode>& list) -> void {
    for (const auto& node : list) {
      if (node.kind == ItemKind::Collection) {
        if (node.children.empty()) continue;
        const int before = result.added;
        NewItem folder;
        folder.parentId = parent;
        folder.kind = ItemKind::Collection;
        folder.name = node.name;
        const std::string id = insertItem(folder);
        self(self, id, node.children);
        if (result.added == before) {
          // Everything inside was a duplicate: undo this empty collection.
          db_.prepare("DELETE FROM items WHERE id = ?").bind(1, id).run();
        } else {
          result.collections += 1;
        }
      } else {
        const std::string key = pathKey(node.target.value_or(""));
        if (!key.empty() && known.count(key)) {
          result.duplicates += 1;
          continue;
        }
        known.insert(key);
        NewItem item;
        item.parentId = parent;
        item.kind = node.kind;
        item.name = node.name;
        item.target = node.target;
        item.emulator = node.emulator;
        item.core = node.core;
        insertItem(item);
        result.added += 1;
      }
    }
  };
  transaction([&] {
    assertValidParent(parentId);
    add(add, parentId, nodes);
  });
  return result;
}

UpdateResult ItemRepository::updateItem(const std::string& id, const ItemPatch& patch) {
  UpdateResult out;
  transaction([&] {
    auto existing = db_.prepare("SELECT cover_path, wallpaper_file FROM items WHERE id = ?");
    existing.bind(1, id);
    if (!existing.step()) throw Error(kGone);
    const Nullable oldCover = existing.optionalText(0);
    const Nullable oldWallpaper = existing.optionalText(1);

    using Value = std::variant<std::monostate, std::string, std::int64_t>;
    std::vector<std::string> assignments;
    std::vector<Value> values;
    auto set = [&](const char* column, Value value) {
      assignments.push_back(std::string(column) + " = ?");
      values.push_back(std::move(value));
    };
    auto setNullable = [&](const char* column, const Change& change) {
      if (change) set(column, *change ? Value(**change) : Value());
    };
    if (patch.name) set("name", *patch.name);
    setNullable("description", patch.description);
    setNullable("target", patch.target);
    if (patch.hue) set("hue", static_cast<std::int64_t>(*patch.hue));
    setNullable("cover_path", patch.coverFile);
    setNullable("wallpaper_file", patch.wallpaperFile);
    setNullable("emulator", patch.emulator);
    setNullable("core", patch.core);
    set("updated_at", db::nowMs());

    std::string sql = "UPDATE items SET ";
    for (std::size_t i = 0; i < assignments.size(); ++i) sql += (i ? ", " : "") + assignments[i];
    sql += " WHERE id = ?";
    auto update = db_.prepare(sql);
    int position = 1;
    for (const auto& value : values) {
      if (const auto* text = std::get_if<std::string>(&value)) update.bind(position, *text);
      else if (const auto* number = std::get_if<std::int64_t>(&value)) update.bind(position, *number);
      else update.bindNull(position);
      ++position;
    }
    update.bind(position, id).run();
    if (patch.tags) replaceTags(id, *patch.tags);

    if (patch.coverFile && oldCover && oldCover != *patch.coverFile) out.removedCover = oldCover;
    if (patch.wallpaperFile && oldWallpaper && oldWallpaper != *patch.wallpaperFile) out.removedWallpaper = oldWallpaper;
  });
  out.item = *getItem(id);
  return out;
}

void ItemRepository::setFavorite(const std::string& id, bool value) {
  db_.prepare("UPDATE items SET is_favorite = ?, updated_at = ? WHERE id = ?")
      .bind(1, value ? 1 : 0)
      .bind(2, db::nowMs())
      .bind(3, id)
      .run();
  if (changes() == 0) throw Error(kGone);
}

void ItemRepository::snapshotTo(const std::string& filePath) {
  db_.prepare("VACUUM INTO ?").bind(1, filePath).run();
}

void ItemRepository::saveReadingState(const std::string& itemId, const ReadingState& state, std::int64_t now) {
  if (!exists(itemId)) return;
  db_.prepare(
         "INSERT INTO reading_progress (item_id, page, page_count, direction, updated_at) VALUES (?, ?, ?, ?, ?) "
         "ON CONFLICT(item_id) DO UPDATE SET page = excluded.page, page_count = excluded.page_count, "
         "direction = excluded.direction, updated_at = excluded.updated_at")
      .bind(1, itemId)
      .bind(2, state.page)
      .bind(3, state.pageCount)
      .bind(4, state.direction == "rtl" ? "rtl" : "ltr")
      .bind(5, now)
      .run();
  // Reading to the last page counts as finished (it can be un-marked by hand).
  if (state.pageCount > 0 && state.page >= state.pageCount - 1)
    db_.prepare("UPDATE items SET is_done = 1, updated_at = ? WHERE id = ? AND is_done = 0").bind(1, now).bind(2, itemId).run();
}

void ItemRepository::convertToChapters(const std::string& id, const std::vector<Chapter>& chapters, int resumePage,
                                       const std::string& resumeDirection,
                                       const std::optional<std::string>& keepCover) {
  transaction([&] {
    const auto item = getItem(id);
    if (!item || item->kind != ItemKind::Readable) throw Error("This item can no longer be turned into chapters.");
    const bool wasDone = item->isDone;
    db_.prepare("UPDATE items SET kind = 'collection', target = NULL, updated_at = ? WHERE id = ?")
        .bind(1, db::nowMs())
        .bind(2, id)
        .run();
    // A collection has no automatic first-page cover, so the picture it was showing becomes its own cover.
    if (keepCover && !keepCover->empty() && !item->coverFile)
      db_.prepare("UPDATE items SET cover_path = ? WHERE id = ?").bind(1, *keepCover).bind(2, id).run();
    db_.prepare("DELETE FROM reading_progress WHERE item_id = ?").bind(1, id).run();
    for (const auto& chapter : chapters) {
      NewItem child;
      child.parentId = id;
      child.kind = ItemKind::Readable;
      child.name = chapter.name;
      child.target = chapter.target;
      const std::string childId = insertItem(child);
      const int end = chapter.start + chapter.count;
      if (wasDone || (resumePage > 0 && resumePage >= end)) {
        db_.prepare("UPDATE items SET is_done = 1 WHERE id = ?").bind(1, childId).run();
      } else if (resumePage > chapter.start && resumePage < end) {
        saveReadingState(childId, ReadingState{resumePage - chapter.start, chapter.count, resumeDirection});
      }
    }
  });
}

std::int64_t ItemRepository::markOpened(const std::string& id, std::int64_t now) {
  db_.prepare("UPDATE items SET last_opened_at = ? WHERE id = ?").bind(1, now).bind(2, id).run();
  if (changes() == 0) throw Error(kGone);
  return now;
}

std::vector<std::string> ItemRepository::deleteItem(const std::string& id) {
  std::vector<std::string> covers;
  transaction([&] { covers = deleteUnchecked(id); });
  return covers;
}

std::vector<std::string> ItemRepository::deleteUnchecked(const std::string& id) {
  auto head = db_.prepare("SELECT name, parent_id FROM items WHERE id = ?");
  head.bind(1, id);
  if (head.step() && isProtectedSection(id, head.optionalText(1))) {
    throw Error("\xe2\x80\x9c" + head.text(0) +
                "\xe2\x80\x9d is one of the four main sections and cannot be deleted. You can delete the items inside "
                "it instead.");
  }
  auto rows = db_.prepare(std::string(kSubtree) +
                          " SELECT i.cover_path, i.wallpaper_file FROM items i JOIN subtree s ON i.id = s.id");
  rows.bind(1, id);
  bool any = false;
  std::vector<std::string> covers;
  while (rows.step()) {
    any = true;
    if (auto cover = rows.optionalText(0)) covers.push_back(*cover);
    if (auto wallpaper = rows.optionalText(1)) covers.push_back(*wallpaper);
  }
  if (!any) throw Error(kGone);
  // Children and tags are removed automatically (ON DELETE CASCADE).
  db_.prepare("DELETE FROM items WHERE id = ?").bind(1, id).run();
  return covers;
}

void ItemRepository::moveItem(const std::string& id, const std::optional<std::string>& newParentId) {
  transaction([&] { moveUnchecked(id, newParentId); });
}

bool ItemRepository::moveUnchecked(const std::string& id, const std::optional<std::string>& newParentId) {
  auto row = db_.prepare("SELECT parent_id FROM items WHERE id = ?");
  row.bind(1, id);
  if (!row.step()) throw Error(kGone);
  const auto parent = row.optionalText(0);
  if (newParentId && isProtectedSection(id, parent))
    throw Error(
        "The main sections (Games, Reading, Video, Applications) stay at the top level and cannot be moved into "
        "another collection.");
  if (newParentId == id) throw Error("A collection cannot be moved into itself.");
  assertValidParent(newParentId);
  if (newParentId && isInside(id, *newParentId))
    throw Error("A collection cannot be moved into one of its own sub-collections.");
  if (parent == newParentId) return false;  // already there
  db_.prepare("UPDATE items SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?")
      .bind(1, newParentId)
      .bind(2, nextSortOrder(newParentId))
      .bind(3, db::nowMs())
      .bind(4, id)
      .run();
  return true;
}

// ------------------------------------------------------------------ several at once

std::vector<std::string> ItemRepository::outermost(const std::vector<std::string>& ids) {
  const auto list = unique(ids);
  const std::unordered_set<std::string> wanted(list.begin(), list.end());
  auto parentOf = db_.prepare("SELECT parent_id FROM items WHERE id = ?");
  // id -> parent; an empty outer optional means "unknown item".
  std::unordered_map<std::string, std::optional<Nullable>> cache;
  auto parentIdOf = [&](const std::string& id) -> std::optional<Nullable> {
    auto found = cache.find(id);
    if (found != cache.end()) return found->second;
    parentOf.bind(1, id);
    std::optional<Nullable> value;
    if (parentOf.step()) value = parentOf.optionalText(0);
    parentOf.reset();
    cache.emplace(id, value);
    return value;
  };
  std::vector<std::string> out;
  for (const auto& id : list) {
    std::unordered_set<std::string> seen{id};
    auto parent = parentIdOf(id);
    bool inside = false;
    while (parent && *parent && !seen.count(**parent)) {
      if (wanted.count(**parent)) {
        inside = true;
        break;
      }
      seen.insert(**parent);
      parent = parentIdOf(**parent);
    }
    if (!inside) out.push_back(id);
  }
  return out;
}

int ItemRepository::setFavoriteMany(const std::vector<std::string>& ids, bool value) {
  int changed = 0;
  transaction([&] {
    auto update = db_.prepare("UPDATE items SET is_favorite = ?, updated_at = ? WHERE id = ?");
    for (const auto& id : unique(ids)) {
      update.bind(1, value ? 1 : 0).bind(2, db::nowMs()).bind(3, id).run();
      changed += changes();
    }
  });
  return changed;
}

std::unordered_set<std::string> ItemRepository::leavesOf(const std::vector<std::string>& ids) {
  // One query for the whole library, then walk the tree in memory (fast even for thousands of items).
  auto query = db_.prepare("SELECT id, parent_id, kind FROM items");
  std::unordered_map<std::string, bool> isCollection;
  std::unordered_map<std::string, std::vector<std::string>> childrenOf;
  while (query.step()) {
    const std::string id = query.text(0);
    isCollection[id] = query.text(2) == "collection";
    if (auto parent = query.optionalText(1)) childrenOf[*parent].push_back(id);
  }
  std::unordered_set<std::string> leaves;
  std::vector<std::string> pending;
  for (const auto& id : unique(ids))
    if (isCollection.count(id)) pending.push_back(id);
  while (!pending.empty()) {
    const std::string id = pending.back();
    pending.pop_back();
    if (isCollection[id]) {
      const auto& children = childrenOf[id];
      pending.insert(pending.end(), children.begin(), children.end());
    } else {
      leaves.insert(id);
    }
  }
  return leaves;
}

int ItemRepository::setDoneMany(const std::vector<std::string>& ids, bool value) {
  int changed = 0;
  transaction([&] {
    const auto leaves = leavesOf(ids);
    auto update = db_.prepare("UPDATE items SET is_done = ?, updated_at = ? WHERE id = ? AND is_done != ?");
    const int flag = value ? 1 : 0;
    for (const auto& id : leaves) {
      update.bind(1, flag).bind(2, db::nowMs()).bind(3, id).bind(4, flag).run();
      changed += changes();
    }
  });
  return changed;
}

int ItemRepository::addTagMany(const std::vector<std::string>& ids, const std::string& tag) {
  int changed = 0;
  transaction([&] {
    auto has = db_.prepare("SELECT 1 AS found FROM item_tags WHERE item_id = ? AND lower(tag) = lower(?)");
    auto insert = db_.prepare("INSERT INTO item_tags (item_id, tag) VALUES (?, ?)");
    for (const auto& id : unique(ids)) {
      if (!exists(id)) continue;
      has.bind(1, id).bind(2, tag);
      const bool found = has.step();
      has.reset();
      if (found) continue;
      insert.bind(1, id).bind(2, tag).run();
      changed += 1;
    }
  });
  return changed;
}

int ItemRepository::removeTagMany(const std::vector<std::string>& ids, const std::string& tag) {
  int changed = 0;
  transaction([&] {
    auto remove = db_.prepare("DELETE FROM item_tags WHERE item_id = ? AND lower(tag) = lower(?)");
    for (const auto& id : unique(ids)) {
      remove.bind(1, id).bind(2, tag).run();
      changed += changes();
    }
  });
  return changed;
}

int ItemRepository::moveMany(const std::vector<std::string>& ids, const std::optional<std::string>& newParentId) {
  int moved = 0;
  transaction([&] {
    assertValidParent(newParentId);
    for (const auto& id : outermost(ids)) {
      if (!exists(id)) continue;
      if (moveUnchecked(id, newParentId)) moved += 1;
    }
  });
  return moved;
}

DeleteResult ItemRepository::deleteMany(const std::vector<std::string>& ids) {
  DeleteResult result;
  transaction([&] {
    for (const auto& id : outermost(ids)) {
      if (!exists(id)) continue;
      auto covers = deleteUnchecked(id);
      result.covers.insert(result.covers.end(), covers.begin(), covers.end());
      result.deleted += 1;
    }
  });
  return result;
}

void ItemRepository::moveWithinFolder(const std::string& id, ReorderDirection direction) {
  transaction([&] {
    auto row = db_.prepare("SELECT parent_id FROM items WHERE id = ?");
    row.bind(1, id);
    if (!row.step()) throw Error(kGone);
    const auto parent = row.optionalText(0);

    auto query = db_.prepare("SELECT id FROM items WHERE parent_id IS ? ORDER BY sort_order, created_at, id");
    query.bind(1, parent);
    std::vector<std::string> siblings;
    while (query.step()) siblings.push_back(query.text(0));
    const auto at = std::find(siblings.begin(), siblings.end(), id);
    if (at == siblings.end()) return;
    const auto index = static_cast<long>(at - siblings.begin());
    const long other = index + (direction == ReorderDirection::Earlier ? -1 : 1);
    if (other < 0 || other >= static_cast<long>(siblings.size())) return;  // already first or last
    std::swap(siblings[static_cast<std::size_t>(index)], siblings[static_cast<std::size_t>(other)]);

    // Renumber 1..n so positions are always clean and unique.
    auto update = db_.prepare("UPDATE items SET sort_order = ? WHERE id = ?");
    for (std::size_t position = 0; position < siblings.size(); ++position)
      update.bind(1, static_cast<std::int64_t>(position + 1)).bind(2, siblings[position]).run();
  });
}

int ItemRepository::placeMany(const std::vector<std::string>& ids, const std::optional<std::string>& beforeId) {
  const auto list = unique(ids);
  if (list.empty()) return 0;
  int moved = 0;
  transaction([&] {
    std::unordered_map<std::string, Nullable> parents;
    auto parentOf = db_.prepare("SELECT parent_id FROM items WHERE id = ?");
    auto look = [&](const std::string& id) {
      parentOf.bind(1, id);
      if (!parentOf.step()) throw Error(kGone);
      parents[id] = parentOf.optionalText(0);
      parentOf.reset();
    };
    for (const auto& id : list) look(id);
    if (beforeId) look(*beforeId);
    const Nullable parent = parents[list.front()];
    for (const auto& id : list)
      if (parents[id] != parent) throw Error("These items are not in the same folder.");
    if (beforeId) {
      if (std::find(list.begin(), list.end(), *beforeId) != list.end())
        throw Error("An item cannot be placed before itself.");
      if (parents[*beforeId] != parent) throw Error("That position is in a different folder.");
    }

    auto query = db_.prepare("SELECT id FROM items WHERE parent_id IS ? ORDER BY sort_order, created_at, id");
    query.bind(1, parent);
    std::vector<std::string> siblings;
    while (query.step()) siblings.push_back(query.text(0));
    const std::unordered_set<std::string> chosen(list.begin(), list.end());
    std::vector<std::string> block;
    for (const auto& id : list)
      if (std::find(siblings.begin(), siblings.end(), id) != siblings.end()) block.push_back(id);
    std::vector<std::string> rest;
    for (const auto& id : siblings)
      if (!chosen.count(id)) rest.push_back(id);
    const auto at = beforeId ? std::find(rest.begin(), rest.end(), *beforeId) : rest.end();
    rest.insert(at, block.begin(), block.end());
    if (rest != siblings) moved = static_cast<int>(block.size());
    auto update = db_.prepare("UPDATE items SET sort_order = ? WHERE id = ?");
    for (std::size_t position = 0; position < rest.size(); ++position)
      update.bind(1, static_cast<std::int64_t>(position + 1)).bind(2, rest[position]).run();
  });
  return moved;
}

}  // namespace rancha
