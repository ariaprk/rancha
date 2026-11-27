#include <string>

#include "rancha/sample_library.h"

namespace rancha {
namespace {

// A tiny, always-the-same pseudo-random sequence (no <random>, so the result is identical on every compiler).
struct Sequence {
  std::uint64_t state = 0x9E3779B97F4A7C15ull;
  std::uint64_t next() {
    state ^= state << 13;
    state ^= state >> 7;
    state ^= state << 17;
    return state;
  }
  std::size_t below(std::size_t n) { return static_cast<std::size_t>(next() % n); }
};

const char* const kWords[] = {"Star", "Ember", "Moon", "Iron", "Neon", "Quiet", "Paper", "Blade", "Sky", "Tide", "Puzzle", "Dawn", "Harbor",
                              "Orchard", "Frontier", "Lantern", "Vale", "Keep", "Drift", "Chronicle", "Academy", "Squad", "Forge", "Lab"};
constexpr std::size_t kWordCount = sizeof(kWords) / sizeof(kWords[0]);

}  // namespace

std::vector<Item> stressItems(std::size_t count, std::int64_t nowMs) {
  std::vector<Item> items = sampleItems(nowMs);
  const std::vector<std::string> sections = {"games", "reading", "video", "apps", "music"};
  const ItemKind leafKinds[] = {ItemKind::Launchable, ItemKind::Readable, ItemKind::Video, ItemKind::Launchable, ItemKind::Audio};
  Sequence seq;
  // Folders: about one per 200 items, each inside a section. Items go inside those folders.
  std::vector<std::string> folders;
  std::vector<std::size_t> folderSection;
  const std::size_t folderCount = count / 200 + 1;
  items.reserve(items.size() + count + folderCount);
  int order = 1000;
  for (std::size_t f = 0; f < folderCount; ++f) {
    const std::size_t s = f % sections.size();
    Item folder;
    folder.id = "stress-folder-" + std::to_string(f);
    folder.parentId = sections[s];
    folder.kind = ItemKind::Collection;
    folder.name = std::string(kWords[seq.below(kWordCount)]) + " " + kWords[seq.below(kWordCount)] + " " + std::to_string(f + 1);
    folder.hue = static_cast<int>(seq.below(360));
    folder.sortOrder = ++order;
    folder.createdAt = nowMs - static_cast<std::int64_t>(order) * 60000;
    folders.push_back(folder.id);
    folderSection.push_back(s);
    items.push_back(std::move(folder));
  }
  for (std::size_t i = 0; i < count; ++i) {
    const std::size_t f = i % folderCount;
    Item item;
    item.id = "stress-" + std::to_string(i);
    item.parentId = folders[f];
    item.kind = leafKinds[folderSection[f]];
    item.name = std::string(kWords[seq.below(kWordCount)]) + " " + kWords[seq.below(kWordCount)] + " " + std::to_string(i + 1);
    item.hue = static_cast<int>(seq.below(360));
    item.isFavorite = seq.below(20) == 0;
    item.sortOrder = ++order;
    item.createdAt = nowMs - static_cast<std::int64_t>(order) * 60000;
    if (seq.below(10) == 0) item.lastOpenedAt = nowMs - static_cast<std::int64_t>(seq.below(1000)) * 3600000;
    items.push_back(std::move(item));
  }
  return items;
}

}  // namespace rancha
