#include <set>
#include <string>

#include "check.h"
#include "rancha/library_view.h"
#include "rancha/sample_library.h"

using namespace rancha;

namespace {
std::vector<std::string> names(const std::vector<Item>& items, const std::vector<std::size_t>& indexes) {
  std::vector<std::string> out;
  for (const std::size_t i : indexes) out.push_back(items[i].name);
  return out;
}
}  // namespace

void testLibraryView() {
  const std::int64_t now = 1'700'000'000'000;
  const std::vector<Item> items = sampleItems(now);
  CHECK(items.size() == 42);

  // the five sections, in the user's own order
  const std::vector<std::string> sections = {"Games", "Reading", "Video", "Applications", "Music"};
  CHECK(names(items, childrenOf(items, "", SortMode::Custom)) == sections);

  // inside a collection
  CHECK(names(items, childrenOf(items, "skyward-s1", SortMode::Name)) == (std::vector<std::string>{"Episode 1", "Episode 2", "Episode 3"}));
  CHECK(names(items, childrenOf(items, "skyward-s1", SortMode::NameDesc)) == (std::vector<std::string>{"Episode 3", "Episode 2", "Episode 1"}));
  CHECK(childrenOf(items, "no-such-folder", SortMode::Name).empty());
  CHECK(names(items, childrenOf(items, "games", SortMode::Type)).front() == "RPG");  // collections first
  // opened: most recent first, never opened last
  const auto opened = names(items, childrenOf(items, "games-rpg", SortMode::Opened));
  CHECK(opened.front() == "Starfall Chronicles" && opened.size() == 3);

  // breadcrumb
  const auto path = pathTo(items, "skyward-s1e2");
  CHECK(names(items, path) == (std::vector<std::string>{"Video", "Anime", "Skyward Academy", "Season 1", "Episode 2"}));
  CHECK(pathTo(items, "").empty() && pathTo(items, "unknown").empty());

  // a loop in the data does not hang
  std::vector<Item> loop(2);
  loop[0].id = "a"; loop[0].parentId = "b";
  loop[1].id = "b"; loop[1].parentId = "a";
  CHECK(pathTo(loop, "a").size() == 2);

  // sort mode names
  CHECK(sortModeFromString("nameDesc") == SortMode::NameDesc && sortModeFromString("x") == SortMode::Custom);
  CHECK(std::string(toString(SortMode::AddedOld)) == "addedOld");
  CHECK(itemKindFromString("audio") == ItemKind::Audio && itemKindFromString("zzz") == ItemKind::Collection);

  // the stress library: same every time, unique ids, every item reachable from a section
  const auto big = stressItems(20000, now);
  const auto big2 = stressItems(20000, now);
  CHECK(big.size() == 20000 + 42 + 20000 / 200 + 1);
  CHECK(big.size() == big2.size() && big[5000].name == big2[5000].name && big[5000].hue == big2[5000].hue);
  std::set<std::string> ids;
  for (const Item& item : big) ids.insert(item.id);
  CHECK(ids.size() == big.size());
  CHECK(pathTo(big, "stress-12345").size() == 3);  // section / folder / item
}
