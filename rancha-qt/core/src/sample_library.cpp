// GENERATED from the Electron app's sample library (src/main/db/sampleLibrary.ts). SAMPLE DATA ONLY: all names are invented.
#include "rancha/sample_library.h"

#include <utility>

namespace rancha {

namespace {
constexpr std::int64_t kHour = 3600000;
}  // namespace

std::vector<Item> sampleItems(std::int64_t nowMs) {
  std::vector<Item> items;
  int counter = 0;
  auto add = [&](const char* id, const char* parent, ItemKind kind, const char* name, int hue) -> Item& {
    ++counter;
    Item item;
    item.id = id;
    if (parent) item.parentId = std::string(parent);
    item.kind = kind;
    item.name = name;
    item.hue = hue;
    item.sortOrder = counter;
    item.createdAt = nowMs - counter * 7 * kHour;
    items.push_back(std::move(item));
    return items.back();
  };
  add("games", nullptr, ItemKind::Collection, "Games", 265);
  add("reading", nullptr, ItemKind::Collection, "Reading", 20);
  add("video", nullptr, ItemKind::Collection, "Video", 200);
  add("apps", nullptr, ItemKind::Collection, "Applications", 150);
  add("music", nullptr, ItemKind::Collection, "Music", 120);
  add("games-rpg", "games", ItemKind::Collection, "RPG", 280);
  {
    Item& item = add("starfall", "games-rpg", ItemKind::Launchable, "Starfall Chronicles", 250);
    item.description = "A sprawling space-fantasy role-playing game.";
    item.tags = {"rpg", "story"};
    item.isFavorite = true;
    item.lastOpenedAt = nowMs - 2 * kHour;
  }
  {
    Item& item = add("ember-keep", "games-rpg", ItemKind::Launchable, "Ember Keep", 15);
    item.description = "Dungeon crawler with a hand-drawn look.";
    item.tags = {"rpg", "dungeon"};
  }
  {
    Item& item = add("moonlit-vale", "games-rpg", ItemKind::Launchable, "Moonlit Vale", 170);
    item.description = "Cozy farming adventure.";
    item.tags = {"rpg", "cozy"};
    item.isFavorite = true;
  }
  add("games-strategy", "games", ItemKind::Collection, "Strategy", 40);
  {
    Item& item = add("iron-frontier", "games-strategy", ItemKind::Launchable, "Iron Frontier", 30);
    item.tags = {"strategy"};
  }
  {
    Item& item = add("tidewater", "games-strategy", ItemKind::Launchable, "Tidewater", 195);
    item.tags = {"strategy", "building"};
    item.lastOpenedAt = nowMs - 30 * kHour;
  }
  {
    Item& item = add("neon-drift", "games", ItemKind::Launchable, "Neon Drift", 320);
    item.description = "Arcade racing at night.";
    item.tags = {"racing"};
  }
  {
    Item& item = add("puzzle-orchard", "games", ItemKind::Launchable, "Puzzle Orchard", 95);
    item.tags = {"puzzle"};
  }
  add("reading-manga", "reading", ItemKind::Collection, "Manga", 350);
  {
    Item& item = add("blade-dawn", "reading-manga", ItemKind::Collection, "Blade of Dawn", 5);
    item.description = "A swordsman travels east. Read right-to-left.";
    item.tags = {"manga", "action"};
    item.isFavorite = true;
  }
  {
    Item& item = add("blade-dawn-1", "blade-dawn", ItemKind::Readable, "Volume 1", 8);
    item.lastOpenedAt = nowMs - 5 * kHour;
  }
  add("blade-dawn-2", "blade-dawn", ItemKind::Readable, "Volume 2", 12);
  add("blade-dawn-3", "blade-dawn", ItemKind::Readable, "Volume 3", 16);
  {
    Item& item = add("quiet-harbor", "reading-manga", ItemKind::Collection, "Quiet Harbor", 205);
    item.tags = {"manga", "slice of life"};
  }
  add("quiet-harbor-1", "quiet-harbor", ItemKind::Readable, "Chapter 1", 200);
  add("reading-comics", "reading", ItemKind::Collection, "Comics", 55);
  {
    Item& item = add("nova-squad-1", "reading-comics", ItemKind::Readable, "Nova Squad #1", 230);
    item.tags = {"comic", "superhero"};
  }
  {
    Item& item = add("nova-squad-2", "reading-comics", ItemKind::Readable, "Nova Squad #2", 235);
    item.tags = {"comic", "superhero"};
  }
  add("video-anime", "video", ItemKind::Collection, "Anime", 300);
  {
    Item& item = add("skyward", "video-anime", ItemKind::Collection, "Skyward Academy", 210);
    item.description = "Students learn to fly airships.";
    item.tags = {"anime", "adventure"};
    item.isFavorite = true;
  }
  add("skyward-s1", "skyward", ItemKind::Collection, "Season 1", 212);
  {
    Item& item = add("skyward-s1e1", "skyward-s1", ItemKind::Video, "Episode 1", 214);
    item.lastOpenedAt = nowMs - 50 * kHour;
  }
  add("skyward-s1e2", "skyward-s1", ItemKind::Video, "Episode 2", 216);
  add("skyward-s1e3", "skyward-s1", ItemKind::Video, "Episode 3", 218);
  add("skyward-s2", "skyward", ItemKind::Collection, "Season 2", 190);
  add("skyward-s2e1", "skyward-s2", ItemKind::Video, "Episode 1", 192);
  add("skyward-s2e2", "skyward-s2", ItemKind::Video, "Episode 2", 194);
  add("video-movies", "video", ItemKind::Collection, "Movies", 25);
  {
    Item& item = add("paper-lanterns", "video-movies", ItemKind::Video, "Paper Lanterns", 35);
    item.description = "A quiet animated film.";
    item.tags = {"movie", "animation"};
  }
  add("apps-prod", "apps", ItemKind::Collection, "Productivity", 160);
  add("apps-img", "apps-prod", ItemKind::Collection, "Image Editors", 130);
  {
    Item& item = add("pixel-forge", "apps-img", ItemKind::Launchable, "Pixel Forge", 140);
    item.tags = {"image", "editor"};
  }
  {
    Item& item = add("sketchbook", "apps-img", ItemKind::Launchable, "Sketchbook Lite", 110);
    item.tags = {"drawing"};
  }
  {
    Item& item = add("notes-pro", "apps-prod", ItemKind::Launchable, "Notes Pro", 60);
    item.tags = {"notes"};
  }
  add("apps-media", "apps", ItemKind::Collection, "Media Tools", 330);
  {
    Item& item = add("audio-lab", "apps-media", ItemKind::Launchable, "Audio Lab", 340);
    item.tags = {"audio"};
  }
  return items;
}

}  // namespace rancha
