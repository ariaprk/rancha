#pragma once
// The logic behind the "Add a folder" preview: which things are ticked, how a collection's tick box reflects
// what is inside it, and how the final list of things to add is built.
// Port of the Electron app's src/renderer/src/lib/scanTree.ts.
#include <string>
#include <unordered_set>
#include <vector>

#include "rancha/folder_scan.h"
#include "rancha/item_repository.h"

namespace rancha::scan {

enum class Layout { Tree, Flat };
enum class CheckState { All, Some, None };
using Checked = std::unordered_set<std::string>;

/// Every file-backed thing (not folders-of-things), in on-screen order.
std::vector<const ScanNode*> leavesOf(const std::vector<ScanNode>& nodes);
/// The leaves ticked at the start: everything except installers and things already in the library.
Checked initialChecked(const std::vector<ScanNode>& nodes);
CheckState stateOf(const ScanNode& node, const Checked& checked);
/// Ticks or unticks a thing (a collection toggles everything inside it).
Checked setNode(const ScanNode& node, bool on, const Checked& checked);
Checked setAll(const std::vector<ScanNode>& nodes, bool on);
/// Clicking a tick box: "some" becomes all ticked, otherwise it flips.
inline bool nextOn(CheckState state) { return state != CheckState::All; }

/// What will actually be added. Tree keeps the folders, Flat puts every ticked item in one list. Collections
/// with nothing ticked inside are left out. A non-empty `wrapName` puts everything in one new collection.
std::vector<ImportNode> buildImport(const std::vector<ScanNode>& nodes, const Checked& checked, Layout layout,
                                    const std::string& wrapName);
int countImport(const std::vector<ImportNode>& items);

struct Defaults {
  Layout layout = Layout::Tree;
  bool wrap = false;
};
/// What is chosen at the start for each kind of content.
Defaults defaultsFor(ScanContent content);

/// Splits what was typed into lower-case words.
std::vector<std::string> searchWords(const std::string& text);
/// Keeps only what matches ALL the words (in a name or the file's path), plus the folders leading to it.
/// A folder whose own name matches is kept whole. No words = nothing is filtered.
std::vector<ScanNode> filterTree(const std::vector<ScanNode>& nodes, const std::vector<std::string>& words);
/// Ticks or unticks exactly the things in this (possibly filtered) list.
Checked setLeaves(const std::vector<ScanNode>& nodes, bool on, const Checked& checked);
std::vector<std::string> collectionIds(const std::vector<ScanNode>& nodes);

}  // namespace rancha::scan
