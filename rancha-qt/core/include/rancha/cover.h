#pragma once
#include <string>
#include <string_view>

#include "rancha/color.h"

namespace rancha {

// The placeholder cover of an item without a picture: a diagonal gradient from its hue, plus the initials of its name.
struct CoverColors {
  Rgba top;     // upper left
  Rgba bottom;  // lower right
  Rgba glow;    // the light spot at the top
};
CoverColors coverColors(int hue);

// First letters of the first two words, in capitals ("Starfall Chronicles" -> "SC"; "Ünal" -> "Ü"). Works on UTF-8 text.
std::string initials(std::string_view name);

}  // namespace rancha
