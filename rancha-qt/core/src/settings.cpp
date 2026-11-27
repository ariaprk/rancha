// Port of src/shared/settings.ts, the sanitizer of src/shared/emulators.ts and src/main/settingsStore.ts.
// Every rule below copies a rule of the TypeScript code; the comments name the original where it is not obvious.
#include "rancha/settings.h"

#include <algorithm>
#include <cctype>
#include <optional>
#include <cmath>
#include <fstream>
#include <initializer_list>
#include <iterator>
#include <sstream>
#include <stdexcept>

#include "rancha/database.h"  // nowMs()

namespace rancha {

using nlohmann::json;
using nlohmann::ordered_json;

namespace {

// ---- UTF-8 helpers (JavaScript strings are UTF-16; settings.json is UTF-8) ----

bool isJsSpace(char32_t c) {
  // The characters String.prototype.trim removes (WhiteSpace and LineTerminator in ECMAScript).
  return (c >= 0x09 && c <= 0x0D) || c == 0x20 || c == 0xA0 || c == 0x1680 || (c >= 0x2000 && c <= 0x200A) ||
         c == 0x2028 || c == 0x2029 || c == 0x202F || c == 0x205F || c == 0x3000 || c == 0xFEFF;
}

// Decodes the code point that starts at `at`. Returns its length in bytes (0 = not valid UTF-8).
std::size_t decode(std::string_view text, std::size_t at, char32_t& out) {
  const auto byte = [&](std::size_t i) { return static_cast<unsigned char>(text[i]); };
  const unsigned char lead = byte(at);
  std::size_t length = 0;
  if (lead < 0x80) {
    out = lead;
    return 1;
  }
  if ((lead & 0xE0) == 0xC0) {
    length = 2;
    out = lead & 0x1F;
  } else if ((lead & 0xF0) == 0xE0) {
    length = 3;
    out = lead & 0x0F;
  } else if ((lead & 0xF8) == 0xF0) {
    length = 4;
    out = lead & 0x07;
  } else {
    return 0;
  }
  if (at + length > text.size()) return 0;
  for (std::size_t i = 1; i < length; ++i) {
    if ((byte(at + i) & 0xC0) != 0x80) return 0;
    out = (out << 6) | (byte(at + i) & 0x3F);
  }
  return length;
}

// ---- the small checkers of settings.ts ----

const json* field(const json& object, const char* key) {
  if (!object.is_object()) return nullptr;
  const auto it = object.find(key);
  return it == object.end() ? nullptr : &*it;
}

// pick(): a text value from the allowed list, otherwise the fallback.
std::string pick(const json* value, std::initializer_list<const char*> allowed, const std::string& fallback) {
  if (!value || !value->is_string()) return fallback;
  const auto& text = value->get_ref<const std::string&>();
  for (const char* option : allowed)
    if (text == option) return text;
  return fallback;
}

// JavaScript's Math.round (halves go up, also for negative numbers).
double jsRound(double value) {
  const double down = std::floor(value);
  return value - down >= 0.5 ? down + 1 : down;
}

// number(): a finite number, rounded, then kept inside the range.
int number(const json* value, int min, int max, int fallback) {
  if (!value || !value->is_number()) return fallback;
  const double raw = value->get<double>();
  if (!std::isfinite(raw)) return fallback;
  return static_cast<int>(std::clamp(jsRound(raw), static_cast<double>(min), static_cast<double>(max)));
}

bool boolean(const json* value, bool fallback) { return value && value->is_boolean() ? value->get<bool>() : fallback; }

bool isKnownColumn(std::string_view id) {
  return std::any_of(kMusicColumns.begin(), kMusicColumns.end(), [&](const char* c) { return id == c; });
}

// musicColumnList(): known columns only, each once, in the fixed order; the title is always kept
// (put FIRST when it was missing, as `['title', ...chosen]` does).
std::vector<std::string> musicColumnList(const json* value, const std::vector<std::string>& fallback) {
  if (!value || !value->is_array()) return fallback;
  std::vector<std::string> chosen;
  for (const char* id : kMusicColumns) {
    const bool wanted = std::any_of(value->begin(), value->end(), [&](const json& entry) {
      return entry.is_string() && entry.get_ref<const std::string&>() == id;
    });
    if (wanted) chosen.emplace_back(id);
  }
  if (std::find(chosen.begin(), chosen.end(), "title") == chosen.end()) chosen.insert(chosen.begin(), "title");
  return chosen;
}

// musicColumnWidthList(): known, resizable columns only, whole pixels inside the range.
std::map<std::string, int> musicColumnWidthList(const json* value, const std::map<std::string, int>& fallback) {
  if (!value || !value->is_object()) return fallback;
  std::map<std::string, int> widths;
  for (const char* id : kMusicColumns) {
    const json* width = field(*value, id);
    if (!isResizableColumn(id) || !width || !width->is_number()) continue;
    const double raw = width->get<double>();
    if (!std::isfinite(raw)) continue;
    widths[id] = static_cast<int>(std::clamp(jsRound(raw), static_cast<double>(kMusicColumnWidthRange.min),
                                             static_cast<double>(kMusicColumnWidthRange.max)));
  }
  return widths;
}

// musicSortValue(): an older file may hold null (the folder's own order, no longer offered).
MusicSort musicSortValue(const json* value, const MusicSort& fallback) {
  if (!value || !value->is_object()) return fallback;
  const json* column = field(*value, "column");
  if (!column || !column->is_string()) return fallback;
  const auto& id = column->get_ref<const std::string&>();
  if (!isKnownColumn(id) || id == "cover") return fallback;  // a picture cannot be sorted
  const json* desc = field(*value, "desc");
  return MusicSort{id, desc && desc->is_boolean() && desc->get<bool>()};
}

bool isAccent(const std::string& text) {
  if (text.size() != 7 || text[0] != '#') return false;
  return std::all_of(text.begin() + 1, text.end(), [](char c) { return std::isxdigit(static_cast<unsigned char>(c)) != 0; });
}

std::string lower(std::string text) {
  for (char& c : text) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return text;
}

bool onlyChars(const std::string& text, std::size_t max, std::string_view extra) {
  if (text.size() > max) return false;
  return std::all_of(text.begin(), text.end(), [&](char c) {
    return std::isalnum(static_cast<unsigned char>(c)) != 0 || extra.find(c) != std::string_view::npos;
  });
}

// STEAMGRIDDB_KEY_PATTERN = /^[A-Za-z0-9]{0,80}$/, TMDB_KEY_PATTERN = /^[A-Za-z0-9._-]{0,600}$/ (online.ts).
std::string apiKey(const json* value, std::size_t max, std::string_view extra, const std::string& fallback) {
  if (!value || !value->is_string()) return fallback;
  const std::string trimmed = jsTrim(value->get_ref<const std::string&>());
  return onlyChars(trimmed, max, extra) ? trimmed : fallback;
}

// ---- emulators.ts ----

// text(): a string of at most `max` characters with no NUL, CR or LF.
std::optional<std::string> profileText(const json* value, std::size_t max) {
  if (!value || !value->is_string()) return std::nullopt;
  const auto& text = value->get_ref<const std::string&>();
  if (jsLength(text) > max || text.find_first_of(std::string_view("\0\r\n", 3)) != std::string::npos) return std::nullopt;
  return text;
}

// EMULATOR_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/
bool isEmulatorId(const std::string& id) {
  if (id.empty() || id.size() > 40) return false;
  const auto ok = [](char c, bool first) { return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || (!first && c == '-'); };
  for (std::size_t i = 0; i < id.size(); ++i)
    if (!ok(id[i], i == 0)) return false;
  return true;
}

// /(^|[\\/])\.\.([\\/]|$)/ : a ".." part anywhere in the path.
bool hasParentPart(const std::string& path) {
  std::size_t start = 0;
  while (start <= path.size()) {
    const std::size_t end = path.find_first_of("\\/", start);
    const std::size_t stop = end == std::string::npos ? path.size() : end;
    if (path.compare(start, stop - start, "..") == 0 && stop - start == 2) return true;
    if (end == std::string::npos) break;
    start = end + 1;
  }
  return false;
}

// /^([A-Za-z]:|[\\/])/ : a drive letter or a leading slash.
bool isAbsoluteLike(const std::string& path) {
  if (!path.empty() && (path[0] == '/' || path[0] == '\\')) return true;
  return path.size() >= 2 && std::isalpha(static_cast<unsigned char>(path[0])) && path[1] == ':';
}

ordered_json emulatorJson(const EmulatorProfile& p) {
  ordered_json out;
  out["id"] = p.id;
  out["name"] = p.name;
  out["preset"] = p.preset;
  out["exe"] = p.exe;
  out["args"] = p.args;
  out["retroarch"] = p.retroarch;
  out["entry"] = p.entry;
  return out;
}

}  // namespace

// ---- public helpers ----

bool isResizableColumn(std::string_view column) { return column != "cover" && column != "title"; }

std::string jsTrim(std::string_view text) {
  std::size_t begin = 0;
  while (begin < text.size()) {
    char32_t c = 0;
    const std::size_t length = decode(text, begin, c);
    if (length == 0 || !isJsSpace(c)) break;
    begin += length;
  }
  std::size_t end = text.size();
  while (end > begin) {
    std::size_t start = end - 1;
    while (start > begin && (static_cast<unsigned char>(text[start]) & 0xC0) == 0x80) --start;
    char32_t c = 0;
    const std::size_t length = decode(text, start, c);
    if (length == 0 || start + length != end || !isJsSpace(c)) break;
    end = start;
  }
  return std::string(text.substr(begin, end - begin));
}

std::size_t jsLength(std::string_view text) {
  std::size_t units = 0;
  for (const char ch : text) {
    const auto byte = static_cast<unsigned char>(ch);
    if ((byte & 0xC0) == 0x80) continue;  // continuation byte
    units += byte >= 0xF0 ? 2 : 1;        // 4-byte characters are two UTF-16 units (a surrogate pair)
  }
  return units;
}

std::vector<EmulatorProfile> sanitizeEmulators(const json& raw, const std::vector<EmulatorProfile>& fallback) {
  if (!raw.is_array()) return fallback;
  std::vector<std::string> seen;
  std::vector<EmulatorProfile> result;
  std::size_t index = 0;
  for (const json& row : raw) {
    if (index++ >= kMaxEmulators) break;  // raw.slice(0, MAX_EMULATORS)
    if (!row.is_object()) continue;
    const auto id = profileText(field(row, "id"), 40);
    const auto name = profileText(field(row, "name"), 80);
    const auto exe = profileText(field(row, "exe"), 1000);
    const auto args = profileText(field(row, "args"), 1000);
    const auto preset = profileText(field(row, "preset"), 40);
    if (!id || !isEmulatorId(*id) || std::find(seen.begin(), seen.end(), *id) != seen.end()) continue;
    if (!name || jsTrim(*name).empty() || !exe || !args) continue;
    // As in the original, the id counts as used from here on, even when the main file below is refused.
    seen.push_back(*id);
    const json* entryValue = field(row, "entry");
    const auto mainFile = entryValue ? profileText(entryValue, 200) : std::optional<std::string>(std::string());
    if (!mainFile || hasParentPart(*mainFile) || isAbsoluteLike(*mainFile)) continue;  // relative paths only, never ".."
    const json* retroarch = field(row, "retroarch");
    result.push_back(EmulatorProfile{*id, jsTrim(*name), preset ? *preset : std::string("custom"), *exe, *args,
                                     retroarch && retroarch->is_boolean() && retroarch->get<bool>(), jsTrim(*mainFile)});
  }
  return result;
}

Settings sanitizeSettings(const json& raw, const Settings& base) {
  static const json empty = json::object();
  const json& input = raw.is_object() ? raw : empty;
  const auto f = [&](const char* key) { return field(input, key); };
  Settings s;
  s.theme = pick(f("theme"), {"dark", "light", "airy"}, base.theme);
  {
    const json* accent = f("accent");
    s.accent = accent && accent->is_string() && isAccent(accent->get_ref<const std::string&>())
                   ? lower(accent->get<std::string>())
                   : base.accent;
  }
  s.cardSize = number(f("cardSize"), kCardSizeRange.min, kCardSizeRange.max, base.cardSize);
  s.viewMode = pick(f("viewMode"), {"covers", "compact", "list"}, base.viewMode);
  s.sort = pick(f("sort"), {"custom", "name", "nameDesc", "added", "addedOld", "opened", "type"}, base.sort);
  s.motion = pick(f("motion"), {"full", "subtle", "off"}, base.motion);
  s.sidebarCollapsed = boolean(f("sidebarCollapsed"), base.sidebarCollapsed);
  s.uiScale = number(f("uiScale"), kUiScaleRange.min, kUiScaleRange.max, base.uiScale);
  s.corners = pick(f("corners"), {"sharp", "soft", "round"}, base.corners);
  s.glass = pick(f("glass"), {"off", "normal", "strong"}, base.glass);
  s.ambientGlow = boolean(f("ambientGlow"), base.ambientGlow);
  s.sounds = boolean(f("sounds"), base.sounds);
  s.autoBackup = boolean(f("autoBackup"), base.autoBackup);
  s.readerLayout = pick(f("readerLayout"), {"single", "double", "scroll"}, base.readerLayout);
  s.readerFit = pick(f("readerFit"), {"page", "width"}, base.readerFit);
  s.readerDirection = pick(f("readerDirection"), {"ltr", "rtl"}, base.readerDirection);
  {
    const json* emulators = f("emulators");
    s.emulators = emulators ? sanitizeEmulators(*emulators, base.emulators) : base.emulators;
  }
  s.iconTone = pick(f("iconTone"), {"accent", "white", "black", "colorful"}, base.iconTone);
  s.steamGridDbKey = apiKey(f("steamGridDbKey"), 80, "", base.steamGridDbKey);
  s.tmdbKey = apiKey(f("tmdbKey"), 600, "._-", base.tmdbKey);
  s.musicVolume = number(f("musicVolume"), 0, 100, base.musicVolume);
  s.musicOverlay = pick(f("musicOverlay"), {"hidden", "compact", "expanded"}, base.musicOverlay);
  s.musicCorner = pick(f("musicCorner"), {"top-left", "top-right", "bottom-left", "bottom-right"}, base.musicCorner);
  s.musicShuffle = boolean(f("musicShuffle"), base.musicShuffle);
  s.musicRepeat = pick(f("musicRepeat"), {"off", "all", "one"}, base.musicRepeat);
  s.musicAutoplayNext = boolean(f("musicAutoplayNext"), base.musicAutoplayNext);
  s.musicShowQueue = boolean(f("musicShowQueue"), base.musicShowQueue);
  s.musicColumns = musicColumnList(f("musicColumns"), base.musicColumns);
  s.musicSort = musicSortValue(f("musicSort"), base.musicSort);
  s.musicColumnWidths = musicColumnWidthList(f("musicColumnWidths"), base.musicColumnWidths);
  s.musicQueueWidth = number(f("musicQueueWidth"), kMusicQueueRange.min, kMusicQueueRange.max, base.musicQueueWidth);
  s.musicNowWidth = number(f("musicNowWidth"), kMusicNowRange.min, kMusicNowRange.max, base.musicNowWidth);
  return s;
}

ordered_json toJson(const Settings& s) {
  ordered_json out;
  out["theme"] = s.theme;
  out["accent"] = s.accent;
  out["cardSize"] = s.cardSize;
  out["viewMode"] = s.viewMode;
  out["sort"] = s.sort;
  out["motion"] = s.motion;
  out["sidebarCollapsed"] = s.sidebarCollapsed;
  out["uiScale"] = s.uiScale;
  out["corners"] = s.corners;
  out["glass"] = s.glass;
  out["ambientGlow"] = s.ambientGlow;
  out["sounds"] = s.sounds;
  out["autoBackup"] = s.autoBackup;
  out["readerLayout"] = s.readerLayout;
  out["readerFit"] = s.readerFit;
  out["readerDirection"] = s.readerDirection;
  out["emulators"] = ordered_json::array();
  for (const auto& profile : s.emulators) out["emulators"].push_back(emulatorJson(profile));
  out["iconTone"] = s.iconTone;
  out["steamGridDbKey"] = s.steamGridDbKey;
  out["tmdbKey"] = s.tmdbKey;
  out["musicVolume"] = s.musicVolume;
  out["musicOverlay"] = s.musicOverlay;
  out["musicCorner"] = s.musicCorner;
  out["musicShuffle"] = s.musicShuffle;
  out["musicRepeat"] = s.musicRepeat;
  out["musicAutoplayNext"] = s.musicAutoplayNext;
  out["musicShowQueue"] = s.musicShowQueue;
  out["musicColumns"] = s.musicColumns;
  out["musicSort"] = ordered_json{{"column", s.musicSort.column}, {"desc", s.musicSort.desc}};
  out["musicColumnWidths"] = ordered_json::object();
  for (const char* id : kMusicColumns)  // the column order, as the original builds the object
    if (const auto it = s.musicColumnWidths.find(id); it != s.musicColumnWidths.end()) out["musicColumnWidths"][id] = it->second;
  out["musicQueueWidth"] = s.musicQueueWidth;
  out["musicNowWidth"] = s.musicNowWidth;
  return out;
}

// ---- SettingsStore ----

SettingsStore::SettingsStore(std::filesystem::path file) : file_(std::move(file)) {
  std::error_code error;
  if (std::filesystem::exists(file_, error)) {
    try {
      std::ifstream in(file_, std::ios::binary);
      if (!in) throw std::runtime_error("unreadable");
      const std::string text((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
      current_ = sanitizeSettings(json::parse(text));
      existed_ = true;
    } catch (const std::exception&) {
      // Unreadable or damaged: keep it for inspection, start from the defaults.
      // file.replace(/\.json$/, `.damaged-${Date.now()}.json`)
      std::string name = file_.filename().string();
      const std::string ending = ".json";
      if (name.size() >= ending.size() && name.compare(name.size() - ending.size(), ending.size(), ending) == 0) {
        name = name.substr(0, name.size() - ending.size()) + ".damaged-" + std::to_string(db::nowMs()) + ".json";
        std::filesystem::rename(file_, file_.parent_path() / name, error);  // if it fails, the next save overwrites it
      }
      current_ = Settings{};
      existed_ = false;
    }
  }
}

const Settings& SettingsStore::update(const json& patch) {
  if (!patch.is_object()) throw std::invalid_argument("Invalid request.");
  // { ...current, ...patch }: a top-level merge (a nested object in the patch replaces the whole field).
  json merged = json::parse(toJson(current_).dump());
  for (const auto& [key, value] : patch.items()) merged[key] = value;
  current_ = sanitizeSettings(merged, current_);
  save();
  return current_;
}

const Settings& SettingsStore::reset() {
  // The backup choice, the API keys and the emulators survive a reset of the look and feel.
  Settings fresh;
  fresh.autoBackup = current_.autoBackup;
  fresh.steamGridDbKey = current_.steamGridDbKey;
  fresh.tmdbKey = current_.tmdbKey;
  fresh.emulators = current_.emulators;
  current_ = std::move(fresh);
  save();
  return current_;
}

void SettingsStore::save() const {
  if (file_.has_parent_path()) std::filesystem::create_directories(file_.parent_path());
  auto temporary = file_;
  temporary += ".tmp";
  {
    std::ofstream out(temporary, std::ios::binary | std::ios::trunc);
    out << toJson(current_).dump(2);  // JSON.stringify(settings, null, 2): two spaces, no newline at the end
    out.close();
    if (!out) throw std::runtime_error("Could not save the settings.");
  }
  std::filesystem::rename(temporary, file_);  // replaces the old file in one step
}

}  // namespace rancha
