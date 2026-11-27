// Tests for the item repository port (core/src/item_repository.cpp): the same rules as
// src/main/db/itemRepository.ts in the Electron app.
#include <algorithm>
#include <filesystem>
#include <random>
#include <string>

#include "check.h"
#include "rancha/item_repository.h"

namespace fs = std::filesystem;
using rancha::ImportNode;
using rancha::Item;
using rancha::ItemKind;
using rancha::ItemPatch;
using rancha::ItemRepository;
using rancha::NewItem;
using rancha::Nullable;
using rancha::db::Database;

namespace {

fs::path freshFolder() {
  std::random_device device;
  const auto folder = fs::temp_directory_path() / ("rancha-repo-test-" + std::to_string(device()));
  fs::remove_all(folder);
  fs::create_directories(folder);
  return folder;
}

template <class Work>
bool throws(Work&& work, const std::string& text = {}) {
  try {
    work();
  } catch (const rancha::db::Error& error) {
    return text.empty() || std::string(error.what()).find(text) != std::string::npos;
  }
  return false;
}

NewItem make(const std::string& name, ItemKind kind = ItemKind::Launchable,
             std::optional<std::string> parent = std::nullopt, std::optional<std::string> target = std::nullopt) {
  NewItem input;
  input.name = name;
  input.kind = kind;
  input.parentId = std::move(parent);
  input.target = std::move(target);
  return input;
}

std::vector<std::string> namesIn(ItemRepository& repo, const std::optional<std::string>& parent) {
  std::vector<std::pair<int, std::string>> found;
  for (const auto& item : repo.listItems())
    if (item.parentId == parent) found.emplace_back(item.sortOrder, item.name);
  std::stable_sort(found.begin(), found.end(), [](auto& a, auto& b) { return a.first < b.first; });
  std::vector<std::string> names;
  for (auto& entry : found) names.push_back(entry.second);
  return names;
}

void testHelpers() {
  CHECK(rancha::hueFromName("") == 0);
  CHECK(rancha::hueFromName("A") == 65);
  CHECK(rancha::hueFromName("AB") == (65 * 31 + 66) % 360);
  CHECK(rancha::hueFromName("\xd8\xa2") == 0x622 % 360);  // one Persian letter counts as one code point
  CHECK(rancha::isProtectedSection("games", std::nullopt));
  CHECK(!rancha::isProtectedSection("games", std::string("x")));
  CHECK(!rancha::isProtectedSection("other", std::nullopt));
  CHECK(rancha::pathKey("C:/Game.EXE", true) == "c:/game.exe");
  CHECK(rancha::pathKey("/home/Game", false) == "/home/Game");
  const auto a = rancha::randomUuid();
  CHECK(a.size() == 36 && a[8] == '-' && a[14] == '4' && std::string("89ab").find(a[19]) != std::string::npos);
  CHECK(a != rancha::randomUuid());
}

void testCreateAndRead(ItemRepository& repo) {
  const auto before = repo.countItems();
  CHECK(before == 5);  // the five main sections
  NewItem input = make("Doom", ItemKind::Launchable, std::string("games"), std::string("/games/doom"));
  input.tags = {"shooter", "Action"};
  input.description = "Classic";
  const Item doom = repo.createItem(input);
  CHECK(doom.parentId == std::string("games"));
  CHECK(doom.hue == rancha::hueFromName("Doom"));
  CHECK(doom.tags == (std::vector<std::string>{"Action", "shooter"}));  // ORDER BY tag COLLATE NOCASE
  CHECK(doom.description == "Classic");
  CHECK(doom.target == std::string("/games/doom"));
  CHECK(!doom.coverFile && !doom.isFavorite && !doom.isDone && !doom.lastOpenedAt);
  const Item quake = repo.createItem(make("Quake", ItemKind::Launchable, std::string("games")));
  CHECK(quake.sortOrder == doom.sortOrder + 1);  // added at the end of its folder
  CHECK(repo.countItems() == before + 2);
  CHECK(repo.getItem("nope") == std::nullopt);
  CHECK(repo.existingTargets().count("/games/doom") == 1);
  // Parents must exist and be collections; a failed create changes nothing.
  CHECK(throws([&] { repo.createItem(make("X", ItemKind::Video, std::string("missing"))); }, "no longer exists"));
  CHECK(throws([&] { repo.createItem(make("X", ItemKind::Video, doom.id)); }, "only be placed inside collections"));
  CHECK(repo.countItems() == before + 2);
}

void testUpdate(ItemRepository& repo) {
  NewItem input = make("Pic");
  input.coverFile = "old.png";
  input.wallpaperFile = "wall.png";
  const Item item = repo.createItem(input);
  ItemPatch patch;
  patch.name = "Renamed";
  patch.coverFile = Nullable("new.png");
  patch.description = Nullable();  // clear
  patch.tags = std::vector<std::string>{"b"};
  auto result = repo.updateItem(item.id, patch);
  CHECK(result.item.name == "Renamed");
  CHECK(result.item.coverFile == std::string("new.png"));
  CHECK(result.removedCover == std::string("old.png"));
  CHECK(!result.removedWallpaper);  // not part of the patch
  CHECK(result.item.wallpaperFile == std::string("wall.png"));
  CHECK(result.item.tags == (std::vector<std::string>{"b"}));
  ItemPatch clear;
  clear.wallpaperFile = Nullable();
  result = repo.updateItem(item.id, clear);
  CHECK(result.removedWallpaper == std::string("wall.png"));
  CHECK(!result.item.wallpaperFile);
  CHECK(result.item.name == "Renamed");  // untouched
  CHECK(throws([&] { repo.updateItem("gone", patch); }, "no longer exists"));
  const auto covers = repo.listCoverFiles();
  CHECK(std::find(covers.begin(), covers.end(), "new.png") != covers.end());
  repo.setFavorite(item.id, true);
  CHECK(repo.getItem(item.id)->isFavorite);
  CHECK(throws([&] { repo.setFavorite("gone", true); }, "no longer exists"));
  CHECK(repo.markOpened(item.id, 1234) == 1234);
  CHECK(repo.getItem(item.id)->lastOpenedAt == std::int64_t{1234});
  CHECK(throws([&] { repo.markOpened("gone"); }));
}

void testDeleteAndMove(ItemRepository& repo) {
  const Item folder = repo.createItem(make("Folder", ItemKind::Collection));
  const Item inner = repo.createItem(make("Inner", ItemKind::Collection, folder.id));
  NewItem leaf = make("Leaf", ItemKind::Video, inner.id);
  leaf.coverFile = "leaf.png";
  leaf.tags = {"t"};
  const Item video = repo.createItem(leaf);
  // Moving.
  CHECK(throws([&] { repo.moveItem(folder.id, folder.id); }, "into itself"));
  CHECK(throws([&] { repo.moveItem(folder.id, inner.id); }, "own sub-collections"));
  CHECK(throws([&] { repo.moveItem("games", folder.id); }, "stay at the top level"));
  CHECK(throws([&] { repo.moveItem(video.id, video.id); }));
  repo.moveItem(video.id, folder.id);
  CHECK(repo.getItem(video.id)->parentId == folder.id);
  repo.moveItem(video.id, inner.id);
  // Deleting.
  CHECK(throws([&] { repo.deleteItem("music"); }, "cannot be deleted"));
  CHECK(throws([&] { repo.deleteItem("gone"); }, "no longer exists"));
  const auto covers = repo.deleteItem(folder.id);
  CHECK(covers == (std::vector<std::string>{"leaf.png"}));
  CHECK(!repo.getItem(inner.id) && !repo.getItem(video.id));  // ON DELETE CASCADE
}

void testImportTree(ItemRepository& repo) {
  repo.createItem(make("Known", ItemKind::Video, std::string("video"), std::string("/v/known.mkv")));
  ImportNode show{"Show", ItemKind::Collection, {}, {}, {}, {}};
  show.children.push_back({"E1", ItemKind::Video, std::string("/v/e1.mkv"), {}, {}, {}});
  show.children.push_back({"E1 again", ItemKind::Video, std::string("/v/e1.mkv"), {}, {}, {}});  // same file
  ImportNode dupes{"Dupes", ItemKind::Collection, {}, {}, {}, {}};
  dupes.children.push_back({"K", ItemKind::Video, std::string("/v/known.mkv"), {}, {}, {}});
  ImportNode empty{"Empty", ItemKind::Collection, {}, {}, {}, {}};
  const auto result = repo.importTree(std::string("video"), {show, dupes, empty});
  CHECK(result == (rancha::TreeImportResult{1, 1, 2}));
  const auto names = namesIn(repo, std::string("video"));
  CHECK(std::find(names.begin(), names.end(), "Dupes") == names.end());  // left empty: undone
  CHECK(std::find(names.begin(), names.end(), "Empty") == names.end());
  CHECK(std::find(names.begin(), names.end(), "Show") != names.end());
  const auto before = repo.countItems();
  CHECK(throws([&] { repo.importTree(std::string("gone"), {show}); }));
  CHECK(repo.countItems() == before);  // nothing was added
}

void testReading(ItemRepository& repo) {
  const Item book = repo.createItem(make("Book", ItemKind::Readable, std::string("reading"), std::string("/b.cbz")));
  CHECK(!repo.getReadingState(book.id));
  repo.saveReadingState(book.id, {4, 10, "rtl"}, 99);
  CHECK(repo.getReadingState(book.id) == (rancha::ReadingState{4, 10, "rtl"}));
  CHECK(repo.getItem(book.id)->progress == 0.5);
  repo.saveReadingState("gone", {1, 2, "ltr"});  // silently ignored
  repo.saveReadingState(book.id, {9, 10, "ltr"});
  CHECK(repo.getItem(book.id)->isDone);  // the last page counts as finished
  CHECK(!repo.getItem(book.id)->progress);  // finished: no progress bar

  // Chapters: 3 chapters of 10 pages, the reader stopped on page 15 (in chapter 2).
  const Item big = repo.createItem(make("Big", ItemKind::Readable, std::string("reading"), std::string("/big.cbz")));
  repo.convertToChapters(big.id, {{"C1", "/big.cbz#1", 0, 10}, {"C2", "/big.cbz#2", 10, 10}, {"C3", "/big.cbz#3", 20, 10}},
                         15, "rtl", std::string("first.png"));
  const auto converted = repo.getItem(big.id);
  CHECK(converted->kind == ItemKind::Collection && !converted->target);
  CHECK(converted->coverFile == std::string("first.png"));
  std::vector<Item> chapters;
  for (const auto& item : repo.listItems())
    if (item.parentId == big.id) chapters.push_back(item);
  CHECK(chapters.size() == 3);
  if (chapters.size() == 3) {
    CHECK(chapters[0].isDone && !chapters[1].isDone && !chapters[2].isDone);
    CHECK(repo.getReadingState(chapters[1].id) == (rancha::ReadingState{5, 10, "rtl"}));
    CHECK(!repo.getReadingState(chapters[2].id));
  }
  CHECK(throws([&] { repo.convertToChapters(big.id, {}, 0, "ltr"); }, "can no longer be turned into chapters"));
}

void testBulk(ItemRepository& repo) {
  const Item box = repo.createItem(make("Box", ItemKind::Collection));
  const Item a = repo.createItem(make("A", ItemKind::Video, box.id));
  const Item b = repo.createItem(make("B", ItemKind::Video, box.id));
  const Item c = repo.createItem(make("C", ItemKind::Video, box.id));
  const Item sub = repo.createItem(make("Sub", ItemKind::Collection, box.id));
  const Item d = repo.createItem(make("D", ItemKind::Video, sub.id));

  CHECK(repo.setFavoriteMany({a.id, a.id, b.id, "gone"}, true) == 2);
  CHECK(repo.setDoneMany({box.id}, true) == 4);  // A, B, C and D inside Sub
  CHECK(repo.setDoneMany({box.id}, true) == 0);  // nothing left to change
  CHECK(repo.getItem(d.id)->isDone && !repo.getItem(sub.id)->isDone);
  CHECK(repo.addTagMany({a.id, b.id, "gone"}, "Tag") == 2);
  CHECK(repo.addTagMany({a.id}, "tag") == 0);  // same tag, other case
  CHECK(repo.removeTagMany({a.id, b.id}, "TAG") == 2);
  CHECK(repo.getItem(a.id)->tags.empty());

  // Reordering.
  CHECK(namesIn(repo, box.id) == (std::vector<std::string>{"A", "B", "C", "Sub"}));
  repo.moveWithinFolder(a.id, rancha::ReorderDirection::Later);
  CHECK(namesIn(repo, box.id) == (std::vector<std::string>{"B", "A", "C", "Sub"}));
  repo.moveWithinFolder(b.id, rancha::ReorderDirection::Earlier);  // already first
  CHECK(namesIn(repo, box.id) == (std::vector<std::string>{"B", "A", "C", "Sub"}));
  CHECK(repo.placeMany({sub.id, c.id}, b.id) == 2);
  CHECK(namesIn(repo, box.id) == (std::vector<std::string>{"Sub", "C", "B", "A"}));
  CHECK(repo.placeMany({a.id}, std::nullopt) == 0);  // already last
  CHECK(throws([&] { repo.placeMany({a.id}, a.id); }, "before itself"));
  CHECK(throws([&] { repo.placeMany({a.id, d.id}, std::nullopt); }, "not in the same folder"));
  CHECK(throws([&] { repo.placeMany({a.id}, d.id); }, "different folder"));
  CHECK(repo.placeMany({}, std::nullopt) == 0);

  // Moving and deleting many: an item inside another chosen item is left to its parent.
  CHECK(repo.moveMany({sub.id, d.id, a.id}, std::string("video")) == 2);
  CHECK(repo.getItem(d.id)->parentId == sub.id);
  CHECK(repo.getItem(sub.id)->parentId == std::string("video"));
  CHECK(throws([&] { repo.deleteMany({sub.id, d.id, "gone", "music"}); }, "cannot be deleted"));
  CHECK(repo.getItem(sub.id) && repo.getItem(d.id));  // "music" is protected: the whole step is undone
}

void testBulkDelete(ItemRepository& repo) {
  const Item box = repo.createItem(make("Box2", ItemKind::Collection));
  NewItem pic = make("P", ItemKind::Video, box.id);
  pic.coverFile = "p.png";
  const Item p = repo.createItem(pic);
  const auto removed = repo.deleteMany({box.id, p.id, "gone"});
  CHECK(removed.deleted == 1);
  CHECK(removed.covers == (std::vector<std::string>{"p.png"}));
  CHECK(!repo.getItem(p.id));
}

}  // namespace

void testItemRepository() {
  testHelpers();
  const auto folder = freshFolder();
  {
    Database db(folder / "library.db");
    ItemRepository repo(db);
    testCreateAndRead(repo);
    testUpdate(repo);
    testDeleteAndMove(repo);
    testImportTree(repo);
    testReading(repo);
    testBulk(repo);
    testBulkDelete(repo);
    // A failed bulk step must leave everything as it was.
    const auto before = repo.countItems();
    CHECK(throws([&] { repo.deleteMany({"music"}); }, "cannot be deleted"));
    CHECK(repo.countItems() == before);
    // Backup copy.
    const auto copy = folder / "copy.db";
    repo.snapshotTo(copy.string());
    CHECK(fs::exists(copy));
    {
      Database other(copy);
      ItemRepository second(other);
      CHECK(second.countItems() == before);
    }
  }
  fs::remove_all(folder);
}
