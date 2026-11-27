#include <algorithm>
#include <string>
#include <vector>

#include "check.h"
#include "rancha/natural_compare.h"

using rancha::naturalCompare;

void testNaturalCompare() {
  CHECK(naturalCompare("Episode 2", "Episode 10") < 0);
  CHECK(naturalCompare("Episode 10", "Episode 2") > 0);
  CHECK(naturalCompare("a", "a") == 0);
  CHECK(naturalCompare("", "") == 0);
  CHECK(naturalCompare("", "a") < 0);
  CHECK(naturalCompare("abc", "ABD") < 0);        // letters ignore case
  CHECK(naturalCompare("File 007", "File 7") > 0);  // same value: fewer leading zeros first
  CHECK(naturalCompare("File 7", "File 007") < 0);
  CHECK(naturalCompare("File 08", "File 9") < 0);
  CHECK(naturalCompare("x1y2", "x1y10") < 0);
  CHECK(naturalCompare("a", "A") > 0);             // equal ignoring case: capital first, stable
  CHECK(naturalCompare("A", "a") < 0);
  CHECK(naturalCompare("123456789012345678901234567890", "123456789012345678901234567891") < 0);  // longer than any integer type
  CHECK(naturalCompare("ep1", "ep1b") < 0);

  std::vector<std::string> names = {"Ep 10", "Ep 2", "Ep 1", "ep 3", "Ep 20", "Ep 11"};
  std::sort(names.begin(), names.end(), [](const std::string& a, const std::string& b) { return naturalCompare(a, b) < 0; });
  const std::vector<std::string> expected = {"Ep 1", "Ep 2", "ep 3", "Ep 10", "Ep 11", "Ep 20"};
  CHECK(names == expected);

  // A strict ordering: never both a<b and b<a.
  const std::vector<std::string> samples = {"", "a", "A", "a1", "a01", "a10", "a2", "b", "ä", "10", "9"};
  for (const auto& x : samples) {
    for (const auto& y : samples) {
      CHECK(!(naturalCompare(x, y) < 0 && naturalCompare(y, x) < 0));
      CHECK((naturalCompare(x, y) < 0) == (naturalCompare(y, x) > 0));
    }
  }
}
