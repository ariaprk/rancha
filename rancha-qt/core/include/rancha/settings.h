#pragma once
// SETTINGS: the user's preferences, their defaults, and a checker that turns ANYTHING
// (a damaged file, a hand-edited value, an old version) into a valid set of settings.
//
// Port of src/shared/settings.ts (sanitizeSettings), src/shared/emulators.ts (sanitizeEmulators)
// and src/main/settingsStore.ts. settings.json must stay readable by both apps, so the field
// names, allowed values, ranges and defaults are the same. Choice fields are kept as their text
// value ("dark", "covers"...), exactly as they are written in the file.
#include <array>
#include <cstdint>
#include <filesystem>
#include <map>
#include <string>
#include <string_view>
#include <vector>

#include <nlohmann/json.hpp>

namespace rancha {

/// The columns the Music section's song list can show, always in this order.
inline constexpr std::array<const char*, 13> kMusicColumns{
    "cover", "title", "artist", "album", "albumArtist", "year", "genre",
    "track", "disc", "duration", "fileName", "added", "tags"};

struct Range {
  int min;
  int max;
};
inline constexpr Range kCardSizeRange{110, 260};
inline constexpr Range kUiScaleRange{80, 140};
inline constexpr Range kMusicQueueRange{180, 560};
inline constexpr Range kMusicNowRange{260, 640};
inline constexpr Range kMusicColumnWidthRange{40, 800};
inline constexpr std::size_t kMaxEmulators = 30;

/// All columns but the picture and the title can be made wider or narrower.
bool isResizableColumn(std::string_view column);

struct EmulatorProfile {
  std::string id;      // lowercase letters, digits and dashes
  std::string name;
  std::string preset;  // id of the preset it was made from ("custom" for none)
  std::string exe;     // full path of the emulator program
  std::string args;    // command-line template: {rom}, {core}, {romdir}, {romname}
  bool retroarch = false;
  std::string entry;   // games kept as folders: the main file inside ("" = the folder itself)
  bool operator==(const EmulatorProfile&) const = default;
};

struct MusicSort {
  std::string column = "title";
  bool desc = false;
  bool operator==(const MusicSort&) const = default;
};

struct Settings {
  std::string theme = "dark";  // dark | light | airy
  std::string accent = "#6c8cff";
  int cardSize = 170;
  std::string viewMode = "covers";  // covers | compact | list
  std::string sort = "custom";      // custom | name | nameDesc | added | addedOld | opened | type
  std::string motion = "full";      // full | subtle | off
  bool sidebarCollapsed = false;
  int uiScale = 100;
  std::string corners = "soft";  // sharp | soft | round
  std::string glass = "normal";  // off | normal | strong
  bool ambientGlow = true;
  bool sounds = false;
  bool autoBackup = true;
  std::string readerLayout = "single";  // single | double | scroll
  std::string readerFit = "page";       // page | width
  std::string readerDirection = "ltr";  // ltr | rtl
  std::vector<EmulatorProfile> emulators;
  std::string iconTone = "accent";  // accent | white | black | colorful
  std::string steamGridDbKey;
  std::string tmdbKey;
  int musicVolume = 70;
  std::string musicOverlay = "compact";      // hidden | compact | expanded
  std::string musicCorner = "bottom-right";  // top-left | top-right | bottom-left | bottom-right
  bool musicShuffle = false;
  std::string musicRepeat = "off";  // off | all | one
  bool musicAutoplayNext = true;
  bool musicShowQueue = true;
  std::vector<std::string> musicColumns{"cover", "title", "artist", "album", "duration"};
  MusicSort musicSort;
  std::map<std::string, int> musicColumnWidths;  // only columns the user resized
  int musicQueueWidth = 260;
  int musicNowWidth = 360;
  bool operator==(const Settings&) const = default;
};

/// Valid emulator profiles from anything; invalid ones are dropped (sanitizeEmulators).
std::vector<EmulatorProfile> sanitizeEmulators(const nlohmann::json& raw, const std::vector<EmulatorProfile>& fallback);

/// Builds valid settings from unknown input. Every missing or invalid field keeps its value from `base`.
Settings sanitizeSettings(const nlohmann::json& raw, const Settings& base = Settings{});

/// The settings as JSON, fields in the same order as the Electron app writes them.
nlohmann::ordered_json toJson(const Settings& settings);

/// JavaScript's String.prototype.trim for UTF-8 text (ASCII and Unicode white space).
std::string jsTrim(std::string_view text);
/// The length JavaScript would report (UTF-16 code units) for UTF-8 text.
std::size_t jsLength(std::string_view text);

/// settings.json in the data folder. Saved safely: first to "<file>.tmp", then renamed.
class SettingsStore {
 public:
  explicit SettingsStore(std::filesystem::path file);

  const Settings& get() const { return current_; }
  /// False when there was no usable file (first run, or a damaged file moved aside).
  bool existed() const { return existed_; }

  /// Applies a partial change (a JSON object; invalid values are ignored) and saves it.
  /// Throws std::invalid_argument("Invalid request.") when the patch is not an object.
  const Settings& update(const nlohmann::json& patch);
  /// Back to the defaults, but keeps the backup choice, the API keys and the emulators.
  const Settings& reset();

 private:
  void save() const;
  std::filesystem::path file_;
  Settings current_;
  bool existed_ = false;
};

}  // namespace rancha
