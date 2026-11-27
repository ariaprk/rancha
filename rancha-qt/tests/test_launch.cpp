#include <cstdint>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

#include "check.h"
#include "rancha/launch.h"

using namespace rancha;

namespace {

Item make(std::string id, std::optional<std::string> parent, ItemKind kind, std::string name = "x",
          std::optional<std::string> target = std::nullopt, bool done = false) {
  Item item;
  item.id = std::move(id);
  item.parentId = std::move(parent);
  item.kind = kind;
  item.name = std::move(name);
  item.target = std::move(target);
  item.isDone = done;
  return item;
}

PlatformFs fakeFs(bool executable, std::optional<std::string> text) {
  return {[executable](const std::string&) { return executable; },
          [text](const std::string&) { return text; }};
}

bool isSpawn(const LaunchPlan& p, const std::string& command, const std::vector<std::string>& args, const std::string& cwd) {
  return p.type == LaunchPlan::Type::Spawn && p.command == command && p.args == args && p.cwd == cwd;
}

constexpr std::int64_t kDay = 24LL * 60 * 60 * 1000;
constexpr std::int64_t kHour = 60LL * 60 * 1000;

void testChapterTargetsAndCommands() {
  const std::string chapter = joinChapterTarget("/b/book.cbz", "ch 1");
  CHECK(chapter == std::string("/b/book.cbz\x1f") + "ch 1");
  CHECK(joinChapterTarget("/b/pages", "") == std::string("/b/pages\x1f") + ".");
  const ChapterTarget split = splitChapterTarget(chapter);
  CHECK(split.path == "/b/book.cbz" && split.chapter == "ch 1");
  const ChapterTarget loose = splitChapterTarget(joinChapterTarget("/b/pages", ""));
  CHECK(loose.path == "/b/pages" && loose.chapter == "");
  const ChapterTarget plain = splitChapterTarget("/v/movie.mkv");
  CHECK(plain.path == "/v/movie.mkv" && !plain.chapter);

  CHECK(!hasLocation(make("c", std::nullopt, ItemKind::Collection, "c", "/x")));
  CHECK(!hasLocation(make("v", std::nullopt, ItemKind::Video, "v", "")));
  CHECK(!hasLocation(make("v", std::nullopt, ItemKind::Video)));
  CHECK(hasLocation(make("v", std::nullopt, ItemKind::Video, "v", "/v.mkv")));

  CHECK(tokenize(R"(retroarch -L "my core.so" "a b.sfc")") ==
        (std::vector<std::string>{"retroarch", "-L", "my core.so", "a b.sfc"}));
  CHECK(tokenize("  a   b ") == (std::vector<std::string>{"a", "b"}));
  CHECK(tokenize(R"(x "")") == (std::vector<std::string>{"x", ""}));
  CHECK(tokenize("").empty());

  const auto entry = parseDesktopEntry("# top\n[Desktop Entry]\r\nName = Game\nExec=a\nExec=b\n# note\n=bad\n[Other]\nPath=/x\n");
  CHECK(entry.size() == 2 && entry.at("Name") == "Game" && entry.at("Exec") == "a" && !entry.count("Path"));

  CHECK(desktopCommand(R"("/opt/my game/run" %U --flag 100%% %)") ==
        (std::vector<std::string>{"/opt/my game/run", "--flag", "100%", "%"}));
  CHECK(desktopCommand("").empty());

  CHECK(urlFromShortcut("[InternetShortcut]\r\nURL=steam://rungameid/1\r\n") == "steam://rungameid/1");
  CHECK(urlFromShortcut("[InternetShortcut]\nurl = https://example.com \n") == std::nullopt);  // "url " is not "url="
  CHECK(urlFromShortcut("  url=https://example.com  ") == "https://example.com");
  CHECK(!urlFromShortcut("nothing here"));
}

void testPlanLaunch() {
  // Windows: the system decides
  const LaunchPlan win = planLaunch("C:\\Games\\game.exe", Platform::Windows, {});
  CHECK(win.type == LaunchPlan::Type::Open && win.path == "C:\\Games\\game.exe");

  // .desktop launchers
  const std::string desktop = "[Desktop Entry]\nExec=\"/opt/g/my game\" --x %f\nPath=/opt/g\n";
  CHECK(isSpawn(planLaunch("/apps/g.desktop", Platform::Linux, fakeFs(false, desktop)), "/opt/g/my game", {"--x"}, "/opt/g"));
  CHECK(isSpawn(planLaunch("/apps/g.desktop", Platform::Linux, fakeFs(false, "[Desktop Entry]\nExec=game\n")), "game", {},
                "/apps"));
  CHECK(planLaunch("/apps/g.desktop", Platform::Linux, fakeFs(false, "[Desktop Entry]\nExec=top\nTerminal=True\n")).type ==
        LaunchPlan::Type::Error);
  const LaunchPlan noExec = planLaunch("/apps/g.desktop", Platform::Linux, fakeFs(false, "[Desktop Entry]\nName=x\n"));
  CHECK(noExec.type == LaunchPlan::Type::Error && noExec.message == "This .desktop launcher has no Exec= line to run.");
  const LaunchPlan unreadable = planLaunch("/apps/g.desktop", Platform::Linux, fakeFs(false, std::nullopt));
  CHECK(unreadable.type == LaunchPlan::Type::Error && unreadable.message == "Could not read the launcher /apps/g.desktop.");

  // .url shortcuts: only steam:// and web links
  const LaunchPlan steam = planLaunch("/g/s.url", Platform::Linux, fakeFs(false, "[InternetShortcut]\nURL=steam://run/1\n"));
  CHECK(steam.type == LaunchPlan::Type::External && steam.url == "steam://run/1");
  CHECK(planLaunch("/g/s.url", Platform::Linux, fakeFs(false, "URL=HTTPS://example.com\n")).type == LaunchPlan::Type::External);
  CHECK(planLaunch("/g/s.url", Platform::Linux, fakeFs(false, "URL=file:///etc/passwd\n")).type == LaunchPlan::Type::Error);
  CHECK(planLaunch("/g/s.url", Platform::Linux, fakeFs(false, std::nullopt)).type == LaunchPlan::Type::Error);

  // AppImages need the execute bit
  const LaunchPlan notExec = planLaunch("/g/Game.AppImage", Platform::Linux, fakeFs(false, std::nullopt));
  CHECK(notExec.type == LaunchPlan::Type::Error && notExec.message.find("chmod +x \"/g/Game.AppImage\"") != std::string::npos);
  CHECK(isSpawn(planLaunch("/g/Game.AppImage", Platform::Linux, fakeFs(true, std::nullopt)), "/g/Game.AppImage", {}, "/g"));
  CHECK(isSpawn(planLaunch("/g/game.x86_64", Platform::Linux, fakeFs(true, std::nullopt)), "/g/game.x86_64", {}, "/g"));

  // scripts run with sh when they are not executable
  CHECK(isSpawn(planLaunch("/g/start.sh", Platform::Linux, fakeFs(false, std::nullopt)), "sh", {"/g/start.sh"}, "/g"));
  CHECK(isSpawn(planLaunch("/g/start.run", Platform::Linux, fakeFs(true, std::nullopt)), "/g/start.run", {}, "/g"));

  // native programs without an extension
  CHECK(isSpawn(planLaunch("/g/game", Platform::Linux, fakeFs(true, std::nullopt)), "/g/game", {}, "/g"));
  CHECK(isSpawn(planLaunch("/g/game.bin", Platform::Linux, fakeFs(true, std::nullopt)), "/g/game.bin", {}, "/g"));
  CHECK(planLaunch("/g/game", Platform::Linux, fakeFs(false, std::nullopt)).type == LaunchPlan::Type::Open);
  CHECK(planLaunch("/g/game.exe", Platform::Linux, fakeFs(true, std::nullopt)).type == LaunchPlan::Type::Open);
  const LaunchPlan video = planLaunch("/v/a.mkv", Platform::Linux, {});
  CHECK(video.type == LaunchPlan::Type::Open && video.path == "/v/a.mkv");
}

void testOpenItem() {
  std::vector<std::string> marked;
  std::string startError;
  bool startThrows = false;
  LauncherDeps deps{[](const std::string& path) { return path != "/gone.mkv"; },
                    [&](const Item&) -> std::string {
                      if (startThrows) throw std::runtime_error("no program for this file");
                      return startError;
                    },
                    [&](const std::string& id) {
                      marked.push_back(id);
                      return std::int64_t{1234};
                    }};

  bool threw = false;
  try {
    openLibraryItem(make("c", std::nullopt, ItemKind::Collection), deps);
  } catch (const std::runtime_error&) {
    threw = true;
  }
  CHECK(threw);

  CHECK(openLibraryItem(make("v", std::nullopt, ItemKind::Video), deps).status == OpenResult::Status::NoTarget);
  const OpenResult missing = openLibraryItem(make("v", std::nullopt, ItemKind::Video, "v", "/gone.mkv"), deps);
  CHECK(missing.status == OpenResult::Status::Missing && missing.path == "/gone.mkv");

  const OpenResult opened = openLibraryItem(make("v", std::nullopt, ItemKind::Video, "v", "/here.mkv"), deps);
  CHECK(opened.status == OpenResult::Status::Opened && opened.openedAt == 1234 && marked == std::vector<std::string>{"v"});

  // a chapter target is looked for as the book itself
  const OpenResult book = openLibraryItem(make("b", std::nullopt, ItemKind::Readable, "b", joinChapterTarget("/b.cbz", "1")), deps);
  CHECK(book.status == OpenResult::Status::Opened);

  startError = "It did not start.";
  const OpenResult failed = openLibraryItem(make("v2", std::nullopt, ItemKind::Video, "v", "/here.mkv"), deps);
  CHECK(failed.status == OpenResult::Status::Failed && failed.message == "It did not start.");
  startThrows = true;
  const OpenResult thrown = openLibraryItem(make("v3", std::nullopt, ItemKind::Video, "v", "/here.mkv"), deps);
  CHECK(thrown.status == OpenResult::Status::Failed && thrown.message == "no program for this file");
  CHECK(marked.size() == 2);  // failures are not marked as opened

  const std::vector<Item> items{make("a", std::nullopt, ItemKind::Video, "a", "/here.mkv"),
                                make("b", std::nullopt, ItemKind::Video, "b", "/gone.mkv"),
                                make("c", std::nullopt, ItemKind::Collection, "c", "/gone.mkv"),
                                make("d", std::nullopt, ItemKind::Video, "d"),
                                make("e", std::nullopt, ItemKind::Readable, "e", joinChapterTarget("/gone.mkv", ""))};
  CHECK(findMissing(items, deps.exists) == (std::vector<std::string>{"b", "e"}));
}

void testGamesAndApps() {
  const std::vector<Item> items{
      make("games", std::nullopt, ItemKind::Collection, "Games"),
      make("rpg", "games", ItemKind::Collection, "RPG"),
      make("g1", "rpg", ItemKind::Launchable, "Game"),
      make("apps", std::nullopt, ItemKind::Collection, "Whatever"),
      make("a1", "apps", ItemKind::Launchable, "App"),
      make("tools", std::nullopt, ItemKind::Collection, "  APPLICATIONS "),
      make("a2", "tools", ItemKind::Launchable, "Tool"),
      make("v1", "games", ItemKind::Video, "Trailer"),
      make("loose", std::nullopt, ItemKind::Launchable, "Loose"),
      make("orphan", "nowhere", ItemKind::Launchable, "Orphan"),
  };
  const ItemIndex byId = indexById(items);
  CHECK(topSectionOf(items, byId, std::string("rpg")) == std::optional<std::size_t>(0));
  CHECK(topSectionOf(items, byId, std::string("games")) == std::optional<std::size_t>(0));
  CHECK(!topSectionOf(items, byId, std::nullopt));
  CHECK(!topSectionOf(items, byId, std::string("nowhere")));

  CHECK(isAppsSection(items[3]) && isAppsSection(items[5]) && !isAppsSection(items[0]));
  CHECK(isAppsSection(make("x", std::nullopt, ItemKind::Collection, "app")));
  CHECK(!isAppsSection(make("x", std::nullopt, ItemKind::Collection, "My apps")));

  CHECK(opensGameScreen(items, byId, items[2]));
  CHECK(!opensGameScreen(items, byId, items[4]));
  CHECK(!opensGameScreen(items, byId, items[6]));
  CHECK(!opensGameScreen(items, byId, items[7]));  // not a program
  CHECK(opensGameScreen(items, byId, items[8]));
  CHECK(opensGameScreen(items, byId, items[9]));

  // a loop in the data does not hang
  const std::vector<Item> loop{make("p", "q", ItemKind::Collection), make("q", "p", ItemKind::Collection)};
  CHECK(topSectionOf(loop, indexById(loop), std::string("p")).has_value());
}

void testLastPlayedAndDone() {
  const std::int64_t now = 1000 * kDay + 12 * kHour;
  CHECK(lastPlayedText(std::nullopt, now) == "Not played yet");
  CHECK(lastPlayedText(1000 * kDay + kHour, now) == "Played today");
  CHECK(lastPlayedText(now + kHour, now) == "Played today");  // a clock that went back
  CHECK(lastPlayedText(999 * kDay + 23 * kHour, now) == "Played yesterday");
  CHECK(lastPlayedText(997 * kDay, now) == "Played 3 days ago");
  CHECK(lastPlayedText(971 * kDay, now) == "Played 29 days ago");
  CHECK(lastPlayedText(955 * kDay, now) == "Played 1 month ago");
  CHECK(lastPlayedText(940 * kDay, now) == "Played 2 months ago");
  CHECK(lastPlayedText(600 * kDay, now) == "Played 1 year ago");
  CHECK(lastPlayedText(200 * kDay, now) == "Played 2 years ago");
  // the local day decides: 23:00 and 01:00 UTC are different days in UTC, the same day two hours east or west
  const std::int64_t late = 999 * kDay + 23 * kHour;
  const std::int64_t early = 1000 * kDay + kHour;
  CHECK(lastPlayedText(late, early, 0) == "Played yesterday");
  CHECK(lastPlayedText(late, early, 2 * kHour) == "Played today");
  CHECK(lastPlayedText(late, early, -2 * kHour) == "Played today");
  // 20:00 and 21:00 UTC: the same day in UTC, but 23:30 and 00:30 in Tehran (+3:30)
  CHECK(lastPlayedText(999 * kDay + 20 * kHour, 999 * kDay + 21 * kHour, 0) == "Played today");
  CHECK(lastPlayedText(999 * kDay + 20 * kHour, 999 * kDay + 21 * kHour, 3 * kHour + kHour / 2) == "Played yesterday");

  CHECK(doneWord(ItemKind::Video) == "Watched" && doneWord(ItemKind::Readable) == "Read" &&
        doneWord(ItemKind::Audio) == "Listened" && doneWord(ItemKind::Launchable) == "Completed" &&
        doneWord(ItemKind::Collection) == "Done");
  CHECK(markLabel(ItemKind::Video, false) == "Mark as watched");
  CHECK(markLabel(ItemKind::Video, true) == "Mark as not watched");
  CHECK(markLabel(ItemKind::Launchable, false) == "Mark as completed");
  CHECK(markLabel(ItemKind::Collection, false) == "Mark everything inside as done");
  CHECK(markLabel(ItemKind::Collection, true) == "Mark everything inside as not done");
  CHECK(openLabel(ItemKind::Launchable) == "Launch" && openLabel(ItemKind::Video) == "Play" &&
        openLabel(ItemKind::Readable) == "Read" && openLabel(ItemKind::Audio) == "Play" &&
        openLabel(ItemKind::Collection) == "Open");

  const std::vector<Item> items{
      make("A", std::nullopt, ItemKind::Collection), make("v1", "A", ItemKind::Video, "", std::nullopt, true),
      make("v2", "A", ItemKind::Video, "", std::nullopt, true),
      make("B", std::nullopt, ItemKind::Collection), make("v3", "B", ItemKind::Video, "", std::nullopt, true),
      make("v4", "B", ItemKind::Video),
      make("C", "E", ItemKind::Collection),  // empty: never done, so E (which holds it) is not done either
      make("E", std::nullopt, ItemKind::Collection), make("v5", "E", ItemKind::Audio, "", std::nullopt, true),
      make("D", std::nullopt, ItemKind::Collection), make("A2", "D", ItemKind::Collection),
      make("v6", "A2", ItemKind::Readable, "", std::nullopt, true),
  };
  const auto done = doneIdsOf(items);
  CHECK(done == (std::unordered_set<std::string>{"A", "v1", "v2", "v3", "v5", "D", "A2", "v6"}));
  CHECK(doneIdsOf({}).empty());
}

}  // namespace

void testLaunch() {
  testChapterTargetsAndCommands();
  testPlanLaunch();
  testOpenItem();
  testGamesAndApps();
  testLastPlayedAndDone();
}
