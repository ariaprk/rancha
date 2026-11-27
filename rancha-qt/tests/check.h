#pragma once
// A tiny test helper (no outside library): CHECK(condition) counts failures and prints where they are.
#include <cstdio>

namespace testing {
inline int& failures() {
  static int count = 0;
  return count;
}
inline int& checks() {
  static int count = 0;
  return count;
}
}  // namespace testing

#define CHECK(condition)                                                                  \
  do {                                                                                    \
    ++testing::checks();                                                                  \
    if (!(condition)) {                                                                   \
      ++testing::failures();                                                              \
      std::fprintf(stderr, "FAILED %s:%d: %s\n", __FILE__, __LINE__, #condition);         \
    }                                                                                     \
  } while (false)
