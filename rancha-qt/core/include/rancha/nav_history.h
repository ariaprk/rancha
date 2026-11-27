#pragma once
// Back / forward history for the library (like a browser's): every time you open a folder or page, the place you
// left is remembered, so Back returns to it and Forward undoes Back. Places that no longer exist (a deleted
// collection) are skipped.
//
// Port of the Electron app's src/renderer/src/lib/navHistory.ts. A template over the "place" type, so it is tested
// on its own with plain values.
#include <cstddef>
#include <optional>
#include <utility>
#include <vector>

namespace rancha {

template <typename T>
struct NavHistory {
  std::vector<T> back;
  std::vector<T> forward;
};

inline constexpr std::size_t kMaxHistoryEntries = 60;

template <typename T>
struct NavStep {
  NavHistory<T> history;
  T target;
};

/// Called when moving from `current` to `next` normally: remembers `current`, forgets the forward trail.
template <typename T, typename Same>
NavHistory<T> visit(const NavHistory<T>& history, const T& current, const T& next, Same same) {
  if (same(current, next)) return history;
  std::vector<T> trail = history.back;
  if (trail.empty() || !same(trail.back(), current)) trail.push_back(current);
  if (trail.size() > kMaxHistoryEntries) trail.erase(trail.begin(), trail.end() - kMaxHistoryEntries);
  return {std::move(trail), {}};
}

/// Steps back to the nearest place that still exists. None when there is nowhere to go.
template <typename T, typename Exists>
std::optional<NavStep<T>> stepBack(const NavHistory<T>& history, const T& current, Exists exists) {
  std::vector<T> back = history.back;
  while (!back.empty()) {
    T target = back.back();
    back.pop_back();
    if (exists(target)) {
      std::vector<T> forward = history.forward;
      forward.push_back(current);
      return NavStep<T>{{std::move(back), std::move(forward)}, std::move(target)};
    }
  }
  return std::nullopt;
}

/// Steps forward (undoing a Back) to the nearest place that still exists.
template <typename T, typename Exists>
std::optional<NavStep<T>> stepForward(const NavHistory<T>& history, const T& current, Exists exists) {
  std::vector<T> forward = history.forward;
  while (!forward.empty()) {
    T target = forward.back();
    forward.pop_back();
    if (exists(target)) {
      std::vector<T> back = history.back;
      back.push_back(current);
      return NavStep<T>{{std::move(back), std::move(forward)}, std::move(target)};
    }
  }
  return std::nullopt;
}

}  // namespace rancha
