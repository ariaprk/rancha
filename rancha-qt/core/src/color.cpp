#include "rancha/color.h"

#include <algorithm>
#include <cmath>

namespace rancha {
namespace {

int hexValue(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

std::uint8_t toByte(double v) { return static_cast<std::uint8_t>(std::lround(std::clamp(v, 0.0, 255.0))); }

}  // namespace

std::optional<Rgba> parseHex(std::string_view text) {
  if (text.size() != 7 || text[0] != '#') return std::nullopt;
  int v[6];
  for (int i = 0; i < 6; ++i) {
    v[i] = hexValue(text[static_cast<std::size_t>(i) + 1]);
    if (v[i] < 0) return std::nullopt;
  }
  Rgba color;
  color.r = static_cast<std::uint8_t>(v[0] * 16 + v[1]);
  color.g = static_cast<std::uint8_t>(v[2] * 16 + v[3]);
  color.b = static_cast<std::uint8_t>(v[4] * 16 + v[5]);
  return color;
}

std::string toHex(const Rgba& color) {
  static const char* digits = "0123456789abcdef";
  std::string out = "#";
  for (const std::uint8_t part : {color.r, color.g, color.b}) {
    out += digits[part >> 4];
    out += digits[part & 15];
  }
  return out;
}

Rgba fromHsl(double h, double s, double l, double a) {
  h = std::fmod(h, 360.0);
  if (h < 0) h += 360.0;
  s = std::clamp(s, 0.0, 1.0);
  l = std::clamp(l, 0.0, 1.0);
  const double c = (1.0 - std::fabs(2.0 * l - 1.0)) * s;
  const double x = c * (1.0 - std::fabs(std::fmod(h / 60.0, 2.0) - 1.0));
  const double m = l - c / 2.0;
  double r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  Rgba out;
  out.r = toByte((r + m) * 255.0);
  out.g = toByte((g + m) * 255.0);
  out.b = toByte((b + m) * 255.0);
  out.a = a;
  return out;
}

Rgba mixColors(const Rgba& from, const Rgba& to, double amount) {
  amount = std::clamp(amount, 0.0, 1.0);
  Rgba out = from;
  out.r = toByte(from.r + (to.r - from.r) * amount);
  out.g = toByte(from.g + (to.g - from.g) * amount);
  out.b = toByte(from.b + (to.b - from.b) * amount);
  return out;
}

}  // namespace rancha
