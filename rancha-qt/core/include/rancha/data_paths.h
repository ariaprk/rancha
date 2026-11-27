#pragma once
// DATA FOLDER: where the library lives. Must be exactly the Electron app's folder, so both
// apps share one library (src/main/index.ts: app.setPath('userData', join(appData, APP_ID))).
//   Windows: %APPDATA%\rancha
//   Linux:   $XDG_CONFIG_HOME/rancha, or ~/.config/rancha when XDG_CONFIG_HOME is not set
// Lower-case "rancha" on purpose: it is the permanent APP_ID, not the display name.
// (Qt's QStandardPaths would give ".../Rancha/Rancha", a different folder, so it is not used.)
#include <filesystem>
#include <optional>
#include <string>

namespace rancha {

/// The permanent app id (src/main/appInfo.ts). Never change it: it names the data folder.
inline constexpr const char* kAppId = "rancha";

/// The files and folders inside the data folder (the same names as in the Electron app).
struct DataPaths {
  std::filesystem::path root;
  std::filesystem::path library() const { return root / "library.db"; }
  std::filesystem::path settings() const { return root / "settings.json"; }
  std::filesystem::path windowState() const { return root / "window.json"; }
  std::filesystem::path covers() const { return root / "covers"; }
  std::filesystem::path coverCache() const { return root / "cover-cache"; }
  std::filesystem::path songInfo() const { return root / "song-info.json"; }
  std::filesystem::path backups() const { return root / "backups"; }
};

/// The folder Electron calls "appData". Empty when the system gives no usable answer
/// (no %APPDATA% on Windows; neither XDG_CONFIG_HOME nor HOME on Linux).
/// The arguments are the environment values, so this can be tested; dataPaths() reads the real ones.
std::filesystem::path appDataFolder(const std::optional<std::filesystem::path>& appdata,
                                    const std::optional<std::filesystem::path>& xdgConfigHome,
                                    const std::optional<std::filesystem::path>& home);

/// The data folder of this PC. Throws std::runtime_error when it cannot be found.
DataPaths dataPaths();

}  // namespace rancha
