// Port of src/main/db/database.ts and the seeding parts of src/main/db/sampleLibrary.ts.
// The migrations are copied step by step and must never be edited: a new column means a NEW step.
#include "rancha/database.h"

#include <sqlite3.h>

#include <algorithm>
#include <array>
#include <cctype>
#include <chrono>
#include <functional>
#include <regex>
#include <system_error>
#include <vector>

namespace rancha::db {

namespace {

std::string lastError(sqlite3* db) { return db ? sqlite3_errmsg(db) : "unknown SQLite error"; }

std::string trimLower(std::string_view text) {
  // ASCII only: the five section names are ASCII, so this matches JavaScript's
  // trim().toLowerCase() for every name that could ever be equal to one of them.
  std::size_t begin = 0, end = text.size();
  while (begin < end && std::isspace(static_cast<unsigned char>(text[begin]))) ++begin;
  while (end > begin && std::isspace(static_cast<unsigned char>(text[end - 1]))) --end;
  std::string out(text.substr(begin, end - begin));
  for (char& c : out) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return out;
}

struct Section {
  const char* id;
  const char* name;
  int hue;
};

// The five top-level sections, in the order of SAMPLE_ITEMS (sampleLibrary.ts).
constexpr std::array<Section, 5> kSections{{
    {"games", "Games", 265},
    {"reading", "Reading", 20},
    {"video", "Video", 200},
    {"apps", "Applications", 150},
    {"music", "Music", 120},
}};

constexpr std::int64_t kHour = 3'600'000;

// seedSampleLibrary: only the top-level sections (a new user starts with an empty library).
// sortOrder is the position in SAMPLE_ITEMS (1..5) and createdAt = now - position * 7 hours.
void seedSections(Database& db) {
  const std::int64_t now = nowMs();
  auto insert = db.prepare(
      "INSERT INTO items (id, parent_id, kind, name, description, hue, sort_order, is_favorite,"
      " created_at, updated_at, last_opened_at) VALUES (?, NULL, 'collection', ?, NULL, ?, ?, 0, ?, ?, NULL)");
  int position = 0;
  for (const Section& section : kSections) {
    ++position;
    const std::int64_t created = now - position * 7 * kHour;
    insert.bind(1, section.id).bind(2, section.name).bind(3, section.hue).bind(4, position);
    insert.bind(5, created).bind(6, created);
    insert.run();
  }
}

using Migration = std::function<void(Database&)>;

const std::vector<Migration>& migrations() {
  static const std::vector<Migration> list = {
      // Version 1: the first schema, plus the main sections (first run only).
      [](Database& db) {
        db.exec(R"(
      CREATE TABLE items (
        id             TEXT PRIMARY KEY,
        parent_id      TEXT REFERENCES items(id) ON DELETE CASCADE,
        kind           TEXT NOT NULL CHECK (kind IN ('collection','launchable','video','readable')),
        name           TEXT NOT NULL,
        description    TEXT,
        target         TEXT,                      -- file path or launch target (used from Milestone 4/6)
        cover_path     TEXT,                      -- cover image (Milestone 4)
        icon_path      TEXT,                      -- icon image (Milestone 4)
        hue            INTEGER NOT NULL DEFAULT 210,
        sort_order     INTEGER NOT NULL DEFAULT 0,
        is_favorite    INTEGER NOT NULL DEFAULT 0,
        created_at     INTEGER NOT NULL,
        updated_at     INTEGER NOT NULL,
        last_opened_at INTEGER,
        meta           TEXT NOT NULL DEFAULT '{}' -- extra, type-specific details as JSON
      );
      CREATE INDEX idx_items_parent ON items(parent_id);

      CREATE TABLE item_tags (
        item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        tag     TEXT NOT NULL,
        PRIMARY KEY (item_id, tag)
      );
      CREATE INDEX idx_item_tags_tag ON item_tags(tag);
    )");
        seedSections(db);
      },
      // Version 2: where the reader stopped in each comic (and its reading direction).
      [](Database& db) {
        db.exec(R"(
      CREATE TABLE reading_progress (
        item_id    TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
        page       INTEGER NOT NULL DEFAULT 0,
        page_count INTEGER NOT NULL DEFAULT 0,
        direction  TEXT NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr','rtl')),
        updated_at INTEGER NOT NULL
      );
    )");
      },
      // Version 3: "watched / read / completed" status.
      [](Database& db) { db.exec("ALTER TABLE items ADD COLUMN is_done INTEGER NOT NULL DEFAULT 0;"); },
      // Version 4: speed (list a folder in order without looking at every item).
      [](Database& db) { db.exec("CREATE INDEX idx_items_parent_order ON items(parent_id, sort_order);"); },
      // Version 5: an optional wallpaper picture per item (for the game screen).
      [](Database& db) { db.exec("ALTER TABLE items ADD COLUMN wallpaper_file TEXT;"); },
      // Version 6: games and apps told apart per item (undone again by version 7).
      [](Database& db) {
        db.exec("ALTER TABLE items ADD COLUMN is_game INTEGER NOT NULL DEFAULT 1;");
        db.exec("UPDATE items SET is_game = 0 WHERE id IN ('pixel-forge', 'sketchbook', 'notes-pro', 'audio-lab');");
      },
      // Version 7: games and apps are told apart by their section, so the switch goes.
      [](Database& db) { db.exec("ALTER TABLE items DROP COLUMN is_game;"); },
      // Version 8: folders and other items can be mixed in "Custom order". Number every
      // folder's contents in the old order (folders first), so nothing looks different.
      [](Database& db) {
        std::vector<std::optional<std::string>> parents;
        {
          auto list = db.prepare("SELECT DISTINCT parent_id FROM items");
          while (list.step()) parents.push_back(list.optionalText(0));
        }
        auto update = db.prepare("UPDATE items SET sort_order = ? WHERE id = ?");
        for (const auto& parent : parents) {
          std::vector<std::string> children;
          {
            auto query = db.prepare(
                "SELECT id FROM items WHERE parent_id IS ? ORDER BY (kind = 'collection') DESC, sort_order, created_at, id");
            query.bind(1, parent);
            while (query.step()) children.push_back(query.text(0));
          }
          for (std::size_t i = 0; i < children.size(); ++i) {
            update.bind(1, static_cast<std::int64_t>(i + 1)).bind(2, children[i]);
            update.run();
          }
        }
      },
      // Version 9: a game can be run with an emulator (profile id) and a RetroArch core.
      [](Database& db) {
        db.exec("ALTER TABLE items ADD COLUMN emulator TEXT;");
        db.exec("ALTER TABLE items ADD COLUMN core TEXT;");
      },
      // Version 10: the chapter separator in a comic's location changes from "|" to U+001F
      // (Linux allows "|" in file names). Only the LAST "|" was a separator.
      [](Database& db) {
        std::vector<std::pair<std::string, std::string>> rows;
        {
          auto query = db.prepare("SELECT id, target FROM items WHERE kind = 'readable' AND target LIKE '%|%'");
          while (query.step()) rows.emplace_back(query.text(0), query.text(1));
        }
        auto update = db.prepare("UPDATE items SET target = ? WHERE id = ?");
        for (auto& [id, target] : rows) {
          const std::size_t cut = target.rfind('|');
          target[cut] = '\x1f';
          update.bind(1, target).bind(2, id);
          update.run();
        }
      },
      // Version 11: a new kind 'audio'. SQLite cannot change a CHECK rule in place, so the
      // items table is rebuilt with the extended rule and every row copied over unchanged
      // (foreign keys are off during the step, see migrate()).
      [](Database& db) {
        std::string sql;
        {
          auto query = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'");
          if (!query.step()) throw Error("Could not extend the items table.");
          sql = query.text(0);
        }
        static const std::regex head(R"(^CREATE TABLE\s+"?items"?)", std::regex::icase);
        std::string extended = std::regex_replace(sql, head, "CREATE TABLE items_new", std::regex_constants::format_first_only);
        const std::string from = "'video','readable')";
        if (const auto at = extended.find(from); at != std::string::npos)
          extended.replace(at, from.size(), "'video','readable','audio')");
        if (extended == sql || extended.find("'readable','audio'") == std::string::npos)
          throw Error("Could not extend the items table.");
        db.exec(extended);
        db.exec("INSERT INTO items_new SELECT * FROM items");
        db.exec("DROP TABLE items");
        db.exec("ALTER TABLE items_new RENAME TO items");
        db.exec("CREATE INDEX idx_items_parent ON items(parent_id)");
        db.exec("CREATE INDEX idx_items_parent_order ON items(parent_id, sort_order)");
      },
  };
  return list;
}

}  // namespace

std::int64_t nowMs() {
  using namespace std::chrono;
  return duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
}

// ---- Statement ----

Statement::Statement(sqlite3* db, std::string_view sql) : db_(db) {
  if (sqlite3_prepare_v2(db, sql.data(), static_cast<int>(sql.size()), &stmt_, nullptr) != SQLITE_OK)
    throw Error(lastError(db));
}

Statement::~Statement() { sqlite3_finalize(stmt_); }

Statement::Statement(Statement&& other) noexcept : db_(other.db_), stmt_(other.stmt_) { other.stmt_ = nullptr; }

Statement& Statement::operator=(Statement&& other) noexcept {
  if (this != &other) {
    sqlite3_finalize(stmt_);
    db_ = other.db_;
    stmt_ = other.stmt_;
    other.stmt_ = nullptr;
  }
  return *this;
}

Statement& Statement::bind(int position, std::int64_t value) {
  if (sqlite3_bind_int64(stmt_, position, value) != SQLITE_OK) throw Error(lastError(db_));
  return *this;
}

Statement& Statement::bind(int position, std::string_view text) {
  if (sqlite3_bind_text(stmt_, position, text.data(), static_cast<int>(text.size()), SQLITE_TRANSIENT) != SQLITE_OK)
    throw Error(lastError(db_));
  return *this;
}

Statement& Statement::bind(int position, const std::optional<std::string>& text) {
  return text ? bind(position, std::string_view(*text)) : bindNull(position);
}

Statement& Statement::bind(int position, const std::optional<std::int64_t>& value) {
  return value ? bind(position, *value) : bindNull(position);
}

Statement& Statement::bindNull(int position) {
  if (sqlite3_bind_null(stmt_, position) != SQLITE_OK) throw Error(lastError(db_));
  return *this;
}

bool Statement::step() {
  const int result = sqlite3_step(stmt_);
  if (result == SQLITE_ROW) return true;
  if (result == SQLITE_DONE) return false;
  throw Error(lastError(db_));
}

void Statement::run() {
  while (step()) {
  }
  reset();
}

void Statement::reset() {
  sqlite3_reset(stmt_);
  sqlite3_clear_bindings(stmt_);
}

bool Statement::isNull(int column) const { return sqlite3_column_type(stmt_, column) == SQLITE_NULL; }

std::int64_t Statement::integer(int column) const { return sqlite3_column_int64(stmt_, column); }

std::string Statement::text(int column) const {
  const auto* data = reinterpret_cast<const char*>(sqlite3_column_text(stmt_, column));
  if (!data) return {};
  return std::string(data, static_cast<std::size_t>(sqlite3_column_bytes(stmt_, column)));
}

std::optional<std::string> Statement::optionalText(int column) const {
  if (isNull(column)) return std::nullopt;
  return text(column);
}

std::optional<std::int64_t> Statement::optionalInteger(int column) const {
  if (isNull(column)) return std::nullopt;
  return integer(column);
}

// ---- Database ----

Database::Database(const std::filesystem::path& file) : file_(file) {
  std::error_code ignored;
  if (file.has_parent_path()) std::filesystem::create_directories(file.parent_path(), ignored);
  const std::string name = file.u8string().empty() ? std::string() : std::string(reinterpret_cast<const char*>(file.u8string().c_str()));
  if (sqlite3_open_v2(name.c_str(), &db_, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, nullptr) != SQLITE_OK) {
    const std::string message = "Could not open the library: " + lastError(db_);
    sqlite3_close(db_);
    db_ = nullptr;
    throw Error(message);
  }
  try {
    // WAL mode: faster and safer writes. Foreign keys: deleting a folder removes its contents.
    exec("PRAGMA journal_mode = WAL");
    exec("PRAGMA foreign_keys = ON");
    migrate();
    ensureMainSections(*this);
  } catch (...) {
    sqlite3_close(db_);
    db_ = nullptr;
    throw;
  }
}

Database::~Database() {
  if (db_) sqlite3_close(db_);
}

void Database::exec(std::string_view sql) {
  char* message = nullptr;
  const std::string text(sql);
  if (sqlite3_exec(db_, text.c_str(), nullptr, nullptr, &message) != SQLITE_OK) {
    const std::string error = message ? message : lastError(db_);
    sqlite3_free(message);
    throw Error(error);
  }
}

Statement Database::prepare(std::string_view sql) { return Statement(db_, sql); }

int Database::version() {
  auto query = prepare("PRAGMA user_version");
  query.step();
  return static_cast<int>(query.integer(0));
}

void Database::migrate() {
  const auto& steps = migrations();
  static_assert(kLatestVersion == 11);
  const int current = version();
  if (current > static_cast<int>(steps.size())) {
    throw Error("This library was created by a newer version of the app (database version " + std::to_string(current) +
                "). Please update the app instead of opening it with this older version.");
  }

  // Safety net: before upgrading an EXISTING library, keep a copy of it.
  if (current > 0 && current < static_cast<int>(steps.size())) {
    exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const auto folder = file_.parent_path() / "backups";
    std::filesystem::create_directories(folder);
    const auto backup = folder / ("library-before-upgrade-v" + std::to_string(current) + ".db");
    if (!std::filesystem::exists(backup)) std::filesystem::copy_file(file_, backup);
  }

  for (int version = current; version < static_cast<int>(steps.size()); ++version) {
    // Foreign keys are off while a step rebuilds a table (version 11), and checked afterwards.
    exec("PRAGMA foreign_keys = OFF");
    exec("BEGIN");
    try {
      steps[static_cast<std::size_t>(version)](*this);
      {
        auto broken = prepare("PRAGMA foreign_key_check");
        if (broken.step()) throw Error("The upgrade left broken links between items.");
      }
      exec("PRAGMA user_version = " + std::to_string(version + 1));
      exec("COMMIT");
    } catch (...) {
      try {
        exec("ROLLBACK");
      } catch (...) {
      }
      exec("PRAGMA foreign_keys = ON");
      throw;
    }
    exec("PRAGMA foreign_keys = ON");
  }
}

void ensureMainSections(Database& db) {
  std::vector<std::pair<std::string, std::string>> topLevel;
  {
    auto query = db.prepare("SELECT id, name FROM items WHERE parent_id IS NULL AND kind = 'collection'");
    while (query.step()) topLevel.emplace_back(query.text(0), query.text(1));
  }
  auto insert = db.prepare(
      "INSERT INTO items (id, parent_id, kind, name, hue, sort_order, is_favorite, created_at, updated_at)"
      " VALUES (?, NULL, 'collection', ?, ?, ?, 0, ?, ?)");
  for (const Section& section : kSections) {
    const std::string wanted = trimLower(section.name);
    const bool present = std::any_of(topLevel.begin(), topLevel.end(), [&](const auto& row) {
      return row.first == section.id || trimLower(row.second) == wanted;
    });
    if (present) continue;
    std::int64_t last = -1;
    {
      auto query = db.prepare("SELECT COALESCE(MAX(sort_order), -1) FROM items WHERE parent_id IS NULL");
      if (query.step()) last = query.integer(0);
    }
    const std::int64_t now = nowMs();
    insert.bind(1, section.id).bind(2, section.name).bind(3, section.hue).bind(4, last + 1).bind(5, now).bind(6, now);
    insert.run();
  }
}

}  // namespace rancha::db
