#pragma once
// FILE KINDS: which files belong to which item kind, and how a file name becomes a display name.
// Port of the Electron app's src/main/fileKinds.ts, plus the ROM helpers of src/shared/emulators.ts
// and the page pictures of src/shared/reader.ts. Also small path helpers that behave like Node's
// path.basename / dirname / extname, so names come out exactly as in the Electron app.
#include <filesystem>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "rancha/item.h"

namespace rancha {

enum class Platform { Windows, Linux };
#ifdef _WIN32
inline constexpr Platform kPlatform = Platform::Windows;
#else
inline constexpr Platform kPlatform = Platform::Linux;
#endif

/// UTF-8 text <-> a file system path (Windows keeps paths as UTF-16 inside).
std::filesystem::path pathFromUtf8(std::string_view text);
std::string utf8Of(const std::filesystem::path& path);

/// "C:/Games/My Game/game.exe" -> "game.exe" (trailing separators are ignored, like Node's basename).
/// On Windows "\" is a separator too and "C:" is a drive; `platform` is only changed by the tests.
std::string baseName(std::string_view path, Platform platform = kPlatform);
/// The folder part ("." when there is none), like Node's dirname.
std::string dirName(std::string_view path, Platform platform = kPlatform);
/// "mkv" (lower case, without the dot). "" when there is none; ".bashrc" has none.
std::string extensionOf(std::string_view path);
/// True when the name has a dot that starts an extension ("a." has one, ".bashrc" has none), like extname() !== ''.
bool hasExtension(std::string_view fileName);
/// The file name without its extension.
std::string stemOf(std::string_view fileName);

/// Program file types of this system (Linux also keeps the Windows ones, for Wine / Proton).
std::vector<std::string> launchableExtensions(Platform platform = kPlatform);
/// The file types of one item kind (Collection has none). Launchable = launchableExtensions(platform).
std::vector<std::string> kindExtensions(ItemKind kind, Platform platform = kPlatform);
/// The file types of console games (ROMs).
std::vector<std::string> romExtensions();
/// The filters of the system file picker, "Name (*.a *.b)", ending with "All files (*)" (fileKinds.ts targetFilters,
/// romFilters and allSupportedFilter). `kind` none = every supported kind (adding several files).
/// Linux pickers match extensions case-sensitively, so "AppImage" is listed as it is usually written.
std::vector<std::string> pickerFilters(std::optional<ItemKind> kind, bool rom, Platform platform = kPlatform);
/// The item kind of a file, from its extension; none when the type is not supported. Never Collection.
std::optional<ItemKind> detectKind(std::string_view path, Platform platform = kPlatform);
/// "my_game_v2.exe" -> "my game v2". Folders keep their full name.
std::string nameFromPath(std::string_view path, bool isFolder = false);

/// A console game file (ROM), by extension.
bool isRomFile(std::string_view fileName);
/// "Super Mario World (USA) [!]" -> "Super Mario World". Never returns an empty name.
std::string cleanRomName(std::string_view name);
/// A picture that can be a comic page (jpg, png, webp...).
bool isPageImage(std::string_view fileName);

}  // namespace rancha
