// Tests for the settings port (core/src/settings.cpp): the same rules as sanitizeSettings,
// sanitizeEmulators and SettingsStore in the Electron app.
#include <filesystem>
#include <fstream>
#include <iterator>
#include <random>
#include <string>

#include "check.h"
#include "rancha/settings.h"

namespace fs = std::filesystem;
using nlohmann::json;
using rancha::Settings;
using rancha::sanitizeSettings;

namespace {

fs::path freshFolder() {
  std::random_device device;
  const auto folder = fs::temp_directory_path() / ("rancha-settings-test-" + std::to_string(device()));
  fs::remove_all(folder);
  fs::create_directories(folder);
  return folder;
}

std::string readAll(const fs::path& file) {
  std::ifstream in(file, std::ios::binary);
  return std::string((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
}

void writeAll(const fs::path& file, const std::string& text) {
  std::ofstream out(file, std::ios::binary | std::ios::trunc);
  out << text;
}

void testDefaultsAndGarbage() {
  const Settings defaults;
  CHECK(sanitizeSettings(json(nullptr)) == defaults);
  CHECK(sanitizeSettings(json::array({1, 2})) == defaults);
  CHECK(sanitizeSettings(json("text")) == defaults);
  CHECK(sanitizeSettings(json::object()) == defaults);
  CHECK(defaults.musicColumns == (std::vector<std::string>{"cover", "title", "artist", "album", "duration"}));
  CHECK(defaults.musicSort.column == "title" && !defaults.musicSort.desc);
  // Every field wrong: everything stays at its default.
  const json bad = {{"theme", "purple"}, {"accent", "#12345"}, {"cardSize", "big"}, {"viewMode", 3},
                    {"sidebarCollapsed", 1}, {"uiScale", nullptr}, {"emulators", "x"}, {"musicSort", nullptr},
                    {"musicColumns", "title"}, {"musicColumnWidths", json::array()}, {"steamGridDbKey", "has space"},
                    {"tmdbKey", "bad!"}};
  CHECK(sanitizeSettings(bad) == defaults);
}

void testValues() {
  const json input = {{"theme", "airy"}, {"accent", "#ABCDEF"}, {"cardSize", 999}, {"uiScale", 79.6},
                      {"musicVolume", -3}, {"musicQueueWidth", 300.5}, {"musicNowWidth", 10},
                      {"sort", "nameDesc"}, {"readerDirection", "rtl"}, {"musicRepeat", "one"},
                      {"steamGridDbKey", "  abc123  "}, {"tmdbKey", " eyJ.a_b-c "}};
  const Settings s = sanitizeSettings(input);
  CHECK(s.theme == "airy");
  CHECK(s.accent == "#abcdef");  // lower case
  CHECK(s.cardSize == 260);      // kept inside the range
  CHECK(s.uiScale == 80);        // 79.6 rounds to 80
  CHECK(s.musicVolume == 0);
  CHECK(s.musicQueueWidth == 301);  // Math.round(300.5) = 301
  CHECK(s.musicNowWidth == 260);
  CHECK(s.sort == "nameDesc");
  CHECK(s.readerDirection == "rtl");
  CHECK(s.musicRepeat == "one");
  CHECK(s.steamGridDbKey == "abc123");  // trimmed
  CHECK(s.tmdbKey == "eyJ.a_b-c");
  CHECK(sanitizeSettings(json{{"steamGridDbKey", std::string(81, 'a')}}).steamGridDbKey.empty());  // too long
  CHECK(sanitizeSettings(json{{"steamGridDbKey", std::string(80, 'a')}}).steamGridDbKey.size() == 80);
  // A missing value keeps the BASE value, not the default.
  Settings base;
  base.theme = "light";
  CHECK(sanitizeSettings(json{{"theme", "nope"}}, base).theme == "light");
}

void testMusicFields() {
  // Columns: known only, once, in the fixed order; the title is put first when missing.
  CHECK(sanitizeSettings(json{{"musicColumns", {"duration", "artist", "x", "artist"}}}).musicColumns ==
        (std::vector<std::string>{"title", "artist", "duration"}));
  CHECK(sanitizeSettings(json{{"musicColumns", {"tags", "title", "cover"}}}).musicColumns ==
        (std::vector<std::string>{"cover", "title", "tags"}));
  CHECK(sanitizeSettings(json{{"musicColumns", json::array()}}).musicColumns == (std::vector<std::string>{"title"}));
  // Sort: the picture cannot be sorted, null (old file) gives the fallback, desc only when exactly true.
  CHECK(sanitizeSettings(json{{"musicSort", {{"column", "cover"}, {"desc", true}}}}).musicSort.column == "title");
  CHECK(sanitizeSettings(json{{"musicSort", {{"column", "year"}, {"desc", true}}}}).musicSort ==
        (rancha::MusicSort{"year", true}));
  CHECK(sanitizeSettings(json{{"musicSort", {{"column", "year"}, {"desc", 1}}}}).musicSort ==
        (rancha::MusicSort{"year", false}));
  // Widths: resizable known columns only, rounded and kept inside 40..800.
  const auto widths = sanitizeSettings(json{{"musicColumnWidths",
                                             {{"artist", 10}, {"album", 900}, {"year", 99.5}, {"title", 300},
                                              {"cover", 50}, {"nope", 100}, {"genre", "wide"}}}})
                          .musicColumnWidths;
  CHECK(widths == (std::map<std::string, int>{{"artist", 40}, {"album", 800}, {"year", 100}}));
}

void testEmulators() {
  const json list = json::array({
      {{"id", "retro"}, {"name", "  RetroArch "}, {"exe", "/usr/bin/retroarch"}, {"args", "-L {core} {rom}"},
       {"retroarch", true}, {"preset", "retroarch"}},
      {{"id", "retro"}, {"name", "Again"}, {"exe", "x"}, {"args", ""}},                  // same id: dropped
      {{"id", "Bad"}, {"name", "Upper"}, {"exe", "x"}, {"args", ""}},                    // id pattern
      {{"id", "-x"}, {"name", "Dash"}, {"exe", "x"}, {"args", ""}},                      // id pattern
      {{"id", "blank"}, {"name", "   "}, {"exe", "x"}, {"args", ""}},                    // empty name
      {{"id", "nl"}, {"name", "A\nB"}, {"exe", "x"}, {"args", ""}},                      // line break
      {{"id", "cemu"}, {"name", "Cemu"}, {"exe", "C:/cemu.exe"}, {"args", "-g {rom}"}, {"entry", " code\\*.rpx "}},
      {{"id", "up"}, {"name", "Up"}, {"exe", "x"}, {"args", ""}, {"entry", "a/../b"}},  // ".." refused
      {{"id", "abs"}, {"name", "Abs"}, {"exe", "x"}, {"args", ""}, {"entry", "C:\\x"}},  // absolute refused
      {{"id", "noargs"}, {"name", "No args"}, {"exe", "x"}},                              // args missing
      42,
  });
  const auto profiles = rancha::sanitizeEmulators(list, {});
  CHECK(profiles.size() == 2);
  if (profiles.size() == 2) {
    CHECK(profiles[0].name == "RetroArch");
    CHECK(profiles[0].retroarch);
    CHECK(profiles[0].preset == "retroarch");
    CHECK(profiles[0].entry.empty());
    CHECK(profiles[1].id == "cemu");
    CHECK(profiles[1].preset == "custom");
    CHECK(!profiles[1].retroarch);
    CHECK(profiles[1].entry == "code\\*.rpx");  // trimmed
  }
  // Not a list: the fallback. More than 30: only the first 30 are looked at.
  CHECK(rancha::sanitizeEmulators(json::object(), profiles) == profiles);
  json many = json::array();
  for (int i = 0; i < 35; ++i)
    many.push_back({{"id", "e" + std::to_string(i)}, {"name", "E"}, {"exe", "x"}, {"args", ""}});
  CHECK(rancha::sanitizeEmulators(many, {}).size() == 30);
  // The name limit counts characters as JavaScript does: 80 Persian letters are fine, 81 are not.
  std::string persian;
  for (int i = 0; i < 80; ++i) persian += "\xd8\xa2";  // "آ"
  CHECK(rancha::sanitizeEmulators(json::array({{{"id", "p"}, {"name", persian}, {"exe", "x"}, {"args", ""}}}), {}).size() == 1);
  CHECK(rancha::sanitizeEmulators(json::array({{{"id", "p"}, {"name", persian + "\xd8\xa2"}, {"exe", "x"}, {"args", ""}}}), {}).empty());
}

void testTrim() {
  CHECK(rancha::jsTrim("  a b  ") == "a b");
  CHECK(rancha::jsTrim("\xc2\xa0x\xe3\x80\x80") == "x");  // no-break space and ideographic space
  CHECK(rancha::jsTrim("\xd8\xb3\xd9\x84\xd8\xa7\xd9\x85") == "\xd8\xb3\xd9\x84\xd8\xa7\xd9\x85");  // Persian text untouched
  CHECK(rancha::jsTrim("   ").empty());
  CHECK(rancha::jsLength("abc") == 3);
  CHECK(rancha::jsLength("\xf0\x9f\x8e\xae") == 2);  // an emoji is two UTF-16 units
}

void testStore() {
  const auto folder = freshFolder();
  const auto file = folder / "settings.json";
  {
    rancha::SettingsStore store(file);
    CHECK(!store.existed());
    CHECK(store.get() == Settings{});
    CHECK(!fs::exists(file));  // nothing is written until something changes
    store.update(json{{"theme", "light"}, {"cardSize", 200}, {"musicColumnWidths", {{"artist", 120}}}});
    CHECK(store.get().theme == "light");
    CHECK(fs::exists(file));
    CHECK(!fs::exists(folder / "settings.json.tmp"));
    // A nested object replaces the whole field (a top-level merge, as { ...current, ...patch }).
    store.update(json{{"musicColumnWidths", {{"album", 90}}}});
    CHECK(store.get().musicColumnWidths == (std::map<std::string, int>{{"album", 90}}));
    // Invalid values in a patch are ignored, the rest is applied.
    store.update(json{{"theme", "neon"}, {"motion", "off"}});
    CHECK(store.get().theme == "light");
    CHECK(store.get().motion == "off");
    bool refused = false;
    try {
      store.update(json::array());
    } catch (const std::invalid_argument&) {
      refused = true;
    }
    CHECK(refused);
  }
  {
    rancha::SettingsStore store(file);
    CHECK(store.existed());
    CHECK(store.get().theme == "light");
    CHECK(store.get().cardSize == 200);
    // reset keeps the backup choice, the keys and the emulators.
    store.update(json{{"autoBackup", false}, {"tmdbKey", "k1"},
                      {"emulators", json::array({{{"id", "e"}, {"name", "E"}, {"exe", "x"}, {"args", ""}}})}});
    store.reset();
    CHECK(store.get().theme == "dark");
    CHECK(!store.get().autoBackup);
    CHECK(store.get().tmdbKey == "k1");
    CHECK(store.get().emulators.size() == 1);
  }
  // A damaged file is moved aside as settings.damaged-<time>.json and the defaults are used.
  writeAll(file, "{ not json");
  {
    rancha::SettingsStore store(file);
    CHECK(!store.existed());
    CHECK(store.get() == Settings{});
    CHECK(!fs::exists(file));
    int damaged = 0;
    for (const auto& entry : fs::directory_iterator(folder)) {
      const std::string name = entry.path().filename().string();
      if (name.rfind("settings.damaged-", 0) == 0 && name.size() > 5 && name.substr(name.size() - 5) == ".json") ++damaged;
    }
    CHECK(damaged == 1);
  }
  fs::remove_all(folder);
}

void testFileFormat() {
  // The file looks exactly like JSON.stringify(settings, null, 2): same order, two spaces, no newline at the end.
  const auto folder = freshFolder();
  const auto file = folder / "settings.json";
  {
    rancha::SettingsStore store(file);
    store.update(json{{"musicColumnWidths", {{"year", 70}, {"artist", 150}}}});
  }
  const std::string text = readAll(file);
  CHECK(text.rfind("{\n  \"theme\": \"dark\",\n  \"accent\": \"#6c8cff\",\n  \"cardSize\": 170,", 0) == 0);
  CHECK(text.find("\"emulators\": [],") != std::string::npos);
  CHECK(text.find("\"musicColumnWidths\": {\n    \"artist\": 150,\n    \"year\": 70\n  },") != std::string::npos);
  CHECK(text.find("\"musicSort\": {\n    \"column\": \"title\",\n    \"desc\": false\n  },") != std::string::npos);
  CHECK(text.size() > 2 && text.substr(text.size() - 2) == "\n}");
  fs::remove_all(folder);
}

}  // namespace

void testSettings() {
  testDefaultsAndGarbage();
  testValues();
  testMusicFields();
  testEmulators();
  testTrim();
  testStore();
  testFileFormat();
}
