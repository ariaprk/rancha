#pragma once
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

namespace rancha {

// A color with transparency (a: 0 = invisible, 1 = solid).
struct Rgba {
  std::uint8_t r = 0;
  std::uint8_t g = 0;
  std::uint8_t b = 0;
  double a = 1.0;
  bool operator==(const Rgba& o) const { return r == o.r && g == o.g && b == o.b && a == o.a; }
};

// "#rrggbb" (any case) -> color; nothing when the text is not exactly that.
std::optional<Rgba> parseHex(std::string_view text);
// color -> "#rrggbb" (lower case; transparency is not part of it)
std::string toHex(const Rgba& color);
// h in degrees (any number; wraps around), s and l from 0 to 1 (like CSS hsl()).
Rgba fromHsl(double h, double s, double l, double a = 1.0);
// Moves `from` toward `to` by `amount` (0 = unchanged, 1 = fully `to`); transparency stays that of `from`.
Rgba mixColors(const Rgba& from, const Rgba& to, double amount);

}  // namespace rancha
