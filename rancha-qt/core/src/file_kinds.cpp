#include "rancha/file_kinds.h"

#include <algorithm>
#include <array>
#include <cctype>

namespace rancha {
namespace {

bool isSeparator(char c, Platform platform = kPlatform) {
  if (c == '/') return true;
  return platform == Platform::Windows && c == '\\';
}

std::string lower(std::string_view text) {
  std::string out(text);
  for (char& c : out) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return out;
}

bool isSpace(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v'; }

std::string trim(std::string_view text) {
  std::size_t from = 0;
  std::size_t to = text.size();
  while (from < to && isSpace(text[from])) ++from;
  while (to > from && isSpace(text[to - 1])) --to;
  return std::string(text.substr(from, to - from));
}

/// Runs of white space become one space (as .replace(/\s+/g, ' ') or /\s{2,}/g with `minRun` 2).
std::string squeezeSpaces(std::string_view text, std::size_t minRun) {
  std::string out;
  for (std::size_t i = 0; i < text.size();) {
    if (!isSpace(text[i])) {
      out += text[i++];
      continue;
    }
    std::size_t end = i;
    while (end < text.size() && isSpace(text[end])) ++end;
    if (end - i >= minRun) out += ' ';
    else out.append(text.substr(i, end - i));
    i = end;
  }
  return out;
}

bool contains(const auto& list, std::string_view value) {
  return std::find(std::begin(list), std::end(list), value) != std::end(list);
}

constexpr std::array<std::string_view, 6> kWindowsPrograms = {"exe", "lnk", "bat", "cmd", "url", "msi"};
constexpr std::array<std::string_view, 5> kLinuxPrograms = {"sh", "appimage", "desktop", "run", "x86_64"};
constexpr std::array<std::string_view, 13> kVideo = {"mp4", "mkv", "avi", "mov", "wmv", "flv", "webm",
                                                     "m4v", "mpg", "mpeg", "m2ts", "mts", "ogv"};
constexpr std::array<std::string_view, 3> kReadable = {"cbz", "cbr", "pdf"};
constexpr std::array<std::string_view, 9> kAudio = {"mp3", "flac", "ogg", "oga", "opus", "wav", "m4a", "aac", "weba"};
constexpr std::array<std::string_view, 7> kPages = {"jpg", "jpeg", "png", "gif", "webp", "bmp", "avif"};
constexpr std::array<std::string_view, 48> kRoms = {
    "nes", "fds", "sfc", "smc", "gb",  "gbc", "gba", "n64", "z64", "v64",  "nds", "dsi", "3ds", "cia", "cci", "gcm",
    "rvz", "gcz", "wbfs", "wad", "wud", "wux", "wua", "rpx", "nsp", "xci", "nro", "iso", "cue", "chd", "pbp", "cso",
    "ciso", "m3u", "md",  "gen", "smd", "sms", "gg",  "pce", "vb",  "ws",  "wsc", "ngp", "ngc", "a26", "a78", "lnx"};

}  // namespace

std::filesystem::path pathFromUtf8(std::string_view text) {
  return std::filesystem::path(std::u8string(reinterpret_cast<const char8_t*>(text.data()), text.size()));
}

std::string utf8Of(const std::filesystem::path& path) {
  const std::u8string text = path.u8string();
  return std::string(reinterpret_cast<const char*>(text.data()), text.size());
}

std::string baseName(std::string_view path, Platform platform) {
  const auto sep = [platform](char c) { return isSeparator(c, platform); };
  std::size_t end = path.size();
  while (end > 0 && sep(path[end - 1])) --end;
  std::size_t start = end;
  while (start > 0 && !sep(path[start - 1])) --start;
  if (platform == Platform::Windows && start == 0 && end >= 2 && path[1] == ':') start = 2;  // "C:game.exe"
  return std::string(path.substr(start, end - start));
}

std::string dirName(std::string_view path, Platform platform) {
  if (path.empty()) return ".";
  const auto sep = [platform](char c) { return isSeparator(c, platform); };
  std::size_t root = 0;  // the part that is never removed: "/" or "C:\"
  if (platform == Platform::Windows && path.size() >= 2 && path[1] == ':') root = path.size() > 2 && sep(path[2]) ? 3 : 2;
  else if (sep(path[0])) root = 1;
  std::size_t end = path.size();
  while (end > root && sep(path[end - 1])) --end;  // trailing separators
  while (end > root && !sep(path[end - 1])) --end;  // the last name
  while (end > root && sep(path[end - 1])) --end;  // separators before it
  if (end == 0) return root == 0 ? "." : std::string(path.substr(0, root));
  return std::string(path.substr(0, std::max(end, root)));
}

bool hasExtension(std::string_view fileName) {
  const std::string base = baseName(fileName);
  const std::size_t dot = base.rfind('.');
  if (dot == std::string::npos || dot == 0) return false;
  // Node: a name made of dots only ("..") has no extension.
  return base.find_first_not_of('.') != std::string::npos;
}

std::string extensionOf(std::string_view path) {
  if (!hasExtension(path)) return {};
  const std::string base = baseName(path);
  return lower(std::string_view(base).substr(base.rfind('.') + 1));
}

std::string stemOf(std::string_view fileName) {
  const std::string base = baseName(fileName);
  if (!hasExtension(base)) return base;
  return base.substr(0, base.rfind('.'));
}

std::vector<std::string> launchableExtensions(Platform platform) {
  std::vector<std::string> out(kWindowsPrograms.begin(), kWindowsPrograms.end());
  if (platform != Platform::Windows) out.insert(out.end(), kLinuxPrograms.begin(), kLinuxPrograms.end());
  return out;
}

std::vector<std::string> kindExtensions(ItemKind kind, Platform platform) {
  const auto copy = [](const auto& list) { return std::vector<std::string>(list.begin(), list.end()); };
  switch (kind) {
    case ItemKind::Launchable: return launchableExtensions(platform);
    case ItemKind::Video: return copy(kVideo);
    case ItemKind::Readable: return copy(kReadable);
    case ItemKind::Audio: return copy(kAudio);
    case ItemKind::Collection: break;
  }
  return {};
}

std::vector<std::string> romExtensions() { return {kRoms.begin(), kRoms.end()}; }

std::vector<std::string> pickerFilters(std::optional<ItemKind> kind, bool rom, Platform platform) {
  const auto filter = [](std::string_view name, std::vector<std::string> extensions) {
    if (contains(extensions, "appimage")) extensions.push_back("AppImage");
    std::string text(name);
    text += " (";
    for (std::size_t i = 0; i < extensions.size(); ++i) text += (i ? " *." : "*.") + extensions[i];
    return text + ")";
  };
  const auto label = [](ItemKind k) -> std::string_view {
    switch (k) {
      case ItemKind::Launchable: return "Programs and shortcuts";
      case ItemKind::Video: return "Video files";
      case ItemKind::Readable: return "Comics, manga and PDF";
      case ItemKind::Audio: return "Music files";
      case ItemKind::Collection: break;
    }
    return "Files";
  };
  constexpr std::array<ItemKind, 4> kOrder = {ItemKind::Launchable, ItemKind::Video, ItemKind::Readable, ItemKind::Audio};
  std::vector<std::string> out;
  if (rom && (!kind || *kind == ItemKind::Launchable)) {
    out.push_back(filter("Console games (ROMs)", romExtensions()));
  } else if (kind && *kind != ItemKind::Collection) {
    out.push_back(filter(label(*kind), kindExtensions(*kind, platform)));
  } else if (!kind) {
    std::vector<std::string> everything;
    for (ItemKind k : kOrder)
      for (auto& e : kindExtensions(k, platform)) everything.push_back(std::move(e));
    out.push_back(filter("Supported files", everything));
    for (ItemKind k : kOrder) out.push_back(filter(label(k), kindExtensions(k, platform)));
  }
  out.push_back("All files (*)");
  return out;
}

std::optional<ItemKind> detectKind(std::string_view path, Platform platform) {
  const std::string extension = extensionOf(path);
  if (extension.empty()) return std::nullopt;
  if (contains(launchableExtensions(platform), extension)) return ItemKind::Launchable;
  if (contains(kVideo, extension)) return ItemKind::Video;
  if (contains(kReadable, extension)) return ItemKind::Readable;
  if (contains(kAudio, extension)) return ItemKind::Audio;
  return std::nullopt;
}

std::string nameFromPath(std::string_view path, bool isFolder) {
  const std::string base = baseName(path);
  std::string stem = isFolder ? base : stemOf(base);
  std::replace(stem.begin(), stem.end(), '_', ' ');
  const std::string cleaned = trim(squeezeSpaces(stem, 1));
  return cleaned.empty() ? base : cleaned;
}

bool isRomFile(std::string_view fileName) {
  const std::size_t dot = fileName.rfind('.');
  return dot != std::string_view::npos && dot > 0 && contains(kRoms, lower(fileName.substr(dot + 1)));
}

bool isPageImage(std::string_view fileName) { return contains(kPages, extensionOf(fileName)); }

std::string cleanRomName(std::string_view name) {
  // name.replace(/\s*[([][^)\]]*[)\]]/g, '')
  std::string out;
  std::size_t i = 0;
  while (i < name.size()) {
    std::size_t j = i;
    while (j < name.size() && isSpace(name[j])) ++j;
    if (j < name.size() && (name[j] == '(' || name[j] == '[')) {
      const std::size_t close = name.find_first_of(")]", j + 1);
      if (close != std::string_view::npos) {
        i = close + 1;
        continue;
      }
    }
    out += name[i++];
  }
  const std::string cleaned = trim(squeezeSpaces(out, 2));
  return cleaned.empty() ? trim(name) : cleaned;
}

}  // namespace rancha
