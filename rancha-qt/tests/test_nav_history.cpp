#include <string>
#include <vector>

#include "check.h"
#include "rancha/nav_history.h"

using namespace rancha;

void testNavHistory() {
  using H = NavHistory<std::string>;
  const auto same = [](const std::string& a, const std::string& b) { return a == b; };
  const auto all = [](const std::string&) { return true; };

  H h;
  // the same place twice is not a step
  CHECK(visit(h, std::string("home"), std::string("home"), same).back.empty());

  h = visit(h, std::string("home"), std::string("games"), same);
  h = visit(h, std::string("games"), std::string("rpg"), same);
  CHECK(h.back == (std::vector<std::string>{"home", "games"}) && h.forward.empty());

  // back, back, then nowhere to go
  auto step = stepBack(h, std::string("rpg"), all);
  CHECK(step && step->target == "games" && step->history.forward == (std::vector<std::string>{"rpg"}));
  auto step2 = stepBack(step->history, std::string("games"), all);
  CHECK(step2 && step2->target == "home" && step2->history.back.empty());
  CHECK(!stepBack(step2->history, std::string("home"), all));

  // forward undoes back
  auto fwd = stepForward(step2->history, std::string("home"), all);
  CHECK(fwd && fwd->target == "games" && fwd->history.back == (std::vector<std::string>{"home"}));
  CHECK(!stepForward(H{}, std::string("home"), all));

  // a normal visit forgets the forward trail
  CHECK(visit(fwd->history, std::string("games"), std::string("video"), same).forward.empty());

  // a deleted place is skipped
  const auto noGames = [](const std::string& place) { return place != "games"; };
  auto skip = stepBack(h, std::string("rpg"), noGames);
  CHECK(skip && skip->target == "home" && skip->history.back.empty());
  CHECK(!stepBack(H{{"games"}, {}}, std::string("x"), noGames));

  // the trail keeps the last 60 places
  H longTrail;
  for (int i = 0; i < 100; ++i) longTrail = visit(longTrail, std::to_string(i), std::to_string(i + 1), same);
  CHECK(longTrail.back.size() == kMaxHistoryEntries && longTrail.back.front() == "40" && longTrail.back.back() == "99");
}
