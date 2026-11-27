#include "FolderImport.h"

#include <QMetaObject>
#include <QVariantMap>

#include <filesystem>
#include <fstream>
#include <memory>
#include <nlohmann/json.hpp>

#include "rancha/data_paths.h"
#include "rancha/file_kinds.h"
#include "rancha/settings.h"

namespace {

QString kindLabel(rancha::ItemKind kind) {
  switch (kind) {
    case rancha::ItemKind::Collection: return QStringLiteral("Collection");
    case rancha::ItemKind::Launchable: return QStringLiteral("App / Game");
    case rancha::ItemKind::Video: return QStringLiteral("Video");
    case rancha::ItemKind::Readable: return QStringLiteral("Reading");
    case rancha::ItemKind::Audio: return QStringLiteral("Music");
  }
  return {};
}

QString plural(int n, const char* one, const char* many) {
  return QStringLiteral("%1 %2").arg(n).arg(QLatin1String(n == 1 ? one : many));
}

// The emulator profiles of the settings, read only (the file is not changed here).
QVariantList readEmulators() {
  QVariantList list;
  try {
    std::ifstream file(rancha::dataPaths().settings(), std::ios::binary);
    if (!file) return list;
    const auto raw = nlohmann::json::parse(file, nullptr, false);
    if (raw.is_discarded()) return list;
    for (const auto& profile : rancha::sanitizeSettings(raw).emulators) {
      QVariantMap m;
      m[QStringLiteral("id")] = QString::fromStdString(profile.id);
      m[QStringLiteral("name")] = QString::fromStdString(profile.name);
      list.append(m);
    }
  } catch (const std::exception& error) {
    qWarning("Could not read the emulators from the settings: %s", error.what());
  }
  return list;
}

// ROM imports: every game gets the emulator. (The Electron app also picks the most likely installed RetroArch core;
// that comes with the emulators, Q11.)
void applyEmulator(std::vector<rancha::ImportNode>& nodes, const std::string& emulator) {
  for (auto& node : nodes) {
    if (node.kind == rancha::ItemKind::Collection) applyEmulator(node.children, emulator);
    else node.emulator = emulator;
  }
}

}  // namespace

FolderImport::FolderImport(Hooks hooks, QObject* parent) : QAbstractListModel(parent), hooks_(std::move(hooks)) {
  pool_.setMaxThreadCount(1);
}

FolderImport::~FolderImport() {
  ++generation_;
  pool_.waitForDone();
}

int FolderImport::rowCount(const QModelIndex& parent) const { return parent.isValid() ? 0 : static_cast<int>(rows_.size()); }

QHash<int, QByteArray> FolderImport::roleNames() const {
  return {{NameRole, "name"},       {DetailRole, "detail"},     {DepthRole, "depth"},
          {IsFolderRole, "isFolder"}, {ExpandedRole, "expanded"}, {CheckRole, "check"},
          {DuplicateRole, "duplicate"}, {SuggestedRole, "suggested"}, {TipRole, "tip"}};
}

QVariant FolderImport::data(const QModelIndex& index, int role) const {
  if (!index.isValid() || index.row() < 0 || index.row() >= static_cast<int>(rows_.size())) return {};
  const Row& row = rows_[static_cast<std::size_t>(index.row())];
  const rancha::ScanNode& node = *row.node;
  const bool folder = node.kind == rancha::ItemKind::Collection;
  switch (role) {
    case NameRole: case Qt::DisplayRole: return QString::fromStdString(node.name);
    case DetailRole: return folder ? plural(row.inside, "item", "items") : kindLabel(node.kind);
    case DepthRole: return row.depth;
    case IsFolderRole: return folder;
    case ExpandedRole: return folder && (searching() || expanded_.count(node.id) > 0);
    case CheckRole:
      switch (rancha::scan::stateOf(node, checked_)) {
        case rancha::scan::CheckState::All: return QStringLiteral("all");
        case rancha::scan::CheckState::Some: return QStringLiteral("some");
        case rancha::scan::CheckState::None: break;
      }
      return QStringLiteral("none");
    case DuplicateRole: return node.duplicate;
    case SuggestedRole: return node.suggested;
    case TipRole: return QString::fromStdString(node.target.value_or(node.id));
    default: return {};
  }
}

void FolderImport::start(std::optional<std::string> parentId, const QString& parentName, const QStringList& paths,
                         const QString& content) {
  if (paths.isEmpty()) return;
  queue_.assign(paths.begin(), paths.end());
  parentId_ = std::move(parentId);
  parentName_ = parentName;
  startContent_ = rancha::scanContentFromString(content.toStdString());
  emulators_ = readEmulators();
  active_ = true;
  openFirst();
}

void FolderImport::openFirst() {
  // Like a fresh dialog in the Electron app: every folder starts with the choices for the content picked at first.
  content_ = startContent_;
  subfolders_ = true;
  allPrograms_ = false;
  gameFolders_ = false;
  const auto defaults = rancha::scan::defaultsFor(content_);
  layout_ = defaults.layout;
  wrap_ = defaults.wrap;
  wrapName_.clear();
  emulator_.clear();
  search_.clear();
  words_.clear();
  busy_ = false;
  rescan();
}

void FolderImport::rescan() {
  const int generation = ++generation_;
  scanning_ = true;
  error_.clear();
  beginResetModel();
  scan_.reset();
  shown_.clear();
  rows_.clear();
  endResetModel();
  checked_.clear();
  expanded_.clear();
  total_ = shownCount_ = importCount_ = 0;
  emit changed();

  const std::string path = folderPath().toStdString();
  rancha::ScanOptions options;
  options.content = content_;
  options.subfolders = subfolders_;
  options.allPrograms = allPrograms_;
  options.gameFolders = gameFolders_;
  // The library is only read on this thread; the scan itself runs in the background.
  auto keys = std::make_shared<std::unordered_set<std::string>>(hooks_.existingKeys ? hooks_.existingKeys()
                                                                                    : std::unordered_set<std::string>{});
  pool_.start([this, generation, path, options, keys] {
    auto result = std::make_shared<std::optional<rancha::FolderScan>>();
    QString problem;
    try {
      std::error_code error;
      if (!std::filesystem::is_directory(rancha::pathFromUtf8(path), error)) {
        problem = QStringLiteral("That folder could not be opened.");
      } else {
        *result = rancha::scanFolder(path, options);
        rancha::markDuplicates((*result)->nodes, *keys, rancha::kWindowsPaths);
      }
    } catch (const std::exception& e) {
      problem = QString::fromUtf8(e.what());
    }
    QMetaObject::invokeMethod(
        this, [this, generation, result, problem] { finishScan(generation, std::move(*result), problem); },
        Qt::QueuedConnection);
  });
}

void FolderImport::finishScan(int generation, std::optional<rancha::FolderScan> result, const QString& problem) {
  if (generation != generation_ || !active_) return;  // a newer scan has started, or the dialog was closed
  scanning_ = false;
  if (!problem.isEmpty() || !result) {
    error_ = problem.isEmpty() ? QStringLiteral("That folder could not be opened.") : problem;
    emit changed();
    return;
  }
  scan_ = std::move(result);
  checked_ = rancha::scan::initialChecked(scan_->nodes);
  expanded_.clear();
  if (wrapName_.isEmpty()) wrapName_ = QString::fromStdString(scan_->rootName);
  total_ = static_cast<int>(rancha::scan::leavesOf(scan_->nodes).size());
  rebuildRows();
  afterTicks();
}

void FolderImport::collectRows(const std::vector<rancha::ScanNode>& nodes, int depth, bool openAll, std::vector<Row>& out) const {
  for (const rancha::ScanNode& node : nodes) {
    const bool folder = node.kind == rancha::ItemKind::Collection;
    out.push_back({&node, depth, folder ? static_cast<int>(rancha::scan::leavesOf(node.children).size()) : 0});
    if (folder && (openAll || expanded_.count(node.id))) collectRows(node.children, depth + 1, openAll, out);
  }
}

void FolderImport::rebuildRows() {
  // While searching, only what matches is shown, with every folder on the way opened.
  beginResetModel();
  rows_.clear();
  shown_ = scan_ ? rancha::scan::filterTree(scan_->nodes, words_) : std::vector<rancha::ScanNode>{};
  collectRows(shown_, 0, searching(), rows_);
  shownCount_ = static_cast<int>(rancha::scan::leavesOf(shown_).size());
  endResetModel();
}

void FolderImport::recount() {
  importCount_ = scan_ ? rancha::scan::countImport(rancha::scan::buildImport(
                             scan_->nodes, checked_, layout_, wrap_ ? wrapName_.toStdString() : std::string()))
                       : 0;
}

void FolderImport::afterTicks() {
  recount();
  if (!rows_.empty()) emit dataChanged(index(0), index(static_cast<int>(rows_.size()) - 1), {CheckRole});
  emit changed();
}

void FolderImport::setContent(const QString& value) {
  const auto next = rancha::scanContentFromString(value.toStdString());
  if (next == content_) return;
  content_ = next;
  const auto defaults = rancha::scan::defaultsFor(next);  // each kind of content has its own usual choice
  layout_ = defaults.layout;
  wrap_ = defaults.wrap;
  rescan();
}

void FolderImport::setSubfolders(bool value) {
  if (value == subfolders_) return;
  subfolders_ = value;
  rescan();
}

void FolderImport::setAllPrograms(bool value) {
  if (value == allPrograms_) return;
  allPrograms_ = value;
  rescan();
}

void FolderImport::setGameFolders(bool value) {
  if (value == gameFolders_) return;
  gameFolders_ = value;
  rescan();
}

QString FolderImport::layout() const {
  return layout_ == rancha::scan::Layout::Flat ? QStringLiteral("flat") : QStringLiteral("tree");
}

void FolderImport::setLayout(const QString& value) {
  const auto next = value == QLatin1String("flat") ? rancha::scan::Layout::Flat : rancha::scan::Layout::Tree;
  if (next == layout_) return;
  layout_ = next;
  recount();
  emit changed();
}

void FolderImport::setWrap(bool value) {
  if (value == wrap_) return;
  wrap_ = value;
  recount();
  emit changed();
}

void FolderImport::setWrapName(const QString& value) {
  if (value == wrapName_) return;
  wrapName_ = value.left(200);
  recount();
  emit changed();
}

void FolderImport::setEmulator(const QString& value) {
  if (value == emulator_) return;
  emulator_ = value;
  if (!emulator_.isEmpty()) error_.clear();
  emit changed();
}

void FolderImport::setSearch(const QString& value) {
  if (value == search_) return;
  search_ = value;
  words_ = rancha::scan::searchWords(value.toStdString());
  rebuildRows();
  emit changed();
}

QVariantList FolderImport::contentChoices() const {
  static const struct { const char* value; const char* label; const char* hint; } choices[] = {
      {"games", "Games and apps", "One entry per game: the program that starts it, with its icon"},
      {"roms", "Console games (ROMs)", "Nintendo, PlayStation…: runs with RetroArch or another emulator"},
      {"videos", "Videos, anime, series", "Video files, with folders and seasons kept"},
      {"comics", "Comics, manga, books", ".cbz, .cbr, PDF and folders of pictures"},
      {"music", "Music", "mp3, flac, ogg, wav, m4a… with folders (albums) kept"},
      {"all", "A mix of everything", "Show every kind of file that can be added"}};
  QVariantList list;
  for (const auto& choice : choices) {
    QVariantMap m;
    m[QStringLiteral("value")] = QString::fromUtf8(choice.value);
    m[QStringLiteral("label")] = QString::fromUtf8(choice.label);
    m[QStringLiteral("hint")] = QString::fromUtf8(choice.hint);
    list.append(m);
  }
  return list;
}

QString FolderImport::emptyText() const {
  if (!scan_) return {};
  QString text = QStringLiteral("Nothing that can be added was found in this folder");
  if (scan_->ignoredFiles > 0) text += QStringLiteral(" (%1 files of other types were ignored)").arg(scan_->ignoredFiles);
  text += QStringLiteral(". ");
  switch (content_) {
    case rancha::ScanContent::Roms: text += QStringLiteral("Looked for console game files (.sfc, .gba, .iso, .chd, .rvz …)."); break;
    case rancha::ScanContent::Games: text += QStringLiteral("Looked for programs (.exe, .sh, AppImage…), shortcuts and game folders."); break;
    case rancha::ScanContent::Videos: text += QStringLiteral("Looked for video files."); break;
    case rancha::ScanContent::Comics: text += QStringLiteral("Looked for .cbz/.cbr/PDF files and folders of pictures."); break;
    default: text += QStringLiteral("Programs, shortcuts, videos, .cbz/.cbr/PDF files and folders of pictures are recognised."); break;
  }
  return text + QStringLiteral(" Try another choice above if this is not what the folder holds.");
}

QString FolderImport::notes() const {
  if (!scan_) return {};
  QStringList parts;
  if (scan_->truncated)
    parts << QStringLiteral("Too many things were found; only the first part is listed. Add it, then add the folder again for the rest.");
  if (scan_->unreadable > 0) parts << QStringLiteral("%1 folder(s) could not be opened.").arg(scan_->unreadable);
  if (scan_->ignoredFiles > 0) parts << QStringLiteral("%1 files of other types were ignored.").arg(scan_->ignoredFiles);
  return parts.join(QLatin1Char(' '));
}

bool FolderImport::canAdd() const {
  return scan_ && !busy_ && !scanning_ && importCount_ > 0 && !(content_ == rancha::ScanContent::Roms && emulator_.isEmpty());
}

QString FolderImport::addLabel() const {
  if (busy_) return QStringLiteral("Adding…");
  if (importCount_ == 0) return QStringLiteral("Nothing selected");
  if (content_ == rancha::ScanContent::Roms && emulator_.isEmpty()) return QStringLiteral("Choose an emulator first");
  return QStringLiteral("Add ") + plural(importCount_, "item", "items");
}

void FolderImport::toggleRow(int row) {
  if (row < 0 || row >= static_cast<int>(rows_.size())) return;
  const rancha::ScanNode& node = *rows_[static_cast<std::size_t>(row)].node;
  checked_ = rancha::scan::setNode(node, rancha::scan::nextOn(rancha::scan::stateOf(node, checked_)), checked_);
  afterTicks();
}

void FolderImport::toggleExpanded(int row) {
  if (row < 0 || row >= static_cast<int>(rows_.size()) || searching()) return;  // while searching every folder is open
  const rancha::ScanNode& node = *rows_[static_cast<std::size_t>(row)].node;
  if (node.kind != rancha::ItemKind::Collection) return;
  if (!expanded_.erase(node.id)) expanded_.insert(node.id);
  rebuildRows();
}

void FolderImport::selectShown(bool on) {
  checked_ = rancha::scan::setLeaves(shown_, on, checked_);
  afterTicks();
}

void FolderImport::expandAll() {
  if (!scan_) return;
  const auto ids = rancha::scan::collectionIds(scan_->nodes);
  expanded_ = std::unordered_set<std::string>(ids.begin(), ids.end());
  rebuildRows();
}

void FolderImport::collapseAll() {
  expanded_.clear();
  rebuildRows();
}

void FolderImport::add() {
  if (!scan_ || busy_ || importCount_ == 0) return;
  if (content_ == rancha::ScanContent::Roms && emulator_.isEmpty()) {
    error_ = QStringLiteral("Choose the emulator for these games first (add one in Settings > Emulators).");
    emit changed();
    return;
  }
  busy_ = true;
  error_.clear();
  emit changed();
  doAdd();
}

void FolderImport::doAdd() {
  auto nodes = rancha::scan::buildImport(scan_->nodes, checked_, layout_, wrap_ ? wrapName_.toStdString() : std::string());
  if (content_ == rancha::ScanContent::Roms) applyEmulator(nodes, emulator_.toStdString());
  rancha::TreeImportResult result;
  try {
    if (!hooks_.importTree) throw std::runtime_error("Adding is not available.");
    result = hooks_.importTree(parentId_, nodes);
  } catch (const std::exception& problem) {
    busy_ = false;
    error_ = QString::fromUtf8(problem.what());
    emit changed();
    return;
  }
  QString message = QStringLiteral("Added ") + plural(result.added, "item", "items");
  if (result.collections > 0) message += QStringLiteral(" in ") + plural(result.collections, "collection", "collections");
  if (result.duplicates > 0) message += QStringLiteral(" (%1 already in the library were skipped)").arg(result.duplicates);
  emit imported(message + QLatin1Char('.'));
  next();
}

void FolderImport::cancel() {
  if (busy_) return;
  next();
}

void FolderImport::next() {
  if (!queue_.empty()) queue_.pop_front();
  if (queue_.empty()) close();
  else openFirst();
}

void FolderImport::close() {
  ++generation_;  // a scan still running is thrown away
  active_ = false;
  scanning_ = false;
  busy_ = false;
  beginResetModel();
  scan_.reset();
  shown_.clear();
  rows_.clear();
  endResetModel();
  checked_.clear();
  expanded_.clear();
  emit changed();
}
