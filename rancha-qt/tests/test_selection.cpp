#include <string>
#include <unordered_set>
#include <vector>

#include "check.h"
#include "rancha/selection.h"

using namespace rancha;

namespace {
using Ids = std::unordered_set<std::string>;
const std::vector<std::string> kOrder{"a", "b", "c", "d", "e"};
constexpr ClickModifiers kPlain{};
constexpr ClickModifiers kCtrl{true, false};
constexpr ClickModifiers kShift{false, true};
constexpr ClickModifiers kCtrlShift{true, true};
}  // namespace

void testSelection() {
  // selectOnly
  CHECK(selectOnly(std::nullopt) == Selection{});
  CHECK(selectOnly(std::string("a")) == (Selection{{"a"}, "a"}));

  // a plain click replaces the selection
  const Selection ab{{"a", "b"}, "b"};
  CHECK(clickSelect(ab, "d", kOrder, kPlain) == (Selection{{"d"}, "d"}));

  // Ctrl+click toggles one item and moves the anchor
  const Selection a = selectOnly(std::string("a"));
  const Selection withB = clickSelect(a, "b", kOrder, kCtrl);
  CHECK(withB == (Selection{{"a", "b"}, "b"}));
  CHECK(clickSelect(withB, "b", kOrder, kCtrl) == (Selection{{"a"}, "b"}));

  // Shift+click selects the range from the anchor, in either direction; the anchor stays
  const Selection range = clickSelect(a, "d", kOrder, kShift);
  CHECK(range == (Selection{{"a", "b", "c", "d"}, "a"}));
  CHECK(clickSelect(range, "b", kOrder, kShift) == (Selection{{"a", "b"}, "a"}));
  const Selection c = selectOnly(std::string("c"));
  CHECK(clickSelect(c, "a", kOrder, kShift) == (Selection{{"a", "b", "c"}, "c"}));

  // Ctrl+Shift+click adds the range to what was already selected
  const Selection eThenB{{"e", "b"}, "b"};
  CHECK(clickSelect(eThenB, "c", kOrder, kCtrlShift) == (Selection{{"b", "c", "e"}, "b"}));

  // Shift+click with no usable anchor just adds the item (never removes it)
  CHECK(clickSelect(Selection{}, "c", kOrder, kShift) == (Selection{{"c"}, "c"}));
  const Selection lostAnchor{{"c"}, "gone"};
  CHECK(clickSelect(lostAnchor, "c", kOrder, kShift) == (Selection{{"c"}, "c"}));

  // Ctrl+A
  CHECK(selectAll(kOrder) == (Selection{{"a", "b", "c", "d", "e"}, "a"}));
  CHECK(selectAll({}) == Selection{});

  // prune forgets missing ids, and the anchor with them
  const auto all = [](const std::string&) { return true; };
  const auto noB = [](const std::string& id) { return id != "b"; };
  CHECK(prune(ab, all) == ab);
  CHECK(prune(ab, noB) == (Selection{{"a"}, std::nullopt}));
  const Selection abAnchorA{{"a", "b"}, "a"};
  CHECK(prune(abAnchorA, noB) == (Selection{{"a"}, "a"}));

  // the selected ids in the order they are shown
  const Selection scattered{{"e", "a", "c", "zzz"}, "e"};
  CHECK(inDisplayOrder(scattered, kOrder) == (std::vector<std::string>{"a", "c", "e"}));
  CHECK(inDisplayOrder(Selection{}, kOrder).empty());
}
