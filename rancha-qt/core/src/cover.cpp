#include "rancha/cover.h"

#include <cstddef>
#include <vector>

namespace rancha {
namespace {

// The length in bytes of the UTF-8 character that starts with `lead` (1 for a stray byte).
std::size_t charLength(unsigned char lead) {
  if (lead < 0x80) return 1;
  if ((lead >> 5) == 0x6) return 2;
  if ((lead >> 4) == 0xE) return 3;
  if ((lead >> 3) == 0x1E) return 4;
  return 1;
}

bool isSpace(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r'; }

// Capital letters for ASCII; the common Latin-1/Latin Extended-A and Cyrillic/Greek lower-case letters are
// lifted too. Anything else is left as it is.
std::string upperChar(std::string_view c) {
  if (c.size() == 1) {
    const char ch = c[0];
    return std::string(1, (ch >= 'a' && ch <= 'z') ? static_cast<char>(ch - 'a' + 'A') : ch);
  }
  if (c.size() == 2) {
    const unsigned char a = static_cast<unsigned char>(c[0]);
    const unsigned char b = static_cast<unsigned char>(c[1]);
    const unsigned cp = ((a & 0x1Fu) << 6) | (b & 0x3Fu);
    unsigned up = cp;
    if ((cp >= 0xE0 && cp <= 0xFE && cp != 0xF7) || (cp >= 0x3B1 && cp <= 0x3C9 && cp != 0x3C2) || (cp >= 0x430 && cp <= 0x44F)) up = cp - 0x20;
    else if (cp >= 0x450 && cp <= 0x45F) up = cp - 0x50;
    else if (cp >= 0x100 && cp <= 0x17F && (cp % 2 == 1) && cp != 0x131 && cp != 0x138 && cp != 0x149) up = cp - 1;
    if (up != cp) {
      std::string out;
      out += static_cast<char>(0xC0 | (up >> 6));
      out += static_cast<char>(0x80 | (up & 0x3Fu));
      return out;
    }
  }
  return std::string(c);
}

}  // namespace

CoverColors coverColors(int hue) {
  CoverColors c;
  c.top = fromHsl(hue, 0.62, 0.42);
  c.bottom = fromHsl(hue + 38, 0.60, 0.20);
  c.glow = fromHsl(hue, 0.80, 0.62, 0.55);
  return c;
}

std::string initials(std::string_view name) {
  std::string out;
  std::size_t i = 0;
  int words = 0;
  while (i < name.size() && words < 2) {
    while (i < name.size() && isSpace(name[i])) ++i;
    if (i >= name.size()) break;
    std::size_t length = charLength(static_cast<unsigned char>(name[i]));
    if (i + length > name.size()) length = 1;
    out += upperChar(name.substr(i, length));
    ++words;
    while (i < name.size() && !isSpace(name[i])) ++i;
  }
  return out;
}

}  // namespace rancha
