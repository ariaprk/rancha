#include <filesystem>
#include <fstream>
#include <random>
#include <string>
#include <unordered_set>
#include <vector>

#include "check.h"
#include "rancha/cover_store.h"
#include "rancha/reorder_math.h"

using namespace rancha;
namespace fs = std::filesystem;

namespace {

void testReorder() {
  using namespace rancha::reorder;
  using V = std::vector<std::string>;

  // nearest slot: the closest centre; the first one on a tie; -1 for none
  const std::vector<Slot> slots{{0, 0, 10, 10}, {10, 0, 10, 10}, {0, 10, 10, 10}};
  CHECK(nearestSlot(slots, 14, 4) == 1);
  CHECK(nearestSlot(slots, 2, 18) == 2);
  CHECK(nearestSlot(slots, 10, 5) == 0);  // exactly between 0 and 1
  CHECK(nearestSlot({}, 1, 1) == -1);

  const V ids{"a", "b", "c", "d", "e"};
  // one item moved to the front
  Arrangement one = arrange(ids, {"d"}, 0);
  CHECK(one.order == (V{"d", "a", "b", "c", "e"}) && one.at == 0);
  CHECK(beforeIdOf(one, 1, std::nullopt) == std::optional<std::string>("a"));
  CHECK(!isNoChange(ids, one));
  // a group keeps its own order and lands among the rest
  Arrangement group = arrange(ids, {"e", "b"}, 2);
  CHECK(group.order == (V{"a", "c", "b", "e", "d"}) && group.at == 2);
  CHECK(beforeIdOf(group, 2, std::nullopt) == std::optional<std::string>("d"));
  // past the end: clamped, and "before" is what follows the drawn window
  Arrangement last = arrange(ids, {"a"}, 99);
  CHECK(last.order == (V{"b", "c", "d", "e", "a"}) && last.at == 4);
  CHECK(!beforeIdOf(last, 1, std::nullopt));
  CHECK(beforeIdOf(last, 1, std::string("z")) == std::optional<std::string>("z"));
  // a negative place is the front
  CHECK(arrange(ids, {"c"}, -3).at == 0);
  // dropping where it already was changes nothing
  CHECK(isNoChange(ids, arrange(ids, {"b"}, 1)));
  CHECK(isNoChange({}, arrange({}, {}, 0)));
}

struct TempDir {
  fs::path root;
  TempDir() {
    std::random_device rd;
    root = fs::temp_directory_path() / ("rancha-covers-" + std::to_string(rd()) + std::to_string(rd()));
  }
  ~TempDir() {
    std::error_code error;
    fs::remove_all(root, error);
  }
};

std::string readAll(const fs::path& path) {
  std::ifstream file(path, std::ios::binary);
  return std::string(std::istreambuf_iterator<char>(file), {});
}

void testCoverNames() {
  CHECK(isCoverName("0123abcd-0123-4abc-8def-0123456789ab.jpg"));
  CHECK(isCoverName("------------------------------------.jpg"));
  CHECK(!isCoverName("0123ABCD-0123-4abc-8def-0123456789ab.jpg"));  // upper case
  CHECK(!isCoverName("0123abcd-0123-4abc-8def-0123456789ab.png"));
  CHECK(!isCoverName("0123abcd-0123-4abc-8def-0123456789a.jpg"));  // 35
  CHECK(!isCoverName("../../etc/passwd"));
  CHECK(!isCoverName("x0123abcd-0123-4abc-8def-0123456789ab.jpg"));
  CHECK(!isCoverName(""));

  const std::string hash(40, 'a');
  CHECK(isAutoCoverName(hash + "-1-2.jpg"));
  CHECK(isAutoCoverName(hash + "-1234567890123456-1234567890123456.jpg"));
  CHECK(!isAutoCoverName(hash + "-12345678901234567-1.jpg"));  // 17 digits
  CHECK(!isAutoCoverName(hash + "--1.jpg"));
  CHECK(!isAutoCoverName(hash + "-1-.jpg"));
  CHECK(!isAutoCoverName(hash + "-1.jpg"));
  CHECK(!isAutoCoverName(std::string(39, 'a') + "-1-2.jpg"));
  CHECK(!isAutoCoverName(std::string(40, 'g') + "-1-2.jpg"));
  CHECK(!isAutoCoverName(hash + "-1-2.png"));
}

void testStore() {
  TempDir dir;
  CoverStore store(dir.root / "covers");  // the folder is made
  CHECK(fs::is_directory(dir.root / "covers"));

  const std::string first = store.add("JPEG-1");
  const std::string second = store.add("JPEG-2");
  CHECK(isCoverName(first) && isCoverName(second) && first != second);
  CHECK(store.has(first) && readAll(*store.pathOf(first)) == "JPEG-1");
  CHECK(!store.has("0123abcd-0123-4abc-8def-0123456789ab.jpg"));  // valid name, no file
  CHECK(!store.pathOf("../library.db"));

  // a file with a name that is not a cover is never removed
  std::ofstream(dir.root / "covers" / "notes.txt") << "keep";
  store.remove(std::string("notes.txt"));
  store.remove(std::nullopt);
  store.remove(std::string("0123abcd-0123-4abc-8def-0123456789ab.jpg"));  // already gone: fine
  CHECK(fs::exists(dir.root / "covers" / "notes.txt"));

  // sweep: only unused covers go
  const std::string third = store.add("JPEG-3");
  CHECK(store.sweep({first}) == 2);
  CHECK(store.has(first) && !store.has(second) && !store.has(third));
  CHECK(fs::exists(dir.root / "covers" / "notes.txt"));
  CHECK(store.sweep({first}) == 0);

  store.remove(first);
  CHECK(!store.has(first));
}

}  // namespace

void testReorderMath() { testReorder(); }

void testCoverStore() {
  testCoverNames();
  testStore();
}
