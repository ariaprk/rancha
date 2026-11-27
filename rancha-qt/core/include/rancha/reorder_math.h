#pragma once
// The arithmetic behind drag-to-reorder (no screen in here, so it can be tested on its own). "Slots" are the places
// in the grid or list, in reading order. Port of the Electron app's src/renderer/src/lib/reorderMath.ts.
#include <optional>
#include <string>
#include <unordered_set>
#include <vector>

namespace rancha::reorder {

struct Slot {
  double x = 0;
  double y = 0;
  double w = 0;
  double h = 0;
};

/// Index of the slot whose centre is closest to the point (the first one on a tie). -1 when there are no slots.
int nearestSlot(const std::vector<Slot>& slots, double px, double py);

struct Arrangement {
  std::vector<std::string> order;  // the order of the ids after the move
  std::size_t at = 0;              // position of the first moved id inside `order`
};

/// `ids` without the `group`, with the group (in its original order) inserted at `at` among the rest.
/// `at` is clamped to 0 .. the number of the rest.
Arrangement arrange(const std::vector<std::string>& ids, const std::unordered_set<std::string>& group, long at);

/// Which sibling the moved block ends up directly before (none = at the end). `after` is the first item that
/// follows the drawn window in the full list (a long list is only partly drawn).
std::optional<std::string> beforeIdOf(const Arrangement& arranged, std::size_t groupSize,
                                      const std::optional<std::string>& after);

/// Whether the move changes anything.
bool isNoChange(const std::vector<std::string>& original, const Arrangement& arranged);

}  // namespace rancha::reorder
