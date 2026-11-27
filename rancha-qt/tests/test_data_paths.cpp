// The data folder must be the Electron app's folder (see core/include/rancha/data_paths.h).
#include <filesystem>
#include <string>

#include "check.h"
#include "rancha/data_paths.h"

namespace fs = std::filesystem;

void testDataPaths() {
  using rancha::appDataFolder;
#ifdef _WIN32
  CHECK(appDataFolder(fs::path("C:/Users/a/AppData/Roaming"), std::nullopt, std::nullopt) == fs::path("C:/Users/a/AppData/Roaming"));
  CHECK(appDataFolder(std::nullopt, fs::path("x"), fs::path("y")).empty());
#else
  CHECK(appDataFolder(std::nullopt, std::nullopt, fs::path("/home/a")) == fs::path("/home/a/.config"));
  CHECK(appDataFolder(std::nullopt, fs::path("/xdg"), fs::path("/home/a")) == fs::path("/xdg"));
  CHECK(appDataFolder(std::nullopt, fs::path(""), fs::path("/home/a")) == fs::path("/home/a/.config"));  // empty = not set
  CHECK(appDataFolder(fs::path("C:/ignored"), std::nullopt, std::nullopt).empty());
#endif
  const rancha::DataPaths paths{fs::path("/d/rancha")};
  CHECK(paths.library() == fs::path("/d/rancha/library.db"));
  CHECK(paths.settings() == fs::path("/d/rancha/settings.json"));
  CHECK(paths.covers() == fs::path("/d/rancha/covers"));
  CHECK(paths.backups() == fs::path("/d/rancha/backups"));
  CHECK(std::string(rancha::kAppId) == "rancha");
  // The real folder of this PC ends in ".../rancha" (lower case).
  CHECK(rancha::dataPaths().root.filename() == fs::path("rancha"));
}
