#pragma once
#include <string_view>

namespace rancha {

// "Natural" comparison for names: numbers inside the text are compared by value, so "Episode 2" comes before
// "Episode 10"; letters are compared ignoring case (ASCII); other bytes (UTF-8 text) are compared as they are.
// Returns a negative number, zero or a positive number. Used for sorting names in the library.
int naturalCompare(std::string_view a, std::string_view b);

}  // namespace rancha
