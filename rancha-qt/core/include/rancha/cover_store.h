#pragma once
// COVER STORE: keeps cover (and wallpaper) pictures in the "covers" folder inside the data folder, under random
// names. Original pictures are never touched or moved; a resized copy is saved, so a cover keeps working even if the
// original picture is deleted later.
//
// Port of the Electron app's src/main/covers.ts and the name rules of src/shared/cover.ts. The pictures are made
// (decoded, cropped, resized, encoded as JPEG) by the app with Qt; this class only stores the finished bytes, so the
// core needs no image library.
#include <filesystem>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_set>

namespace rancha {

/// A picture the user chose: "<36 characters of a-f, 0-9 and dashes>.jpg". Only such names are accepted or served,
/// so a cover name can never be used to reach other files on the PC.
bool isCoverName(std::string_view name);
/// An automatic cover (first page of a comic/PDF): "<40 hex>-<1-16 digits>-<1-16 digits>.jpg".
bool isAutoCoverName(std::string_view name);

class CoverStore {
 public:
  /// Creates the folder when it is missing. Throws std::filesystem::filesystem_error when that fails.
  explicit CoverStore(std::filesystem::path dir);

  const std::filesystem::path& dir() const { return dir_; }

  /// Saves finished JPEG bytes under a new random name and returns that name.
  std::string add(std::string_view jpegBytes);
  /// True if this is a valid cover name and the file exists.
  bool has(std::string_view name) const;
  /// The full path of a cover, or none if the name is not a valid cover name.
  std::optional<std::filesystem::path> pathOf(std::string_view name) const;
  /// Deletes a cover file. Missing files and invalid names are ignored.
  void remove(const std::optional<std::string>& name) const;
  /// Deletes covers that no item uses any more (a picture chosen in an editor that was then cancelled...).
  /// Other files in the folder are left alone. Returns how many were removed.
  int sweep(const std::unordered_set<std::string>& inUse) const;

 private:
  std::filesystem::path dir_;
};

}  // namespace rancha
