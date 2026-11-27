// Port of the data-folder choice in src/main/index.ts (Electron's app.getPath('appData') + APP_ID).
#include "rancha/data_paths.h"

#include <cstdlib>
#include <stdexcept>

#ifdef _WIN32
#include <windows.h>
#include <shlobj.h>
#endif

namespace rancha {

namespace {

bool usable(const std::optional<std::filesystem::path>& value) { return value && !value->empty(); }

#ifndef _WIN32
std::optional<std::filesystem::path> env(const char* name) {
  const char* value = std::getenv(name);
  if (!value || !*value) return std::nullopt;
  return std::filesystem::path(value);
}
#endif

}  // namespace

std::filesystem::path appDataFolder(const std::optional<std::filesystem::path>& appdata,
                                    const std::optional<std::filesystem::path>& xdgConfigHome,
                                    const std::optional<std::filesystem::path>& home) {
#ifdef _WIN32
  (void)xdgConfigHome;
  (void)home;
  return usable(appdata) ? *appdata : std::filesystem::path();
#else
  // Electron on Linux: $XDG_CONFIG_HOME when it is set and not empty, otherwise ~/.config.
  (void)appdata;
  if (usable(xdgConfigHome)) return *xdgConfigHome;
  if (usable(home)) return *home / ".config";
  return {};
#endif
}

DataPaths dataPaths() {
  std::filesystem::path base;
#ifdef _WIN32
  // Electron asks Windows for the Roaming AppData folder (the same folder %APPDATA% names).
  PWSTR known = nullptr;
  if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_RoamingAppData, KF_FLAG_DEFAULT, nullptr, &known)) && known) {
    base = appDataFolder(std::filesystem::path(known), std::nullopt, std::nullopt);
  }
  CoTaskMemFree(known);
  if (base.empty()) {
    if (const wchar_t* value = _wgetenv(L"APPDATA"); value && *value) base = std::filesystem::path(value);
  }
#else
  base = appDataFolder(std::nullopt, env("XDG_CONFIG_HOME"), env("HOME"));
#endif
  if (base.empty()) throw std::runtime_error("Could not find the folder for the app's data (no home folder).");
  return DataPaths{base / kAppId};
}

}  // namespace rancha
