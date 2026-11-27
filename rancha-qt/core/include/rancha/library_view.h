#pragma once
#include <cstddef>
#include <string>
#include <string_view>
#include <vector>

#include "rancha/item.h"

namespace rancha {

// How the items of a folder are ordered (the Electron app's sort modes).
enum class SortMode { Custom, Name, NameDesc, Added, AddedOld, Opened, Type };
SortMode sortModeFromString(std::string_view text);  // unknown text gives Custom
const char* toString(SortMode mode);

// The items directly inside a folder (parentId empty = the top level), in the given order, as indexes into `items`.
// Names are compared naturally ("Episode 2" before "Episode 10"). Ties keep the user's own order, then the id.
std::vector<std::size_t> childrenOf(const std::vector<Item>& items, std::string_view parentId, SortMode mode);

// The folders from the top down to the folder `id` (including it): the breadcrumb. Empty when `id` is empty or unknown.
// A loop in the data (A inside B inside A) ends the walk instead of hanging.
std::vector<std::size_t> pathTo(const std::vector<Item>& items, std::string_view id);

}  // namespace rancha
