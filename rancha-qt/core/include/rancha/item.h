#pragma once
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace rancha {

// What kind of thing an item is (the same five kinds as the Electron app).
enum class ItemKind { Collection, Launchable, Video, Readable, Audio };

const char* toString(ItemKind kind);
ItemKind itemKindFromString(std::string_view text);  // unknown text gives Collection

// One entry of the library (the Electron app's LibraryItem, src/shared/types.ts).
struct Item {
  std::string id;
  std::optional<std::string> parentId;  // none = top level
  ItemKind kind = ItemKind::Collection;
  std::string name;
  std::string description;  // "" when the item has none
  std::optional<std::string> target;         // file, folder or launch target
  std::optional<std::string> coverFile;      // file name in the covers folder
  std::optional<std::string> wallpaperFile;  // game page background, same folder as the covers
  std::optional<std::string> emulator;       // emulator profile id (ROMs)
  std::optional<std::string> core;           // RetroArch core file (ROMs)
  std::optional<double> progress;            // 0-1: how far a started, unfinished comic was read
  std::vector<std::string> tags;
  bool isFavorite = false;
  bool isDone = false;
  int hue = 0;                 // 0-360: colors the placeholder cover
  int sortOrder = 0;           // the user's own order ("custom" sorting)
  std::int64_t createdAt = 0;  // milliseconds since 1970
  std::optional<std::int64_t> lastOpenedAt;
};

}  // namespace rancha
