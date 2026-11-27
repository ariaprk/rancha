#include <string>
#include <vector>

#include "check.h"
#include "rancha/library_query.h"
#include "rancha/sample_library.h"

using namespace rancha;

namespace {
std::vector<std::string> names(const std::vector<Item>& items, const std::vector<std::size_t>& indexes) {
  std::vector<std::string> out;
  for (const std::size_t i : indexes) out.push_back(items[i].name);
  return out;
}

std::size_t at(const ItemIndex& byId, const std::string& id) { return byId.at(id); }

std::vector<std::string> search(const std::vector<Item>& items, const ItemIndex& byId, const std::string& query,
                                std::optional<std::string> scope = std::nullopt) {
  QueryInput input;
  input.items = &items;
  input.byId = &byId;
  input.query = query;
  input.scopeFolderId = std::move(scope);
  std::vector<std::size_t> found;
  for (const auto& result : runQuery(input)) found.push_back(result.item);
  return names(items, found);
}
}  // namespace

void testLibraryQuery() {
  const std::int64_t now = 1'700'000'000'000;
  const std::vector<Item> items = sampleItems(now);
  const ItemIndex byId = indexById(items);
  CHECK(byId.size() == items.size());

  // words
  CHECK(splitWords("  Dark \t Souls ") == (std::vector<std::string>{"dark", "souls"}));
  CHECK(splitWords("   ").empty());

  // where an item lives
  CHECK(locationOf(items, byId, at(byId, "skyward-s1e2")) == "Video \xe2\x80\xba Anime \xe2\x80\xba Skyward Academy \xe2\x80\xba Season 1");
  CHECK(locationOf(items, byId, at(byId, "games")) == "Home");
  CHECK(isInsideFolder(items, byId, at(byId, "skyward-s1e2"), "video"));
  CHECK(!isInsideFolder(items, byId, at(byId, "skyward-s1e2"), "games"));

  // search: the folder's own name beats its tagged contents; equal scores by name; any case
  CHECK(search(items, byId, "RPG") ==
        (std::vector<std::string>{"RPG", "Ember Keep", "Moonlit Vale", "Starfall Chronicles"}));
  CHECK(search(items, byId, "chron") == (std::vector<std::string>{"Starfall Chronicles"}));  // start of a word
  CHECK(search(items, byId, "airships") == (std::vector<std::string>{"Skyward Academy"}));   // description
  CHECK(search(items, byId, "nova 2") == (std::vector<std::string>{"Nova Squad #2"}));        // every word must match
  CHECK(search(items, byId, "dark souls").empty());
  CHECK(search(items, byId, "episode", "skyward-s1") == (std::vector<std::string>{"Episode 1", "Episode 2", "Episode 3"}));

  // tags, most used first, then by name
  const auto tags = collectTags(items);
  CHECK(!tags.empty() && tags[0] == (TagCount{"rpg", 3}));
  CHECK(tags.size() > 1 && tags[1] == (TagCount{"comic", 2}));

  // ---- the list on screen
  // plain browsing: one folder, folders first when sorting by name
  {
    ViewRequest request;
    request.folderId = "games";
    request.sort = SortMode::NameDesc;
    const auto view = buildView(items, byId, request);
    CHECK(view.title == "Games" && !view.flat);
    CHECK(names(items, view.items) == (std::vector<std::string>{"Strategy", "RPG", "Puzzle Orchard", "Neon Drift"}));
  }
  {
    const auto view = buildView(items, byId, ViewRequest{});
    CHECK(view.title == "Home" && names(items, view.items).size() == 5);
  }
  // search from Home: the whole library, no " in ..."
  {
    ViewRequest request;
    request.query = " rpg ";
    const auto view = buildView(items, byId, request);
    CHECK(view.flat && view.title == "Search results for \xe2\x80\x9crpg\xe2\x80\x9d");
    CHECK(names(items, view.items).front() == "RPG");  // custom order = best match
  }
  // search inside a folder: "here" narrows it, "everywhere" does not
  {
    ViewRequest request;
    request.folderId = "reading";
    request.query = "rpg";
    CHECK(buildView(items, byId, request).items.empty());
    CHECK(buildView(items, byId, request).title == "Search results for \xe2\x80\x9crpg\xe2\x80\x9d in Reading");
    request.searchHere = false;
    const auto view = buildView(items, byId, request);
    CHECK(view.items.size() == 4 && view.title == "Search results for \xe2\x80\x9crpg\xe2\x80\x9d");
  }
  // a filter turns a folder into a flat list of matches below it
  {
    ViewRequest request;
    request.folderId = "skyward";
    request.filters.kinds = {ItemKind::Video};
    const auto view = buildView(items, byId, request);
    CHECK(view.flat && view.title == "Skyward Academy (filtered)" && view.items.size() == 5);
  }
  {
    ViewRequest request;
    request.filters.tags = {"Manga"};
    const auto view = buildView(items, byId, request);
    CHECK(view.title == "Home (filtered)");
    CHECK(names(items, view.items) == (std::vector<std::string>{"Blade of Dawn", "Quiet Harbor"}));
  }
  // All items: everything except collections
  {
    ViewRequest request;
    request.type = ViewType::All;
    const auto view = buildView(items, byId, request);
    CHECK(view.title == "All items" && view.flat && view.items.size() == 23);
  }
  // Favorites: custom order = by name, folders first
  {
    ViewRequest request;
    request.type = ViewType::Favorites;
    const auto view = buildView(items, byId, request);
    CHECK(view.title == "Favorites");
    CHECK(names(items, view.items) ==
          (std::vector<std::string>{"Blade of Dawn", "Skyward Academy", "Moonlit Vale", "Starfall Chronicles"}));
  }
  // Recent: custom order = most recently opened first
  {
    ViewRequest request;
    request.type = ViewType::Recent;
    const auto view = buildView(items, byId, request);
    CHECK(view.title == "Recently opened");
    CHECK(names(items, view.items) == (std::vector<std::string>{"Starfall Chronicles", "Volume 1", "Tidewater", "Episode 1"}));
    request.sort = SortMode::Name;
    CHECK(names(items, buildView(items, byId, request).items).front() == "Episode 1");
  }
}
