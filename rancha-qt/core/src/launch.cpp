#include "rancha/launch.h"

#include <cctype>
#include <cmath>
#include <stdexcept>
#include <unordered_map>

namespace rancha {
namespace {

bool isSpace(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v'; }

std::string trim(std::string_view text) {
  std::size_t from = 0;
  std::size_t to = text.size();
  while (from < to && isSpace(text[from])) ++from;
  while (to > from && isSpace(text[to - 1])) --to;
  return std::string(text.substr(from, to - from));
}

std::string lower(std::string_view text) {
  std::string out(text);
  for (char& c : out) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return out;
}

bool startsWithNoCase(std::string_view text, std::string_view prefix) {
  return text.size() >= prefix.size() && lower(text.substr(0, prefix.size())) == prefix;
}

/// text.split(/\r?\n/)
std::vector<std::string_view> lines(std::string_view text) {
  std::vector<std::string_view> out;
  std::size_t start = 0;
  while (true) {
    const std::size_t end = text.find('\n', start);
    std::string_view line = text.substr(start, end == std::string_view::npos ? std::string_view::npos : end - start);
    if (!line.empty() && line.back() == '\r') line.remove_suffix(1);
    out.push_back(line);
    if (end == std::string_view::npos) break;
    start = end + 1;
  }
  return out;
}

/// /^(steam|https?):\/\//i
bool isAllowedLink(std::string_view link) {
  return startsWithNoCase(link, "steam://") || startsWithNoCase(link, "http://") || startsWithNoCase(link, "https://");
}

LaunchPlan error(std::string message) {
  LaunchPlan plan;
  plan.type = LaunchPlan::Type::Error;
  plan.message = std::move(message);
  return plan;
}

LaunchPlan spawn(std::string command, std::vector<std::string> args, std::string cwd) {
  LaunchPlan plan;
  plan.type = LaunchPlan::Type::Spawn;
  plan.command = std::move(command);
  plan.args = std::move(args);
  plan.cwd = std::move(cwd);
  return plan;
}

LaunchPlan openWithSystem(const std::string& path) {
  LaunchPlan plan;
  plan.type = LaunchPlan::Type::Open;
  plan.path = path;
  return plan;
}

constexpr std::int64_t kDayMs = 24LL * 60 * 60 * 1000;

std::int64_t floorDiv(std::int64_t a, std::int64_t b) {
  std::int64_t q = a / b;
  if ((a % b != 0) && ((a < 0) != (b < 0))) --q;
  return q;
}

}  // namespace

std::string joinChapterTarget(std::string_view bookPath, std::string_view folder) {
  std::string out(bookPath);
  out += kChapterSeparator;
  out += folder.empty() ? std::string_view(".") : folder;
  return out;
}

ChapterTarget splitChapterTarget(std::string_view target) {
  const std::size_t cut = target.rfind(kChapterSeparator);
  if (cut == std::string_view::npos) return {std::string(target), std::nullopt};
  const std::string folder(target.substr(cut + 1));
  return {std::string(target.substr(0, cut)), folder == "." ? std::string() : folder};
}

bool hasLocation(const Item& item) {
  return item.kind != ItemKind::Collection && item.target.has_value() && !item.target->empty();
}

std::vector<std::string> tokenize(std::string_view command) {
  std::vector<std::string> words;
  std::string current;
  bool inQuotes = false;
  bool hasWord = false;
  for (char c : command) {
    if (c == '"') {
      inQuotes = !inQuotes;
      hasWord = true;
    } else if (isSpace(c) && !inQuotes) {
      if (hasWord) words.push_back(current);
      current.clear();
      hasWord = false;
    } else {
      current += c;
      hasWord = true;
    }
  }
  if (hasWord) words.push_back(current);
  return words;
}

std::map<std::string, std::string> parseDesktopEntry(std::string_view text) {
  std::map<std::string, std::string> values;
  bool inEntry = false;
  for (std::string_view raw : lines(text)) {
    const std::string line = trim(raw);
    if (!line.empty() && line.front() == '[') {
      inEntry = line == "[Desktop Entry]";
      continue;
    }
    if (!inEntry || line.empty() || line.front() == '#') continue;
    const std::size_t cut = line.find('=');
    if (cut == std::string::npos || cut == 0) continue;
    const std::string key = trim(std::string_view(line).substr(0, cut));
    values.emplace(key, trim(std::string_view(line).substr(cut + 1)));  // emplace keeps the first value
  }
  return values;
}

std::vector<std::string> desktopCommand(std::string_view exec) {
  std::vector<std::string> out;
  for (const std::string& word : tokenize(exec)) {
    std::string cleaned;
    for (std::size_t i = 0; i < word.size(); ++i) {
      if (word[i] == '%' && i + 1 < word.size()) {
        const char next = word[i + 1];
        if (next == '%') {
          cleaned += '%';
          ++i;
          continue;
        }
        if (std::isalpha(static_cast<unsigned char>(next))) {
          ++i;
          continue;
        }
      }
      cleaned += word[i];
    }
    if (!cleaned.empty()) out.push_back(cleaned);
  }
  return out;
}

std::optional<std::string> urlFromShortcut(std::string_view text) {
  for (std::string_view raw : lines(text)) {
    const std::string line = trim(raw);
    if (startsWithNoCase(line, "url=")) return trim(std::string_view(line).substr(4));
  }
  return std::nullopt;
}

LaunchPlan planLaunch(const std::string& path, Platform platform, const PlatformFs& fs) {
  if (platform != Platform::Linux) return openWithSystem(path);
  const std::string extension = extensionOf(path);

  if (extension == "desktop") {
    const auto text = fs.readText ? fs.readText(path) : std::nullopt;
    if (!text) return error("Could not read the launcher " + path + ".");
    const auto entry = parseDesktopEntry(*text);
    const auto exec = entry.find("Exec");
    const auto words = desktopCommand(exec == entry.end() ? std::string() : exec->second);
    if (words.empty()) return error("This .desktop launcher has no Exec= line to run.");
    const auto terminal = entry.find("Terminal");
    if (terminal != entry.end() && lower(terminal->second) == "true") {
      return error(
          "This launcher wants a terminal window, which is not supported. Run it from a terminal, or add its program "
          "directly.");
    }
    const auto dir = entry.find("Path");
    const std::string cwd = dir != entry.end() && !dir->second.empty() ? dir->second : dirName(path);
    return spawn(words.front(), std::vector<std::string>(words.begin() + 1, words.end()), cwd);
  }

  if (extension == "url") {
    const auto text = fs.readText ? fs.readText(path) : std::nullopt;
    if (!text) return error("Could not read the shortcut " + path + ".");
    const auto link = urlFromShortcut(*text);
    if (!link || !isAllowedLink(*link)) return error("This shortcut does not contain a steam:// or web link, so it was not opened.");
    LaunchPlan plan;
    plan.type = LaunchPlan::Type::External;
    plan.url = *link;
    return plan;
  }

  const bool executable = fs.isExecutable && fs.isExecutable(path);
  if (extension == "appimage" || extension == "x86_64" || extension == "x86") {
    if (!executable) {
      return error("\"" + baseName(path) +
                   "\" is not marked as executable. In your file manager open Properties > Permissions and allow \"Run "
                   "as a program\" (or run: chmod +x \"" +
                   path + "\").");
    }
    return spawn(path, {}, dirName(path));
  }
  if (extension == "sh" || extension == "run") {
    return executable ? spawn(path, {}, dirName(path)) : spawn("sh", {path}, dirName(path));
  }
  // A program without a known extension (native Linux games are often just "game" or "game.bin").
  if ((extension.empty() || extension == "bin") && executable) return spawn(path, {}, dirName(path));
  return openWithSystem(path);
}

OpenResult openLibraryItem(const Item& item, const LauncherDeps& deps) {
  if (item.kind == ItemKind::Collection) throw std::runtime_error("Collections are opened in the library, not launched.");
  OpenResult result;
  if (!item.target || item.target->empty()) {
    result.status = OpenResult::Status::NoTarget;
    return result;
  }
  const std::string location = splitChapterTarget(*item.target).path;
  if (!deps.exists(location)) {
    result.status = OpenResult::Status::Missing;
    result.path = location;
    return result;
  }
  std::string problem;
  try {
    problem = deps.start(item);
  } catch (const std::exception& e) {
    problem = e.what();
  }
  if (!problem.empty()) {
    result.status = OpenResult::Status::Failed;
    result.message = problem;
    return result;
  }
  result.openedAt = deps.markOpened(item.id);
  return result;
}

std::vector<std::string> findMissing(const std::vector<Item>& items, const std::function<bool(const std::string&)>& exists) {
  std::vector<std::string> out;
  for (const Item& item : items) {
    if (hasLocation(item) && !exists(splitChapterTarget(*item.target).path)) out.push_back(item.id);
  }
  return out;
}

std::optional<std::size_t> topSectionOf(const std::vector<Item>& items, const ItemIndex& byId,
                                        const std::optional<std::string>& parentId) {
  std::unordered_set<std::string> seen;
  std::optional<std::size_t> section;
  std::optional<std::string> current = parentId;
  while (current && seen.insert(*current).second) {
    const auto found = byId.find(*current);
    if (found == byId.end()) break;
    section = found->second;
    current = items[found->second].parentId;
  }
  return section;
}

bool isAppsSection(const Item& section) {
  if (section.id == "apps") return true;
  const std::string name = lower(trim(section.name));
  return name == "app" || name == "apps" || name == "application" || name == "applications";
}

bool opensGameScreen(const std::vector<Item>& items, const ItemIndex& byId, const Item& item) {
  if (item.kind != ItemKind::Launchable) return false;
  const auto section = topSectionOf(items, byId, item.parentId);
  return !(section && isAppsSection(items[*section]));
}

std::string lastPlayedText(std::optional<std::int64_t> openedAt, std::int64_t now, std::int64_t utcOffsetMs) {
  if (!openedAt) return "Not played yet";
  const auto startOf = [&](std::int64_t time) { return floorDiv(time + utcOffsetMs, kDayMs) * kDayMs; };
  const auto days = static_cast<std::int64_t>(std::llround(static_cast<double>(startOf(now) - startOf(*openedAt)) / kDayMs));
  if (days <= 0) return "Played today";
  if (days == 1) return "Played yesterday";
  if (days < 30) return "Played " + std::to_string(days) + " days ago";
  if (days < 365) {
    const auto months = days / 30;
    return "Played " + std::to_string(months) + (months == 1 ? " month ago" : " months ago");
  }
  const auto years = days / 365;
  return "Played " + std::to_string(years) + (years == 1 ? " year ago" : " years ago");
}

std::string doneWord(ItemKind kind) {
  switch (kind) {
    case ItemKind::Video: return "Watched";
    case ItemKind::Readable: return "Read";
    case ItemKind::Audio: return "Listened";
    case ItemKind::Launchable: return "Completed";
    case ItemKind::Collection: break;
  }
  return "Done";
}

std::string markLabel(ItemKind kind, bool done) {
  if (kind == ItemKind::Collection) return done ? "Mark everything inside as not done" : "Mark everything inside as done";
  const std::string word = lower(doneWord(kind));
  return done ? "Mark as not " + word : "Mark as " + word;
}

std::unordered_set<std::string> doneIdsOf(const std::vector<Item>& items) {
  std::unordered_map<std::string, std::vector<std::size_t>> children;  // "" key = top level
  std::vector<std::size_t> roots;
  for (std::size_t i = 0; i < items.size(); ++i) {
    if (items[i].parentId) children[*items[i].parentId].push_back(i);
    else roots.push_back(i);
  }
  std::unordered_set<std::string> done;
  std::unordered_set<std::string> visiting;  // a loop in the data ends the walk instead of hanging
  struct Count {
    int leaves = 0;
    bool allDone = true;
  };
  std::function<Count(std::size_t)> visit = [&](std::size_t at) -> Count {
    const Item& item = items[at];
    if (item.kind != ItemKind::Collection) {
      if (item.isDone) done.insert(item.id);
      return {1, item.isDone};
    }
    if (!visiting.insert(item.id).second) return {0, true};
    Count total;
    const auto found = children.find(item.id);
    if (found != children.end()) {
      for (std::size_t child : found->second) {
        const Count c = visit(child);
        total.leaves += c.leaves;
        total.allDone = total.allDone && c.allDone;
      }
    }
    const bool all = total.leaves > 0 && total.allDone;
    if (all) done.insert(item.id);
    return {total.leaves, all};
  };
  for (std::size_t root : roots) visit(root);
  return done;
}

std::string openLabel(ItemKind kind) {
  switch (kind) {
    case ItemKind::Launchable: return "Launch";
    case ItemKind::Video: return "Play";
    case ItemKind::Readable: return "Read";
    case ItemKind::Audio: return "Play";
    case ItemKind::Collection: break;
  }
  return "Open";
}

}  // namespace rancha
