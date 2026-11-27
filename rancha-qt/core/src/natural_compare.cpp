#include "rancha/natural_compare.h"

#include <cstddef>

namespace rancha {
namespace {

bool isDigit(char c) { return c >= '0' && c <= '9'; }

unsigned char fold(char c) {
  const auto u = static_cast<unsigned char>(c);
  return (u >= 'A' && u <= 'Z') ? static_cast<unsigned char>(u - 'A' + 'a') : u;
}

}  // namespace

int naturalCompare(std::string_view a, std::string_view b) {
  std::size_t i = 0;
  std::size_t j = 0;
  int zerosTieBreak = 0;  // "a01" vs "a1": equal in value; fewer leading zeros first, decided only if nothing else differs
  while (i < a.size() && j < b.size()) {
    if (isDigit(a[i]) && isDigit(b[j])) {
      std::size_t ai = i;
      std::size_t bj = j;
      while (ai < a.size() && a[ai] == '0') ++ai;
      while (bj < b.size() && b[bj] == '0') ++bj;
      std::size_t ae = ai;
      std::size_t be = bj;
      while (ae < a.size() && isDigit(a[ae])) ++ae;
      while (be < b.size() && isDigit(b[be])) ++be;
      const std::size_t aLen = ae - ai;
      const std::size_t bLen = be - bj;
      if (aLen != bLen) return aLen < bLen ? -1 : 1;  // more digits = bigger number
      for (std::size_t k = 0; k < aLen; ++k) {
        if (a[ai + k] != b[bj + k]) return a[ai + k] < b[bj + k] ? -1 : 1;
      }
      if (zerosTieBreak == 0) {
        const std::size_t aZeros = ai - i;
        const std::size_t bZeros = bj - j;
        if (aZeros != bZeros) zerosTieBreak = aZeros < bZeros ? -1 : 1;
      }
      i = ae;
      j = be;
    } else {
      const unsigned char x = fold(a[i]);
      const unsigned char y = fold(b[j]);
      if (x != y) return x < y ? -1 : 1;
      ++i;
      ++j;
    }
  }
  if (i < a.size()) return 1;   // a has more left
  if (j < b.size()) return -1;  // b has more left
  if (zerosTieBreak != 0) return zerosTieBreak;
  // Same ignoring case: keep the order stable and predictable (capital letters first).
  if (a == b) return 0;
  return a < b ? -1 : 1;
}

}  // namespace rancha
