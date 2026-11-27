#include "rancha/library_view.h"

#include <algorithm>
#include <unordered_map>
#include <unordered_set>

#include "rancha/natural_compare.h"

namespace rancha {
namespace {

int kindRank(ItemKind kind) {
  switch (kind) {
    case ItemKind::Collection: return 0;
    case ItemKind::Launchable: return 1;
    case ItemKind::Video: return 2;
    case ItemKind::Readable: return 3;
    case ItemKind::Audio: return 4;
  }
  return 9;
}

}  // namespace

const char* toString(ItemKind kind) {
  switch (kind) {
    case ItemKind::Collection: return "collection";
    case ItemKind::Launchable: return "launchable";
    case ItemKind::Video: return "video";
    case ItemKind::Readable: return "readable";
    case ItemKind::Audio: return "audio";
  }
  return "collection";
}

ItemKind itemKindFromString(std::string_view text) {
  if (text == "launchable") return ItemKind::Launchable;
  if (text == "video") return ItemKind::Video;
  if (text == "readable") return ItemKind::Readable;
  if (text == "audio") return ItemKind::Audio;
  return ItemKind::Collection;
}

SortMode sortModeFromString(std::string_view t) {
  if (t == "name") return SortMode::Name;
  if (t == "nameDesc") return SortMode::NameDesc;
  if (t == "added") return SortMode::Added;
  if (t == "addedOld") return SortMode::AddedOld;
  if (t == "opened") return SortMode::Opened;
  if (t == "type") return SortMode::Type;
  return SortMode::Custom;
}

const char* toString(SortMode m) {
  switch (m) {
    case SortMode::Custom: return "custom";
    case SortMode::Name: return "name";
    case SortMode::NameDesc: return "nameDesc";
    case SortMode::Added: return "added";
    case SortMode::AddedOld: return "addedOld";
    case SortMode::Opened: return "opened";
    case SortMode::Type: return "type";
  }
  return "custom";
}

std::vector<std::size_t> childrenOf(const std::vector<Item>& items, std::string_view parentId, SortMode mode) {
  std::vector<std::size_t> out;
  for (std::size_t i = 0; i < items.size(); ++i) {
    const auto& parent = items[i].parentId;
    if (parentId.empty() ? !parent.has_value() : (parent.has_value() && *parent == parentId)) out.push_back(i);
  }
  auto tie = [&](std::size_t a, std::size_t b) {
    if (items[a].sortOrder != items[b].sortOrder) return items[a].sortOrder < items[b].sortOrder;
    return items[a].id < items[b].id;
  };
  auto byName = [&](std::size_t a, std::size_t b) { return naturalCompare(items[a].name, items[b].name); };
  std::stable_sort(out.begin(), out.end(), [&](std::size_t a, std::size_t b) {
    switch (mode) {
      case SortMode::Custom: return tie(a, b);
      case SortMode::Name: { const int c = byName(a, b); return c != 0 ? c < 0 : tie(a, b); }
      case SortMode::NameDesc: { const int c = byName(a, b); return c != 0 ? c > 0 : tie(a, b); }
      case SortMode::Added: return items[a].createdAt != items[b].createdAt ? items[a].createdAt > items[b].createdAt : tie(a, b);
      case SortMode::AddedOld: return items[a].createdAt != items[b].createdAt ? items[a].createdAt < items[b].createdAt : tie(a, b);
      case SortMode::Opened: {
        // Most recently opened first; never opened last.
        const auto x = items[a].lastOpenedAt;
        const auto y = items[b].lastOpenedAt;
        if (x.has_value() != y.has_value()) return x.has_value();
        if (x && y && *x != *y) return *x > *y;
        return tie(a, b);
      }
      case SortMode::Type: {
        const int x = kindRank(items[a].kind);
        const int y = kindRank(items[b].kind);
        if (x != y) return x < y;
        const int c = byName(a, b);
        return c != 0 ? c < 0 : tie(a, b);
      }
    }
    return tie(a, b);
  });
  return out;
}

std::vector<std::size_t> pathTo(const std::vector<Item>& items, std::string_view id) {
  std::unordered_map<std::string_view, std::size_t> byId;
  for (std::size_t i = 0; i < items.size(); ++i) byId.emplace(items[i].id, i);
  std::vector<std::size_t> path;
  std::unordered_set<std::size_t> seen;
  auto it = byId.find(id);
  while (it != byId.end() && seen.insert(it->second).second) {
    path.push_back(it->second);
    const auto& parent = items[it->second].parentId;
    if (!parent) break;
    it = byId.find(*parent);
  }
  std::reverse(path.begin(), path.end());
  return path;
}

}  // namespace rancha
