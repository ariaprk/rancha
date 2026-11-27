#pragma once
// DATABASE: opens the library file (SQLite) and brings it up to date.
//
// Port of the Electron app's src/main/db/database.ts. The file format must stay the same,
// so a library made by the Electron app opens here unchanged and the other way round:
//   - the schema is built by the same 11 migrations, in the same order (PRAGMA user_version);
//   - an existing library is copied to backups/library-before-upgrade-v<N>.db before an upgrade;
//   - a library made by a NEWER app is refused instead of being damaged;
//   - the five main sections (Games, Reading, Video, Applications, Music) always exist.
// Plain C++ (no Qt), so it is tested without a window.
#include <cstdint>
#include <filesystem>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>

struct sqlite3;
struct sqlite3_stmt;

namespace rancha::db {

/// Any database problem. The text is meant to be shown to the user.
class Error : public std::runtime_error {
 public:
  using std::runtime_error::runtime_error;
};

/// The newest database version this app understands (same number as the Electron app).
inline constexpr int kLatestVersion = 11;

/// One prepared SQL statement. Bind values (positions start at 1), then call step().
class Statement {
 public:
  Statement(sqlite3* db, std::string_view sql);
  ~Statement();
  Statement(const Statement&) = delete;
  Statement& operator=(const Statement&) = delete;
  Statement(Statement&& other) noexcept;
  Statement& operator=(Statement&& other) noexcept;

  Statement& bind(int position, std::int64_t value);
  Statement& bind(int position, std::string_view text);
  // Exact overloads, so a literal or a std::string does not have to choose between
  // string_view and optional<string> (that choice would be ambiguous).
  Statement& bind(int position, const char* text) { return bind(position, std::string_view(text)); }
  Statement& bind(int position, const std::string& text) { return bind(position, std::string_view(text)); }
  Statement& bind(int position, int value) { return bind(position, static_cast<std::int64_t>(value)); }
  Statement& bind(int position, const std::optional<std::string>& text);  // none = NULL
  Statement& bind(int position, const std::optional<std::int64_t>& value);  // none = NULL
  Statement& bindNull(int position);

  /// Runs one step. True while a row is available.
  bool step();
  /// Runs the statement to the end (for INSERT/UPDATE/DELETE) and resets it for reuse.
  void run();
  void reset();

  bool isNull(int column) const;
  std::int64_t integer(int column) const;
  std::string text(int column) const;  // NULL gives ""
  std::optional<std::string> optionalText(int column) const;
  std::optional<std::int64_t> optionalInteger(int column) const;

 private:
  sqlite3* db_ = nullptr;
  sqlite3_stmt* stmt_ = nullptr;
};

class Database {
 public:
  /// Opens (or creates) the library file, upgrades it and makes sure the main sections exist.
  /// Throws db::Error when the file is from a newer app or cannot be opened or upgraded.
  explicit Database(const std::filesystem::path& file);
  ~Database();
  Database(const Database&) = delete;
  Database& operator=(const Database&) = delete;

  void exec(std::string_view sql);
  Statement prepare(std::string_view sql);
  int version();
  sqlite3* handle() { return db_; }

 private:
  void migrate();
  sqlite3* db_ = nullptr;
  std::filesystem::path file_;
};

/// Milliseconds since 1970 (what JavaScript's Date.now() gives).
std::int64_t nowMs();

/// Makes sure the five main sections exist (an older app allowed deleting them).
/// A section is not re-created when a top-level collection with the same id or name exists.
void ensureMainSections(Database& db);

}  // namespace rancha::db
