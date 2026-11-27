#include <cstdio>

#include "check.h"

void testNaturalCompare();
void testColorTheme();
void testLibraryView();
void testDatabase();
void testDataPaths();
void testSettings();
void testItemRepository();

int main() {
  testNaturalCompare();
  testColorTheme();
  testLibraryView();
  testDatabase();
  testDataPaths();
  testSettings();
  testItemRepository();
  std::printf("%d checks, %d failed\n", testing::checks(), testing::failures());
  return testing::failures() == 0 ? 0 : 1;
}
