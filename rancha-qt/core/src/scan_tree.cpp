// Port of src/renderer/src/lib/scanTree.ts.
#include "rancha/scan_tree.h"

#include <algorithm>

#include "rancha/library_query.h"

namespace rancha::scan {
namespace {

void collectLeaves(const std::vector<ScanNode>& nodes, std::vector<const ScanNode*>& out) {
  for (const ScanNode& node : nodes) {
    if (node.kind == ItemKind::Collection) collectLeaves(node.children, out);
    else out.push_back(&node);
  }
}

ImportNode importLeaf(const ScanNode& node) {
  ImportNode out;
  out.name = node.name;
  out.kind = node.kind;
  out.target = node.target;
  return out;
}

std::vector<ImportNode> keepTree(const std::vector<ScanNode>& list, const Checked& checked) {
  std::vector<ImportNode> out;
  for (const ScanNode& node : list) {
    if (node.kind == ItemKind::Collection) {
      auto children = keepTree(node.children, checked);
      if (!children.empty()) {
        ImportNode folder;
        folder.name = node.name;
        folder.kind = ItemKind::Collection;
        folder.children = std::move(children);
        out.push_back(std::move(folder));
      }
    } else if (checked.count(node.id)) {
      out.push_back(importLeaf(node));
    }
  }
  return out;
}

bool isSpace(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v'; }

std::string trim(const std::string& text) {
  std::size_t from = 0, to = text.size();
  while (from < to && isSpace(text[from])) ++from;
  while (to > from && isSpace(text[to - 1])) --to;
  return text.substr(from, to - from);
}

}  // namespace

std::vector<const ScanNode*> leavesOf(const std::vector<ScanNode>& nodes) {
  std::vector<const ScanNode*> out;
  collectLeaves(nodes, out);
  return out;
}

Checked initialChecked(const std::vector<ScanNode>& nodes) {
  Checked out;
  for (const ScanNode* leaf : leavesOf(nodes))
    if (leaf->suggested && !leaf->duplicate) out.insert(leaf->id);
  return out;
}

CheckState stateOf(const ScanNode& node, const Checked& checked) {
  if (node.kind != ItemKind::Collection) return checked.count(node.id) ? CheckState::All : CheckState::None;
  const auto leaves = leavesOf(node.children);
  if (leaves.empty()) return CheckState::None;
  const auto on = std::count_if(leaves.begin(), leaves.end(), [&](const ScanNode* l) { return checked.count(l->id) > 0; });
  if (on == 0) return CheckState::None;
  return on == static_cast<long>(leaves.size()) ? CheckState::All : CheckState::Some;
}

Checked setNode(const ScanNode& node, bool on, const Checked& checked) {
  Checked next = checked;
  const auto apply = [&](const ScanNode& leaf) {
    if (on) next.insert(leaf.id);
    else next.erase(leaf.id);
  };
  if (node.kind == ItemKind::Collection) {
    for (const ScanNode* leaf : leavesOf(node.children)) apply(*leaf);
  } else {
    apply(node);
  }
  return next;
}

Checked setAll(const std::vector<ScanNode>& nodes, bool on) {
  Checked out;
  if (on)
    for (const ScanNode* leaf : leavesOf(nodes)) out.insert(leaf->id);
  return out;
}

std::vector<ImportNode> buildImport(const std::vector<ScanNode>& nodes, const Checked& checked, Layout layout,
                                    const std::string& wrapName) {
  std::vector<ImportNode> body;
  if (layout == Layout::Tree) {
    body = keepTree(nodes, checked);
  } else {
    for (const ScanNode* leaf : leavesOf(nodes))
      if (checked.count(leaf->id)) body.push_back(importLeaf(*leaf));
  }
  const std::string name = trim(wrapName);
  if (!name.empty() && !body.empty()) {
    ImportNode wrap;
    wrap.name = name;
    wrap.kind = ItemKind::Collection;
    wrap.children = std::move(body);
    return {std::move(wrap)};
  }
  return body;
}

int countImport(const std::vector<ImportNode>& items) {
  int total = 0;
  for (const ImportNode& item : items) total += item.kind == ItemKind::Collection ? countImport(item.children) : 1;
  return total;
}

Defaults defaultsFor(ScanContent content) {
  switch (content) {
    case ScanContent::Games: return {Layout::Flat, false};  // games: one plain list
    case ScanContent::Roms:                                // one collection per console folder, inside one new collection
    case ScanContent::Videos:
    case ScanContent::Comics:
    case ScanContent::Music: return {Layout::Tree, true};  // keep the structure, inside one collection
    case ScanContent::All: break;
  }
  return {Layout::Tree, false};
}

std::vector<std::string> searchWords(const std::string& text) { return splitWords(text); }

std::vector<ScanNode> filterTree(const std::vector<ScanNode>& nodes, const std::vector<std::string>& words) {
  if (words.empty()) return nodes;
  const auto matches = [&](const std::string& text) {
    return std::all_of(words.begin(), words.end(), [&](const std::string& w) { return text.find(w) != std::string::npos; });
  };
  std::vector<ScanNode> out;
  for (const ScanNode& node : nodes) {
    if (node.kind == ItemKind::Collection) {
      if (matches(lowerAscii(node.name))) {
        out.push_back(node);
      } else {
        auto children = filterTree(node.children, words);
        if (!children.empty()) {
          ScanNode copy = node;
          copy.children = std::move(children);
          out.push_back(std::move(copy));
        }
      }
    } else if (matches(lowerAscii(node.name + " " + node.target.value_or("")))) {
      out.push_back(node);
    }
  }
  return out;
}

Checked setLeaves(const std::vector<ScanNode>& nodes, bool on, const Checked& checked) {
  Checked next = checked;
  for (const ScanNode* leaf : leavesOf(nodes)) {
    if (on) next.insert(leaf->id);
    else next.erase(leaf->id);
  }
  return next;
}

std::vector<std::string> collectionIds(const std::vector<ScanNode>& nodes) {
  std::vector<std::string> out;
  for (const ScanNode& node : nodes) {
    if (node.kind != ItemKind::Collection) continue;
    out.push_back(node.id);
    auto inner = collectionIds(node.children);
    out.insert(out.end(), inner.begin(), inner.end());
  }
  return out;
}

}  // namespace rancha::scan
