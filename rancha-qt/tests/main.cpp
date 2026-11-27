#include <cstdio>

#include "check.h"

void testNaturalCompare();
void testColorTheme();
void testLibraryView();
void testLibraryQuery();
void testNavHistory();
void testSelection();
void testCropMath();
void testFileKinds();
void testLaunch();
void testFolderScan();
void testReorderMath();
void testCoverStore();
void testDatabase();
void testDataPaths();
void testSettings();
void testItemRepository();

int main() {
  testNaturalCompare();
  testColorTheme();
  testLibraryView();
  testLibraryQuery();
  testNavHistory();
  testSelection();
  testCropMath();
  testFileKinds();
  testLaunch();
  testFolderScan();
  testReorderMath();
  testCoverStore();
  testDatabase();
  testDataPaths();
  testSettings();
  testItemRepository();
  std::printf("%d checks, %d failed\n", testing::checks(), testing::failures());
  return testing::failures() == 0 ? 0 : 1;
}
