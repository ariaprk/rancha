// Port of src/renderer/src/lib/reorderMath.ts.
#include "rancha/reorder_math.h"

#include <algorithm>
#include <limits>

namespace rancha::reorder {

int nearestSlot(const std::vector<Slot>& slots, double px, double py) {
  int best = -1;
  double bestDistance = std::numeric_limits<double>::infinity();
  for (std::size_t i = 0; i < slots.size(); ++i) {
    const Slot& slot = slots[i];
    const double dx = slot.x + slot.w / 2 - px;
    const double dy = slot.y + slot.h / 2 - py;
    const double distance = dx * dx + dy * dy;
    if (distance < bestDistance) {  // strictly closer: the first slot wins a tie, as in the Electron app
      bestDistance = distance;
      best = static_cast<int>(i);
    }
  }
  return best;
}

Arrangement arrange(const std::vector<std::string>& ids, const std::unordered_set<std::string>& group, long at) {
  std::vector<std::string> rest;
  std::vector<std::string> moved;
  for (const std::string& id : ids) (group.count(id) ? moved : rest).push_back(id);
  const long size = static_cast<long>(rest.size());
  const std::size_t position = static_cast<std::size_t>(std::max(0L, std::min(at, size)));
  Arrangement out;
  out.order.reserve(ids.size());
  out.order.insert(out.order.end(), rest.begin(), rest.begin() + static_cast<long>(position));
  out.order.insert(out.order.end(), moved.begin(), moved.end());
  out.order.insert(out.order.end(), rest.begin() + static_cast<long>(position), rest.end());
  out.at = position;
  return out;
}

std::optional<std::string> beforeIdOf(const Arrangement& arranged, std::size_t groupSize,
                                      const std::optional<std::string>& after) {
  const std::size_t index = arranged.at + groupSize;
  if (index < arranged.order.size()) return arranged.order[index];
  return after;
}

bool isNoChange(const std::vector<std::string>& original, const Arrangement& arranged) {
  // Like `original.every((id, i) => id === order[i])`: an id past the end of `order` counts as a change.
  for (std::size_t i = 0; i < original.size(); ++i)
    if (i >= arranged.order.size() || original[i] != arranged.order[i]) return false;
  return true;
}

}  // namespace rancha::reorder
