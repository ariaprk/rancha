// Tests for the database port (core/src/database.cpp): new library, reopening, refusing a newer
// library, and upgrading old libraries (v1 and v9) the same way the Electron app does.
#include <sqlite3.h>

#include <filesystem>
#include <random>
#include <string>

#include "check.h"
#include "rancha/database.h"

namespace fs = std::filesystem;
using rancha::db::Database;

namespace {

fs::path freshFolder() {
  std::random_device device;
  const auto folder = fs::temp_directory_path() / ("rancha-db-test-" + std::to_string(device()));
  fs::remove_all(folder);
  fs::create_directories(folder);
  return folder;
}

// Writes a library file by hand (as an older app would have left it), without the port's code.
void rawLibrary(const fs::path& file, const char* sql) {
  sqlite3* db = nullptr;
  sqlite3_open(file.string().c_str(), &db);
  char* error = nullptr;
  if (sqlite3_exec(db, sql, nullptr, nullptr, &error) != SQLITE_OK) {
    std::fprintf(stderr, "test setup SQL failed: %s\n", error ? error : "?");
    sqlite3_free(error);
  }
  sqlite3_close(db);
}

std::int64_t number(Database& db, const char* sql) {
  auto query = db.prepare(sql);
  return query.step() ? query.integer(0) : -999;
}

std::string word(Database& db, const char* sql) {
  auto query = db.prepare(sql);
  return query.step() ? query.text(0) : std::string("<no row>");
}

bool throws(const fs::path& file) {
  try {
    Database db(file);
  } catch (const rancha::db::Error&) {
    return true;
  }
  return false;
}

// The v1 schema, copied from migration 1 of the Electron app.
constexpr const char* kV1 = R"(
  CREATE TABLE items (
    id TEXT PRIMARY KEY, parent_id TEXT REFERENCES items(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('collection','launchable','video','readable')),
    name TEXT NOT NULL, description TEXT, target TEXT, cover_path TEXT, icon_path TEXT,
    hue INTEGER NOT NULL DEFAULT 210, sort_order INTEGER NOT NULL DEFAULT 0,
    is_favorite INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    last_opened_at INTEGER, meta TEXT NOT NULL DEFAULT '{}');
  CREATE INDEX idx_items_parent ON items(parent_id);
  CREATE TABLE item_tags (item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, tag TEXT NOT NULL,
    PRIMARY KEY (item_id, tag));
  CREATE INDEX idx_item_tags_tag ON item_tags(tag);
)";

void testNewLibrary() {
  const auto folder = freshFolder();
  const auto file = folder / "library.db";
  {
    Database db(file);
    CHECK(db.version() == 11);
    CHECK(number(db, "SELECT COUNT(*) FROM items") == 5);
    CHECK(word(db, "SELECT group_concat(id, ',') FROM (SELECT id FROM items ORDER BY sort_order)") ==
          "games,reading,video,apps,music");
    CHECK(word(db, "SELECT name FROM items WHERE id = 'apps'") == "Applications");
    CHECK(number(db, "SELECT hue FROM items WHERE id = 'music'") == 120);
    CHECK(word(db, "PRAGMA journal_mode") == "wal");
    CHECK(number(db, "PRAGMA foreign_keys") == 1);
    // Every column of v11 exists (is_game was dropped again by v7).
    CHECK(number(db, "SELECT COUNT(*) FROM pragma_table_info('items')") == 19);
    CHECK(number(db, "SELECT COUNT(*) FROM pragma_table_info('items') WHERE name = 'is_game'") == 0);
    CHECK(number(db, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_items_parent%'") == 2);
    // The new kind is accepted, an unknown kind is not.
    db.exec("INSERT INTO items (id, parent_id, kind, name, created_at, updated_at) VALUES ('s1', 'music', 'audio', 'Song', 1, 1)");
    bool refused = false;
    try {
      db.exec("INSERT INTO items (id, kind, name, created_at, updated_at) VALUES ('x', 'nonsense', 'X', 1, 1)");
    } catch (const rancha::db::Error&) {
      refused = true;
    }
    CHECK(refused);
    // Deleting a section removes its contents (foreign keys with ON DELETE CASCADE).
    db.exec("DELETE FROM items WHERE id = 'music'");
    CHECK(number(db, "SELECT COUNT(*) FROM items WHERE id = 's1'") == 0);
  }
  // A new library is not backed up (nothing to lose).
  CHECK(!fs::exists(folder / "backups"));
  {
    // Reopening: the deleted section comes back once, the others are not doubled.
    Database db(file);
    CHECK(number(db, "SELECT COUNT(*) FROM items WHERE parent_id IS NULL") == 5);
    CHECK(number(db, "SELECT sort_order FROM items WHERE id = 'music'") == 5);  // MAX(1..4) + 1
  }
  {
    Database db(file);
    CHECK(number(db, "SELECT COUNT(*) FROM items WHERE parent_id IS NULL") == 5);
  }
  fs::remove_all(folder);
}

void testRenamedSectionIsKept() {
  const auto folder = freshFolder();
  const auto file = folder / "library.db";
  {
    Database db(file);
    // The user deleted "Video" and has an own top-level folder called " video " instead.
    db.exec("DELETE FROM items WHERE id = 'video'");
    db.exec("INSERT INTO items (id, kind, name, created_at, updated_at) VALUES ('mine', 'collection', ' VIDEO ', 1, 1)");
  }
  Database db(file);
  CHECK(number(db, "SELECT COUNT(*) FROM items WHERE id = 'video'") == 0);
  CHECK(number(db, "SELECT COUNT(*) FROM items WHERE parent_id IS NULL") == 5);
  fs::remove_all(folder);
}

void testNewerLibraryIsRefused() {
  const auto folder = freshFolder();
  const auto file = folder / "library.db";
  rawLibrary(file, "CREATE TABLE t (x); PRAGMA user_version = 12;");
  CHECK(throws(file));
  try {
    Database db(file);
  } catch (const rancha::db::Error& error) {
    CHECK(std::string(error.what()).find("newer version of the app (database version 12)") != std::string::npos);
  }
  // Nothing was changed: the file still says 12 and has no items table.
  sqlite3* raw = nullptr;
  sqlite3_open(file.string().c_str(), &raw);
  sqlite3_stmt* stmt = nullptr;
  sqlite3_prepare_v2(raw, "PRAGMA user_version", -1, &stmt, nullptr);
  sqlite3_step(stmt);
  CHECK(sqlite3_column_int(stmt, 0) == 12);
  sqlite3_finalize(stmt);
  sqlite3_close(raw);
  CHECK(!fs::exists(folder / "backups"));
  fs::remove_all(folder);
}

void testUpgradeFromV1() {
  const auto folder = freshFolder();
  const auto file = folder / "library.db";
  std::string sql = kV1;
  sql += R"(
    INSERT INTO items (id, parent_id, kind, name, sort_order, created_at, updated_at) VALUES
      ('games', NULL, 'collection', 'Games', 1, 1, 1),
      ('a', 'games', 'launchable', 'A game', 1, 5, 5),
      ('f', 'games', 'collection', 'A folder', 9, 6, 6),
      ('b', 'games', 'launchable', 'B game', 4, 7, 7),
      ('pixel-forge', 'games', 'launchable', 'Pixel Forge', 7, 8, 8);
    INSERT INTO item_tags VALUES ('a', 'rpg'), ('a', 'favorite');
    PRAGMA user_version = 1;
  )";
  rawLibrary(file, sql.c_str());
  {
    Database db(file);
    CHECK(db.version() == 11);
    // v8: folders first, then by the old sort_order.
    CHECK(word(db, "SELECT group_concat(id, ',') FROM (SELECT id FROM items WHERE parent_id = 'games' ORDER BY sort_order)") ==
          "f,a,b,pixel-forge");
    CHECK(number(db, "SELECT sort_order FROM items WHERE id = 'f'") == 1);
    CHECK(number(db, "SELECT COUNT(*) FROM item_tags WHERE item_id = 'a'") == 2);
    CHECK(number(db, "SELECT COUNT(*) FROM pragma_table_info('items') WHERE name = 'is_game'") == 0);
    CHECK(number(db, "SELECT COUNT(*) FROM sqlite_master WHERE name = 'reading_progress'") == 1);
    // The missing four sections were added after the existing one.
    CHECK(number(db, "SELECT COUNT(*) FROM items WHERE parent_id IS NULL") == 5);
    CHECK(number(db, "SELECT sort_order FROM items WHERE id = 'reading'") == 2);
  }
  CHECK(fs::exists(folder / "backups" / "library-before-upgrade-v1.db"));
  fs::remove_all(folder);
}

void testUpgradeFromV9() {
  const auto folder = freshFolder();
  const auto file = folder / "library.db";
  std::string sql = kV1;
  sql += R"(
    CREATE TABLE reading_progress (item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      page INTEGER NOT NULL DEFAULT 0, page_count INTEGER NOT NULL DEFAULT 0,
      direction TEXT NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr','rtl')), updated_at INTEGER NOT NULL);
    ALTER TABLE items ADD COLUMN is_done INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX idx_items_parent_order ON items(parent_id, sort_order);
    ALTER TABLE items ADD COLUMN wallpaper_file TEXT;
    ALTER TABLE items ADD COLUMN emulator TEXT;
    ALTER TABLE items ADD COLUMN core TEXT;
    INSERT INTO items (id, parent_id, kind, name, target, created_at, updated_at, is_done, emulator) VALUES
      ('reading', NULL, 'collection', 'Reading', NULL, 1, 1, 0, NULL),
      ('c1', 'reading', 'readable', 'Comic', 'C:\Comics\A.cbz|Chapter 2', 2, 2, 1, NULL),
      ('c2', 'reading', 'readable', 'Folder', 'D:\x|y|ch', 3, 3, 0, NULL),
      ('g1', 'reading', 'launchable', 'Not a comic', 'a|b', 4, 4, 0, 'retroarch');
    INSERT INTO item_tags VALUES ('c1', 'manga');
    INSERT INTO reading_progress VALUES ('c1', 12, 40, 'rtl', 5);
    PRAGMA user_version = 9;
  )";
  rawLibrary(file, sql.c_str());
  {
    Database db(file);
    CHECK(db.version() == 11);
    // v10: only the last "|" of a comic's location becomes U+001F; other kinds are untouched.
    CHECK(word(db, "SELECT target FROM items WHERE id = 'c1'") == std::string("C:\\Comics\\A.cbz\x1f") + "Chapter 2");
    CHECK(word(db, "SELECT target FROM items WHERE id = 'c2'") == std::string("D:\\x|y\x1f") + "ch");
    CHECK(word(db, "SELECT target FROM items WHERE id = 'g1'") == "a|b");
    // v11 rebuilt the table: rows, tags and reading progress survive, values unchanged.
    CHECK(number(db, "SELECT is_done FROM items WHERE id = 'c1'") == 1);
    CHECK(word(db, "SELECT emulator FROM items WHERE id = 'g1'") == "retroarch");
    CHECK(number(db, "SELECT COUNT(*) FROM item_tags WHERE item_id = 'c1'") == 1);
    CHECK(number(db, "SELECT page FROM reading_progress WHERE item_id = 'c1'") == 12);
    CHECK(number(db, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_items_parent%'") == 2);
    CHECK(word(db, "SELECT sql FROM sqlite_master WHERE name = 'items'").find("'readable','audio'") != std::string::npos);
    // The links still work after the rebuild: deleting the section removes the comics and their data.
    db.exec("DELETE FROM items WHERE id = 'reading'");
    CHECK(number(db, "SELECT COUNT(*) FROM reading_progress") == 0);
    CHECK(number(db, "SELECT COUNT(*) FROM item_tags") == 0);
  }
  CHECK(fs::exists(folder / "backups" / "library-before-upgrade-v9.db"));
  // The backup is the untouched old library (read with plain SQLite, so nothing upgrades it).
  sqlite3* raw = nullptr;
  sqlite3_open((folder / "backups" / "library-before-upgrade-v9.db").string().c_str(), &raw);
  sqlite3_stmt* stmt = nullptr;
  sqlite3_prepare_v2(raw, "SELECT (SELECT user_version FROM pragma_user_version), (SELECT target FROM items WHERE id = 'c1')", -1,
                     &stmt, nullptr);
  CHECK(sqlite3_step(stmt) == SQLITE_ROW);
  CHECK(sqlite3_column_int(stmt, 0) == 9);
  CHECK(std::string(reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1))) == "C:\\Comics\\A.cbz|Chapter 2");
  sqlite3_finalize(stmt);
  sqlite3_close(raw);
  fs::remove_all(folder);
}

}  // namespace

void testDatabase() {
  testNewLibrary();
  testRenamedSectionIsKept();
  testNewerLibraryIsRefused();
  testUpgradeFromV1();
  testUpgradeFromV9();
}
