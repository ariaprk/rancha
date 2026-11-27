// Port of src/main/covers.ts and the patterns of src/shared/cover.ts.
#include "rancha/cover_store.h"

#include <fstream>
#include <stdexcept>
#include <system_error>
#include <vector>

#include "rancha/file_kinds.h"
#include "rancha/item_repository.h"  // randomUuid

namespace fs = std::filesystem;

namespace rancha {
namespace {

bool isHex(char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); }
bool isDigit(char c) { return c >= '0' && c <= '9'; }

bool endsWithJpg(std::string_view name) { return name.size() >= 4 && name.substr(name.size() - 4) == ".jpg"; }

// a run of 1-16 digits starting at `from`; returns where it stops, or npos
std::size_t digits(std::string_view text, std::size_t from) {
  std::size_t at = from;
  while (at < text.size() && isDigit(text[at])) ++at;
  const std::size_t count = at - from;
  return count >= 1 && count <= 16 ? at : std::string_view::npos;
}

}  // namespace

bool isCoverName(std::string_view name) {
  // /^[a-f0-9-]{36}\.jpg$/
  if (name.size() != 40 || !endsWithJpg(name)) return false;
  for (std::size_t i = 0; i < 36; ++i)
    if (!isHex(name[i]) && name[i] != '-') return false;
  return true;
}

bool isAutoCoverName(std::string_view name) {
  // /^[a-f0-9]{40}-\d{1,16}-\d{1,16}\.jpg$/
  if (!endsWithJpg(name)) return false;
  const std::string_view body = name.substr(0, name.size() - 4);
  if (body.size() < 44) return false;
  for (std::size_t i = 0; i < 40; ++i)
    if (!isHex(body[i])) return false;
  if (body[40] != '-') return false;
  const std::size_t first = digits(body, 41);
  if (first == std::string_view::npos || first >= body.size() || body[first] != '-') return false;
  return digits(body, first + 1) == body.size();
}

CoverStore::CoverStore(fs::path dir) : dir_(std::move(dir)) { fs::create_directories(dir_); }

std::string CoverStore::add(std::string_view jpegBytes) {
  const std::string name = randomUuid() + ".jpg";
  const fs::path at = dir_ / name;
  std::ofstream file(at, std::ios::binary | std::ios::trunc);
  file.write(jpegBytes.data(), static_cast<std::streamsize>(jpegBytes.size()));
  file.close();
  if (!file) {
    std::error_code ignored;
    fs::remove(at, ignored);
    throw std::runtime_error("The picture could not be saved.");
  }
  return name;
}

bool CoverStore::has(std::string_view name) const {
  std::error_code error;
  return isCoverName(name) && fs::exists(dir_ / std::string(name), error);
}

std::optional<fs::path> CoverStore::pathOf(std::string_view name) const {
  if (!isCoverName(name)) return std::nullopt;
  return dir_ / std::string(name);
}

void CoverStore::remove(const std::optional<std::string>& name) const {
  if (!name || !isCoverName(*name)) return;
  std::error_code ignored;  // already gone: nothing to do
  fs::remove(dir_ / *name, ignored);
}

int CoverStore::sweep(const std::unordered_set<std::string>& inUse) const {
  std::vector<std::string> unused;
  std::error_code error;
  for (fs::directory_iterator it(dir_, error), end; !error && it != end; it.increment(error)) {
    const std::string name = utf8Of(it->path().filename());
    if (isCoverName(name) && !inUse.count(name)) unused.push_back(name);
  }
  for (const std::string& name : unused) remove(name);
  return static_cast<int>(unused.size());
}

}  // namespace rancha
