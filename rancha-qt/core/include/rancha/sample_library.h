#pragma once
#include <cstdint>
#include <vector>

#include "rancha/item.h"

namespace rancha {

// The Electron app's invented sample library (5 sections with a few collections and items), for trying the interface.
// `nowMs` is the current time in milliseconds (the dates of the items are set relative to it).
std::vector<Item> sampleItems(std::int64_t nowMs);

// A big invented library for speed tests: `count` items spread over folders under the five sections. Always the same
// for the same `count` (no randomness), so measurements can be compared.
std::vector<Item> stressItems(std::size_t count, std::int64_t nowMs);

}  // namespace rancha
