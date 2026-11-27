#pragma once
// SELECTING SEVERAL ITEMS: Ctrl+click toggles one, Shift+click selects a range from the last clicked item,
// Ctrl+A selects everything shown. Port of the Electron app's src/renderer/src/lib/selection.ts.
#include <algorithm>
#include <functional>
#include <optional>
#include <string>
#include <unordered_set>
#include <vector>

namespace rancha {

struct Selection {
  std::unordered_set<std::string> ids;
  std::optional<std::string> anchor;  // where the next Shift+click range starts
  bool operator==(const Selection&) const = default;
};

struct ClickModifiers {
  bool ctrl = false;  // Ctrl (or Cmd)
  bool shift = false;
};

inline Selection selectOnly(const std::optional<std::string>& id) {
  if (!id) return {};
  return {{*id}, *id};
}

/// The selection after clicking `id`. `order` is the items as shown, top-left first.
inline Selection clickSelect(const Selection& current, const std::string& id, const std::vector<std::string>& order,
                             ClickModifiers modifiers) {
  if (modifiers.shift && current.anchor) {
    const auto from = std::find(order.begin(), order.end(), *current.anchor);
    const auto to = std::find(order.begin(), order.end(), id);
    if (from != order.end() && to != order.end()) {
      Selection next;
      if (modifiers.ctrl) next.ids = current.ids;
      const auto [lo, hi] = std::minmax(from, to);
      for (auto it = lo; it != hi + 1; ++it) next.ids.insert(*it);
      next.anchor = current.anchor;  // the anchor stays, so the range can be adjusted
      return next;
    }
  }
  if (modifiers.ctrl || modifiers.shift) {
    Selection next{current.ids, id};
    if (next.ids.count(id) && modifiers.ctrl) next.ids.erase(id);
    else next.ids.insert(id);
    return next;
  }
  return selectOnly(id);
}

inline Selection selectAll(const std::vector<std::string>& order) {
  Selection next;
  next.ids.insert(order.begin(), order.end());
  if (!order.empty()) next.anchor = order.front();
  return next;
}

/// Forgets ids that no longer exist (after a delete, move or refresh).
inline Selection prune(const Selection& current, const std::function<bool(const std::string&)>& exists) {
  Selection next;
  for (const auto& id : current.ids)
    if (exists(id)) next.ids.insert(id);
  if (next.ids.size() == current.ids.size()) return current;
  if (current.anchor && next.ids.count(*current.anchor)) next.anchor = current.anchor;
  return next;
}

/// The selected ids in the order they are shown (so "move" keeps that order).
inline std::vector<std::string> inDisplayOrder(const Selection& current, const std::vector<std::string>& order) {
  std::vector<std::string> out;
  for (const auto& id : order)
    if (current.ids.count(id)) out.push_back(id);
  return out;
}

}  // namespace rancha
