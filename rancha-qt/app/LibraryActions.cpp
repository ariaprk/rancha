// LibraryModel, part two: the changes (adding, editing, covers, move, delete, multi-select, bulk changes).
// Port of the Electron app's App.tsx handlers (handleAdd, handleSaved, confirmMove, confirmDelete, reorder, setDone)
// and of ipc.ts importPaths. The rules themselves live in the core (ItemRepository, selection.h, crop_math.h).
#include <QBuffer>
#include <QClipboard>
#include <QDateTime>
#include <QDesktopServices>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QGuiApplication>
#include <QImage>
#include <QImageReader>
#include <QMimeData>
#include <QPainter>
#include <QProcess>
#include <QRandomGenerator>
#include <QUuid>

#include <algorithm>
#include <fstream>
#include <map>
#include <nlohmann/json.hpp>

#include "LibraryModel.h"
#include "ThemeBridge.h"
#include "rancha/cover.h"
#include "rancha/crop_math.h"
#include "rancha/data_paths.h"
#include "rancha/file_kinds.h"
#include "rancha/launch.h"
#include "rancha/settings.h"

namespace {

std::vector<std::string> toStd(const QStringList& list) {
  std::vector<std::string> out;
  out.reserve(static_cast<std::size_t>(list.size()));
  for (const auto& s : list) out.push_back(s.toStdString());
  return out;
}

QStringList toQt(const std::vector<std::string>& list) {
  QStringList out;
  for (const auto& s : list) out << QString::fromStdString(s);
  return out;
}

QString plural(int n, const char* one, const char* many) {
  return QStringLiteral("%1 %2").arg(n).arg(QLatin1String(n == 1 ? one : many));
}

QVariant optionalText(const std::optional<std::string>& value) {
  return value ? QVariant(QString::fromStdString(*value)) : QVariant(QString());
}

// "" from the editor means "none".
rancha::Nullable nullableOf(const QVariantMap& data, const QString& key) {
  const QString text = data.value(key).toString().trimmed();
  if (text.isEmpty()) return std::nullopt;
  return text.toStdString();
}

std::vector<std::string> tagListFrom(const QVariant& value) {
  std::vector<std::string> out;
  std::vector<std::string> seen;  // lower case
  for (const auto& v : value.toList()) {
    const std::string tag = v.toString().trimmed().toStdString();
    if (tag.empty()) continue;
    const std::string lower = rancha::lowerAscii(tag);
    if (std::find(seen.begin(), seen.end(), lower) != seen.end()) continue;
    seen.push_back(lower);
    out.push_back(tag);
  }
  return out;
}

rancha::crop::Size frameOf(const QString& shape) {
  return shape == QLatin1String("wallpaper") ? rancha::crop::kWallpaperFrame : rancha::crop::kCoverFrame;
}

rancha::crop::View viewOf(const QVariantMap& map) {
  return {map.value(QStringLiteral("scale"), 1.0).toDouble(), map.value(QStringLiteral("offsetX")).toDouble(),
          map.value(QStringLiteral("offsetY")).toDouble()};
}

QVariantMap failure(const QString& error) {
  return {{QStringLiteral("ok"), false}, {QStringLiteral("error"), error}};
}

QImage readPicture(const QString& path, QString* error) {
  QImageReader reader(path);
  reader.setAutoTransform(true);  // photos keep the way up they were taken
  QImage image = reader.read();
  if (image.isNull() && error) *error = QStringLiteral("This picture could not be opened (%1).").arg(reader.errorString());
  return image;
}

}  // namespace

LibraryModel::~LibraryModel() {
  for (const auto& path : std::as_const(tempPictures_)) QFile::remove(path);
  // Pictures chosen in an editor that was then cancelled are not used by any item: they are removed here.
  if (repo_ && covers_) {
    try {
      const auto files = repo_->listCoverFiles();
      covers_->sweep({files.begin(), files.end()});
    } catch (const std::exception& error) {
      qWarning("Could not tidy the covers folder: %s", error.what());
    }
  }
}

// ---------------------------------------------------------------- small helpers

const rancha::Item* LibraryModel::find(const std::string& id) const {
  const auto it = byId_.find(id);
  return it == byId_.end() ? nullptr : &items_[it->second];
}

QString LibraryModel::nameOrHome(const std::optional<std::string>& id) const {
  if (!id || id->empty()) return QStringLiteral("Home");
  const rancha::Item* item = find(*id);
  return item ? QString::fromStdString(item->name) : QStringLiteral("Home");
}

QString LibraryModel::notOpen() const {
  return QStringLiteral("The library is not open, so changes cannot be saved (this is the sample library).");
}

QString LibraryModel::folderName() const {
  if (viewType_ != rancha::ViewType::Folder) return QStringLiteral("Home");
  return nameOrHome(currentId_);
}

void LibraryModel::showStatus(const QString& text) { setStatus(text); }

std::vector<std::string> LibraryModel::shownIds() const {
  std::vector<std::string> ids;
  ids.reserve(view_.size());
  for (std::size_t at : view_) ids.push_back(items_[at].id);
  return ids;
}

QString LibraryModel::coverUrl(const QString& file) const {
  if (!covers_ || file.isEmpty()) return {};
  const auto path = covers_->pathOf(file.toStdString());
  if (!path) return {};
  return QUrl::fromLocalFile(QString::fromStdString(rancha::utf8Of(*path))).toString();
}

QVariantMap LibraryModel::itemMap(const rancha::Item& item) const {
  QVariantMap m;
  m[QStringLiteral("id")] = QString::fromStdString(item.id);
  m[QStringLiteral("parentId")] = optionalText(item.parentId);
  m[QStringLiteral("kind")] = QString::fromLatin1(rancha::toString(item.kind));
  m[QStringLiteral("isFolder")] = item.kind == rancha::ItemKind::Collection;
  m[QStringLiteral("name")] = QString::fromStdString(item.name);
  m[QStringLiteral("description")] = QString::fromStdString(item.description);
  m[QStringLiteral("target")] = optionalText(item.target);
  m[QStringLiteral("tags")] = toQt(item.tags);
  m[QStringLiteral("hue")] = item.hue;
  m[QStringLiteral("coverFile")] = optionalText(item.coverFile);
  m[QStringLiteral("coverUrl")] = item.coverFile ? coverUrl(QString::fromStdString(*item.coverFile)) : QString();
  m[QStringLiteral("wallpaperFile")] = optionalText(item.wallpaperFile);
  m[QStringLiteral("wallpaperUrl")] = item.wallpaperFile ? coverUrl(QString::fromStdString(*item.wallpaperFile)) : QString();
  m[QStringLiteral("emulator")] = optionalText(item.emulator);
  m[QStringLiteral("core")] = optionalText(item.core);
  m[QStringLiteral("isFavorite")] = item.isFavorite;
  m[QStringLiteral("isDone")] = doneIds_.count(item.id) > 0;
  m[QStringLiteral("protected")] = rancha::isProtectedSection(item.id, item.parentId);
  m[QStringLiteral("missing")] = missingIds_.count(item.id) > 0;
  const auto at = byId_.find(item.id);
  if (at != byId_.end()) m[QStringLiteral("location")] = QString::fromStdString(rancha::locationOf(items_, byId_, at->second));
  return m;
}

QVariantMap LibraryModel::itemAt(int row) const {
  if (row < 0 || row >= static_cast<int>(view_.size())) return {};
  return itemMap(items_[view_[static_cast<std::size_t>(row)]]);
}

QVariantMap LibraryModel::itemById(const QString& id) const {
  const rancha::Item* item = find(id.toStdString());
  return item ? itemMap(*item) : QVariantMap{};
}

int LibraryModel::rowOf(const QString& id) const {
  const std::string wanted = id.toStdString();
  for (std::size_t row = 0; row < view_.size(); ++row)
    if (items_[view_[row]].id == wanted) return static_cast<int>(row);
  return -1;
}

QString LibraryModel::kindLabel(const QString& kind) const {
  switch (rancha::itemKindFromString(kind.toStdString())) {
    case rancha::ItemKind::Collection: return QStringLiteral("Collection");
    case rancha::ItemKind::Launchable: return QStringLiteral("App / Game");
    case rancha::ItemKind::Video: return QStringLiteral("Video");
    case rancha::ItemKind::Readable: return QStringLiteral("Reading");
    case rancha::ItemKind::Audio: return QStringLiteral("Music");
  }
  return {};
}

QString LibraryModel::markLabel(const QString& kind, bool done) const {
  return QString::fromStdString(rancha::markLabel(rancha::itemKindFromString(kind.toStdString()), done));
}

QVariantList LibraryModel::emulatorProfiles() const {
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
      m[QStringLiteral("retroarch")] = profile.retroarch;
      list.append(m);
    }
  } catch (const std::exception& error) {
    qWarning("Could not read the emulators from the settings: %s", error.what());
  }
  return list;
}

QVariantMap LibraryModel::placeholder(int hue, const QString& name) const {
  const auto colors = rancha::coverColors(hue);
  return {{QStringLiteral("top"), ThemeBridge::toQt(colors.top)},
          {QStringLiteral("bottom"), ThemeBridge::toQt(colors.bottom)},
          {QStringLiteral("glow"), ThemeBridge::toQt(colors.glow)},
          {QStringLiteral("initials"), QString::fromStdString(rancha::initials(name.toStdString()))}};
}

QString LibraryModel::localPath(const QUrl& url) const { return url.isLocalFile() ? url.toLocalFile() : url.toString(); }

QString LibraryModel::suggestName(const QString& path, bool folder, bool rom) const {
  const std::string p = path.trimmed().toStdString();
  if (p.empty()) return {};
  if (rom) return QString::fromStdString(rancha::cleanRomName(rancha::stemOf(rancha::baseName(p))));
  return QString::fromStdString(rancha::nameFromPath(p, folder));
}

QStringList LibraryModel::fileFilters(const QString& kind, bool rom) const {
  const std::optional<rancha::ItemKind> k =
      kind.isEmpty() ? std::nullopt : std::optional(rancha::itemKindFromString(kind.toStdString()));
  return toQt(rancha::pickerFilters(k, rom));
}

QStringList LibraryModel::pictureFilters() const {
  return {QStringLiteral("Images (*.png *.jpg *.jpeg *.bmp *.webp *.gif *.PNG *.JPG *.JPEG)"), QStringLiteral("All files (*)")};
}

// ---------------------------------------------------------------- adding and editing

QVariantMap LibraryModel::newItemDefaults(const QString& kind) const {
  QVariantMap m;
  m[QStringLiteral("kind")] = kind;
  m[QStringLiteral("isFolder")] = rancha::itemKindFromString(kind.toStdString()) == rancha::ItemKind::Collection;
  const bool inFolder = viewType_ == rancha::ViewType::Folder && !currentId_.empty() && find(currentId_);
  m[QStringLiteral("parentId")] = inFolder ? QString::fromStdString(currentId_) : QString();
  m[QStringLiteral("parentName")] = inFolder ? nameOrHome(currentId_) : QStringLiteral("Home");
  for (const char* key : {"name", "description", "target", "coverFile", "coverUrl", "wallpaperFile", "wallpaperUrl",
                          "emulator", "core"})
    m[QLatin1String(key)] = QString();
  m[QStringLiteral("tags")] = QStringList();
  m[QStringLiteral("hue")] = static_cast<int>(QRandomGenerator::global()->bounded(360));
  m[QStringLiteral("protected")] = false;
  return m;
}

bool LibraryModel::hasWallpaper(const QString& kind, const QString& parentId) const {
  if (rancha::itemKindFromString(kind.toStdString()) != rancha::ItemKind::Launchable) return false;
  const std::optional<std::string> parent = parentId.isEmpty() ? std::nullopt : std::optional(parentId.toStdString());
  const auto section = rancha::topSectionOf(items_, byId_, parent);
  return !section || !rancha::isAppsSection(items_[*section]);
}

QString LibraryModel::saveItem(const QVariantMap& data) {
  if (!repo_) return notOpen();
  const QString name = data.value(QStringLiteral("name")).toString().trimmed();
  if (name.isEmpty()) return QStringLiteral("Give it a name first.");
  const QString id = data.value(QStringLiteral("id")).toString();
  const bool hueGiven = data.contains(QStringLiteral("hue"));
  const int hue = std::clamp(data.value(QStringLiteral("hue")).toInt(), 0, 359);
  try {
    std::optional<std::string> removedCover, removedWallpaper;
    std::string savedId;
    if (id.isEmpty()) {
      rancha::NewItem input;
      input.parentId = nullableOf(data, QStringLiteral("parentId"));
      input.kind = rancha::itemKindFromString(data.value(QStringLiteral("kind")).toString().toStdString());
      input.name = name.toStdString();
      input.description = nullableOf(data, QStringLiteral("description"));
      input.target = nullableOf(data, QStringLiteral("target"));
      input.tags = tagListFrom(data.value(QStringLiteral("tags")));
      if (hueGiven) input.hue = hue;
      input.coverFile = nullableOf(data, QStringLiteral("coverFile"));
      input.wallpaperFile = nullableOf(data, QStringLiteral("wallpaperFile"));
      input.emulator = nullableOf(data, QStringLiteral("emulator"));
      input.core = nullableOf(data, QStringLiteral("core"));
      savedId = repo_->createItem(input).id;
      setStatus(QStringLiteral("Added “%1”.").arg(name));
    } else {
      rancha::ItemPatch patch;
      patch.name = name.toStdString();
      patch.description = nullableOf(data, QStringLiteral("description"));
      patch.target = nullableOf(data, QStringLiteral("target"));
      patch.tags = tagListFrom(data.value(QStringLiteral("tags")));
      if (hueGiven) patch.hue = hue;
      patch.coverFile = nullableOf(data, QStringLiteral("coverFile"));
      patch.wallpaperFile = nullableOf(data, QStringLiteral("wallpaperFile"));
      patch.emulator = nullableOf(data, QStringLiteral("emulator"));
      patch.core = nullableOf(data, QStringLiteral("core"));
      auto result = repo_->updateItem(id.toStdString(), patch);
      removedCover = result.removedCover;
      removedWallpaper = result.removedWallpaper;
      savedId = result.item.id;
      setStatus(QStringLiteral("Saved “%1”.").arg(name));
    }
    if (covers_) {
      covers_->remove(removedCover);
      covers_->remove(removedWallpaper);
    }
    refresh();
    const int row = rowOf(QString::fromStdString(savedId));
    if (row >= 0) emit revealRow(row);
    return {};
  } catch (const std::exception& error) {
    return QString::fromUtf8(error.what());
  }
}

void LibraryModel::addFolder(const QUrl& folder, const QString& content) {
  const QString path = localPath(folder);
  if (!path.isEmpty()) addFolders({path}, content);
}

void LibraryModel::addFolders(const QStringList& paths, const QString& content) {
  QStringList clean;
  for (const auto& p : paths)
    if (!p.trimmed().isEmpty()) clean << p;
  if (clean.isEmpty()) return;
  std::optional<std::string> parentId;
  if (viewType_ == rancha::ViewType::Folder && !currentId_.empty() && find(currentId_)) parentId = currentId_;
  folderImport_->start(parentId, nameOrHome(parentId), clean, content);
}

void LibraryModel::addFiles(const QList<QUrl>& files) {
  QStringList folders;
  std::vector<rancha::NewItem> toAdd;
  int unsupported = 0;
  std::optional<std::string> parentId;
  if (viewType_ == rancha::ViewType::Folder && !currentId_.empty() && find(currentId_)) parentId = currentId_;
  for (const auto& url : files) {
    const QString path = localPath(url);
    if (path.isEmpty()) continue;
    if (QFileInfo(path).isDir()) {
      folders << path;
      continue;
    }
    const std::string p = path.toStdString();
    const auto kind = rancha::detectKind(p);
    if (!kind) {
      ++unsupported;
      continue;
    }
    rancha::NewItem input;
    input.parentId = parentId;
    input.kind = *kind;
    input.name = rancha::nameFromPath(p);
    input.target = p;
    toAdd.push_back(std::move(input));
  }
  if (!toAdd.empty() || unsupported > 0) {
    if (!repo_) {
      setStatus(notOpen());
    } else {
      int added = 0, duplicates = 0;
      QString problem;
      try {
        auto existing = repo_->existingTargets();
        for (const auto& input : toAdd) {
          const std::string key = rancha::pathKey(*input.target);
          if (!existing.insert(key).second) {
            ++duplicates;
            continue;
          }
          repo_->createItem(input);
          ++added;
        }
      } catch (const std::exception& error) {
        problem = QString::fromUtf8(error.what());
      }
      if (added > 0) refresh();
      QStringList parts;
      if (added > 0) parts << QStringLiteral("Added %1 to %2.").arg(plural(added, "item", "items"), nameOrHome(parentId));
      if (duplicates > 0)
        parts << QStringLiteral("%1 already in the library.").arg(plural(duplicates, "was", "were"));
      if (unsupported > 0) parts << QStringLiteral("%1 not supported.").arg(plural(unsupported, "file type is", "file types are"));
      if (!problem.isEmpty()) parts << problem;
      if (!parts.isEmpty()) setStatus(parts.join(QLatin1Char(' ')));
    }
  }
  if (!folders.isEmpty()) emit foldersToScan(folders);
}

// ---------------------------------------------------------------- selecting

void LibraryModel::selectionUpdated() {
  if (!view_.empty()) emit dataChanged(index(0), index(static_cast<int>(view_.size()) - 1), {SelectedRole});
  emit selectionChanged();
}

void LibraryModel::clickRow(int row, bool ctrl, bool shift) {
  if (row < 0 || row >= static_cast<int>(view_.size())) return;
  const auto next = rancha::clickSelect(selection_, items_[view_[static_cast<std::size_t>(row)]].id, shownIds(), {ctrl, shift});
  if (next == selection_) return;
  selection_ = next;
  selectionUpdated();
}

void LibraryModel::selectAllShown() {
  const auto next = rancha::selectAll(shownIds());
  if (next == selection_) return;
  selection_ = next;
  selectionUpdated();
}

void LibraryModel::clearSelection() {
  if (selection_.ids.empty() && !selection_.anchor) return;
  selection_ = {};
  selectionUpdated();
}

bool LibraryModel::isSelectedRow(int row) const {
  if (row < 0 || row >= static_cast<int>(view_.size())) return false;
  return selection_.ids.count(items_[view_[static_cast<std::size_t>(row)]].id) > 0;
}

QStringList LibraryModel::selectedIds() const { return toQt(rancha::inDisplayOrder(selection_, shownIds())); }

QVariantMap LibraryModel::selectionInfo() const {
  const auto ids = rancha::inDisplayOrder(selection_, shownIds());
  bool everyFavorite = !ids.empty(), everyDone = !ids.empty();
  int songs = 0;
  for (const auto& id : ids) {
    const rancha::Item* item = find(id);
    if (!item) continue;
    everyFavorite = everyFavorite && item->isFavorite;
    everyDone = everyDone && doneIds_.count(id) > 0;
    if (item->kind == rancha::ItemKind::Audio) ++songs;
  }
  return {{QStringLiteral("count"), static_cast<int>(ids.size())},
          {QStringLiteral("everyFavorite"), everyFavorite},
          {QStringLiteral("everyDone"), everyDone},
          {QStringLiteral("songs"), songs},
          {QStringLiteral("deletable"), deletable(toQt(ids))}};
}

void LibraryModel::showInFolder(const QString& id) {
  const rancha::Item* item = find(id.toStdString());
  if (!item) return;
  const std::string wanted = item->id;
  open(QString::fromStdString(item->parentId.value_or(std::string())));
  selection_ = rancha::selectOnly(wanted);
  selectionUpdated();
  const int row = rowOf(QString::fromStdString(wanted));
  if (row >= 0) emit revealRow(row);
}

void LibraryModel::revealInFileManager(const QString& id) {
  const rancha::Item* item = find(id.toStdString());
  if (!item || !item->target) return;
  const std::string path = rancha::splitChapterTarget(*item->target).path;
  const QString target = QString::fromStdString(path);
  const QString folder = QFileInfo(target).isDir() ? target : QString::fromStdString(rancha::dirName(path));
  if (!QFileInfo::exists(folder)) {
    setStatus(QStringLiteral("The folder is missing: %1").arg(folder));
    return;
  }
  QDesktopServices::openUrl(QUrl::fromLocalFile(folder));
}

// ---------------------------------------------------------------- opening (launcher.ts, platformLaunch.ts)

QString LibraryModel::openLabel(const QString& kind) const {
  return QString::fromStdString(rancha::openLabel(rancha::itemKindFromString(kind.toStdString())));
}

QString LibraryModel::launch(const QString& id) {
  const rancha::Item* found = find(id.toStdString());
  if (!found || found->kind == rancha::ItemKind::Collection) return {};
  const rancha::Item item = *found;  // a copy: items_ may change below
  const QString name = QString::fromStdString(item.name);
  if (item.kind == rancha::ItemKind::Launchable && item.emulator) {
    const QString text = QStringLiteral("Console games (emulators) cannot be started from the new app yet.");
    setStatus(text);
    return text;
  }

  rancha::LauncherDeps deps;
  deps.exists = [](const std::string& path) { return QFileInfo::exists(QString::fromStdString(path)); };
  deps.start = [](const rancha::Item& it) -> std::string {
    const std::string path = rancha::splitChapterTarget(*it.target).path;
    rancha::PlatformFs fs;
    fs.isExecutable = [](const std::string& p) {
      const QFileInfo info(QString::fromStdString(p));
      return info.isFile() && info.isExecutable();
    };
    fs.readText = [](const std::string& p) -> std::optional<std::string> {
      QFile file(QString::fromStdString(p));
      if (!file.open(QIODevice::ReadOnly)) return std::nullopt;
      return file.readAll().toStdString();
    };
    const rancha::LaunchPlan plan = rancha::planLaunch(path, rancha::kPlatform, fs);
    switch (plan.type) {
      case rancha::LaunchPlan::Type::Error: return plan.message;
      case rancha::LaunchPlan::Type::Open:
        return QDesktopServices::openUrl(QUrl::fromLocalFile(QString::fromStdString(plan.path)))
                   ? std::string()
                   : std::string("No program is set up to open this kind of file.");
      case rancha::LaunchPlan::Type::External:
        return QDesktopServices::openUrl(QUrl(QString::fromStdString(plan.url))) ? std::string()
                                                                                  : std::string("The link could not be opened.");
      case rancha::LaunchPlan::Type::Spawn: {
        QStringList args;
        for (const auto& a : plan.args) args << QString::fromStdString(a);
        return QProcess::startDetached(QString::fromStdString(plan.command), args, QString::fromStdString(plan.cwd))
                   ? std::string()
                   : std::string("The program could not be started.");
      }
    }
    return {};
  };
  deps.markOpened = [this](const std::string& itemId) -> std::int64_t {
    if (repo_) {
      try {
        return repo_->markOpened(itemId);
      } catch (const std::exception& error) {
        qWarning("Could not remember when the item was opened: %s", error.what());
      }
    }
    return QDateTime::currentMSecsSinceEpoch();
  };

  const rancha::OpenResult result = rancha::openLibraryItem(item, deps);
  switch (result.status) {
    case rancha::OpenResult::Status::Opened: {
      if (missingIds_.erase(item.id)) missingChanged(item.id);
      const auto at = byId_.find(item.id);
      if (at != byId_.end()) items_[at->second].lastOpenedAt = result.openedAt;
      if (viewType_ == rancha::ViewType::Recent || sort_ == rancha::SortMode::Opened) rebuild();
      setStatus(QStringLiteral("%1 “%2”…").arg(item.kind == rancha::ItemKind::Video ? QStringLiteral("Opening")
                                                                                      : QStringLiteral("Launching"),
                                                name));
      break;
    }
    case rancha::OpenResult::Status::Missing: {
      if (missingIds_.insert(item.id).second) missingChanged(item.id);
      const QString where = QString::fromStdString(result.path);
      setStatus(QStringLiteral("Cannot find “%1” at %2. Right-click it and choose “Locate…” to point to its new place.")
                    .arg(name, where));
      return QStringLiteral("Cannot find “%1” at %2. Close this screen, right-click it and choose “Locate…” to point to "
                            "its new place.")
          .arg(name, where);
    }
    case rancha::OpenResult::Status::NoTarget:
      setStatus(QStringLiteral("“%1” has no location yet. Select it and press F2 to choose one.").arg(name));
      return QStringLiteral("“%1” has no location yet. Close this screen, select it and press F2 to choose one.").arg(name);
    case rancha::OpenResult::Status::Failed: {
      const QString text = QStringLiteral("Could not open “%1”: %2").arg(name, QString::fromStdString(result.message));
      setStatus(text);
      return text;
    }
  }
  return {};
}

// ---------------------------------------------------------------- the game screen and missing files

bool LibraryModel::opensGameScreen(const QString& id) const {
  const rancha::Item* item = find(id.toStdString());
  return item && rancha::opensGameScreen(items_, byId_, *item);
}

QString LibraryModel::lastPlayedText(const QString& id) const {
  const rancha::Item* item = find(id.toStdString());
  if (!item) return {};
  const QDateTime now = QDateTime::currentDateTime();
  return QString::fromStdString(rancha::lastPlayedText(item->lastOpenedAt, now.toMSecsSinceEpoch(),
                                                       static_cast<std::int64_t>(now.offsetFromUtc()) * 1000));
}

bool LibraryModel::updateMissing() {
  std::unordered_set<std::string> found;
  if (repo_) {  // the sample library's paths are made up: nothing there is "missing"
    const auto exists = [](const std::string& path) { return QFileInfo::exists(QString::fromStdString(path)); };
    for (auto& id : rancha::findMissing(items_, exists)) found.insert(std::move(id));
  }
  if (found == missingIds_) return false;
  missingIds_ = std::move(found);
  return true;
}

void LibraryModel::checkMissing() {
  if (!updateMissing() || view_.empty()) return;
  emit dataChanged(index(0), index(static_cast<int>(view_.size()) - 1), {MissingRole});
}

void LibraryModel::missingChanged(const std::string& id) {
  const int row = rowOf(QString::fromStdString(id));
  if (row >= 0) emit dataChanged(index(row), index(row), {MissingRole});
}

QString LibraryModel::relocate(const QString& id, const QUrl& url) {
  if (!repo_) return notOpen();
  const rancha::Item* item = find(id.toStdString());
  if (!item) return QStringLiteral("This item is no longer in the library.");
  const QString path = localPath(url);
  if (path.isEmpty()) return {};
  const QString name = QString::fromStdString(item->name);
  rancha::ItemPatch patch;
  patch.target = rancha::Nullable(path.toStdString());
  try {
    repo_->updateItem(item->id, patch);
  } catch (const std::exception& error) {
    const QString text = QString::fromUtf8(error.what());
    setStatus(text);
    return text;
  }
  refresh();  // also checks again which files are missing
  setStatus(QStringLiteral("Updated the location of “%1”.").arg(name));
  return {};
}

// ---------------------------------------------------------------- organizing

QVariantList LibraryModel::moveTargets(const QStringList& ids) const {
  std::unordered_set<std::string> moving;
  std::optional<std::string> commonParent;
  bool first = true, same = true;
  for (const auto& qid : ids) {
    const rancha::Item* item = find(qid.toStdString());
    if (!item) continue;
    moving.insert(item->id);
    const std::string parent = item->parentId.value_or(std::string());
    if (first) commonParent = parent;
    else if (commonParent != parent) same = false;
    first = false;
  }
  const std::string current = same && commonParent ? *commonParent : std::string("\x01");  // no match when mixed
  QVariantList list;
  list.append(QVariantMap{{QStringLiteral("id"), QString()},
                          {QStringLiteral("name"), QStringLiteral("Home")},
                          {QStringLiteral("depth"), 0},
                          {QStringLiteral("current"), current.empty()}});
  const std::function<void(const std::string&, int)> walk = [&](const std::string& parent, int depth) {
    for (std::size_t i : rancha::childrenOf(items_, parent, rancha::SortMode::Name)) {
      const rancha::Item& folder = items_[i];
      if (folder.kind != rancha::ItemKind::Collection || moving.count(folder.id)) continue;  // not into itself
      list.append(QVariantMap{{QStringLiteral("id"), QString::fromStdString(folder.id)},
                              {QStringLiteral("name"), QString::fromStdString(folder.name)},
                              {QStringLiteral("depth"), depth},
                              {QStringLiteral("current"), folder.id == current}});
      walk(folder.id, depth + 1);
    }
  };
  walk({}, 1);
  return list;
}

QString LibraryModel::moveItems(const QStringList& ids, const QString& parentId) {
  if (!repo_) return notOpen();
  const auto list = toStd(deletable(ids));  // the main sections stay where they are
  if (list.empty()) return QStringLiteral("The main sections cannot be moved.");
  const std::optional<std::string> parent = parentId.isEmpty() ? std::nullopt : std::optional(parentId.toStdString());
  try {
    const int moved = repo_->moveMany(list, parent);
    refresh();
    setStatus(moved == 0 ? QStringLiteral("Nothing was moved (already there).")
                         : QStringLiteral("Moved %1 to %2.").arg(plural(moved, "item", "items"), nameOrHome(parent)));
    return {};
  } catch (const std::exception& error) {
    return QString::fromUtf8(error.what());
  }
}

QStringList LibraryModel::deletable(const QStringList& ids) const {
  QStringList out;
  for (const auto& id : ids) {
    const rancha::Item* item = find(id.toStdString());
    if (item && !rancha::isProtectedSection(item->id, item->parentId)) out << id;
  }
  return out;
}

int LibraryModel::countHidden(const QStringList& ids) const {
  std::unordered_set<std::string> chosen;
  for (const auto& id : ids) chosen.insert(id.toStdString());
  int hidden = 0;
  for (std::size_t i = 0; i < items_.size(); ++i) {
    if (chosen.count(items_[i].id)) continue;
    for (std::size_t up : rancha::ancestorsOf(items_, byId_, i)) {
      if (chosen.count(items_[up].id)) {
        ++hidden;
        break;
      }
    }
  }
  return hidden;
}

QString LibraryModel::deleteItems(const QStringList& ids) {
  if (!repo_) return notOpen();
  const auto list = toStd(deletable(ids));
  if (list.empty()) return QStringLiteral("The main sections cannot be deleted.");
  try {
    const auto result = repo_->deleteMany(list);
    if (covers_)
      for (const auto& file : result.covers) covers_->remove(file);
    refresh();
    setStatus(QStringLiteral("Deleted %1.").arg(plural(result.deleted, "item", "items")));
    return {};
  } catch (const std::exception& error) {
    return QString::fromUtf8(error.what());
  }
}

bool LibraryModel::canReorder() const {
  return repo_ && viewType_ == rancha::ViewType::Folder && sort_ == rancha::SortMode::Custom && !flat_;
}

void LibraryModel::reorder(const QString& id, bool later) {
  if (!canReorder()) return;
  try {
    repo_->moveWithinFolder(id.toStdString(), later ? rancha::ReorderDirection::Later : rancha::ReorderDirection::Earlier);
  } catch (const std::exception& error) {
    setStatus(QString::fromUtf8(error.what()));
    return;
  }
  refresh();
  const int row = rowOf(id);
  if (row >= 0) emit revealRow(row);
}

QStringList LibraryModel::dragGroup(const QString& pressedId) const {
  const QStringList selected = selectedIds();
  if (selected.size() > 1 && selected.contains(pressedId)) return selected;
  return {pressedId};
}

void LibraryModel::placeItems(const QStringList& ids, int row, bool after) {
  if (!canReorder() || ids.isEmpty() || !repo_) return;
  std::unordered_set<std::string> group;
  for (const auto& id : ids) group.insert(id.toStdString());
  // The first shown item from the drop spot on that is not travelling: the block goes right before it (none = last).
  std::optional<std::string> before;
  const int count = rowCount(QModelIndex());
  for (int r = std::max(0, after ? row + 1 : row); r < count; ++r) {
    const std::string id = itemAt(r).value(QStringLiteral("id")).toString().toStdString();
    if (!group.count(id)) {
      before = id;
      break;
    }
  }
  try {
    if (repo_->placeMany(toStd(ids), before) == 0) return;  // the order did not change
  } catch (const std::exception& error) {
    setStatus(QString::fromUtf8(error.what()));
    return;
  }
  refresh();
  const int shown = rowOf(ids.first());
  if (shown >= 0) emit revealRow(shown);
}

void LibraryModel::setDone(const QStringList& ids, bool value) {
  if (!repo_) return setStatus(notOpen());
  try {
    repo_->setDoneMany(toStd(ids), value);
  } catch (const std::exception& error) {
    return setStatus(QString::fromUtf8(error.what()));
  }
  refresh();
}

void LibraryModel::setFavorites(const QStringList& ids, bool value) {
  if (!repo_) return setStatus(notOpen());
  try {
    repo_->setFavoriteMany(toStd(ids), value);
  } catch (const std::exception& error) {
    return setStatus(QString::fromUtf8(error.what()));
  }
  refresh();
}

QString LibraryModel::changeTag(const QStringList& ids, const QString& tag, bool add) {
  if (!repo_) return notOpen();
  const std::string text = tag.trimmed().toStdString();
  if (text.empty()) return QStringLiteral("Type a tag first.");
  try {
    const auto list = toStd(ids);
    const int changed = add ? repo_->addTagMany(list, text) : repo_->removeTagMany(list, text);
    refresh();
    setStatus(add ? QStringLiteral("Tag “%1” added to %2.").arg(tag.trimmed(), plural(changed, "item", "items"))
                  : QStringLiteral("Tag “%1” removed from %2.").arg(tag.trimmed(), plural(changed, "item", "items")));
    return {};
  } catch (const std::exception& error) {
    return QString::fromUtf8(error.what());
  }
}

QVariantList LibraryModel::tagsOf(const QStringList& ids) const {
  struct Entry {
    std::string tag;
    int count = 0;
  };
  std::map<std::string, Entry> byLower;
  int total = 0;
  for (const auto& id : ids) {
    const rancha::Item* item = find(id.toStdString());
    if (!item) continue;
    ++total;
    std::unordered_set<std::string> once;
    for (const auto& tag : item->tags) {
      const std::string lower = rancha::lowerAscii(tag);
      if (!once.insert(lower).second) continue;
      auto& entry = byLower[lower];
      if (entry.tag.empty()) entry.tag = tag;
      ++entry.count;
    }
  }
  std::vector<Entry> entries;
  for (auto& [lower, entry] : byLower) entries.push_back(entry);
  std::stable_sort(entries.begin(), entries.end(), [](const Entry& a, const Entry& b) { return a.count > b.count; });
  QVariantList list;
  for (const auto& entry : entries)
    list.append(QVariantMap{{QStringLiteral("tag"), QString::fromStdString(entry.tag)},
                            {QStringLiteral("count"), entry.count},
                            {QStringLiteral("all"), entry.count == total}});
  return list;
}

// ---------------------------------------------------------------- pictures

QVariantMap LibraryModel::openPicture(const QUrl& url) {
  const QString path = localPath(url);
  if (path.isEmpty()) return failure(QStringLiteral("No picture was chosen."));
  QString error;
  const QImage image = readPicture(path, &error);
  if (image.isNull()) return failure(error);
  return {{QStringLiteral("ok"), true},
          {QStringLiteral("url"), QUrl::fromLocalFile(path).toString()},
          {QStringLiteral("width"), image.width()},
          {QStringLiteral("height"), image.height()}};
}

bool LibraryModel::clipboardHasPicture() const {
  const QMimeData* mime = QGuiApplication::clipboard()->mimeData();
  if (!mime) return false;
  if (mime->hasImage()) return true;
  for (const auto& url : mime->urls())
    if (url.isLocalFile() && rancha::isPageImage(url.toLocalFile().toStdString())) return true;
  return false;
}

QVariantMap LibraryModel::pastePicture() {
  const QMimeData* mime = QGuiApplication::clipboard()->mimeData();
  if (!mime) return failure(QStringLiteral("There is no picture on the clipboard."));
  if (!mime->hasImage()) {  // a copied picture file
    for (const auto& url : mime->urls())
      if (url.isLocalFile() && rancha::isPageImage(url.toLocalFile().toStdString())) return openPicture(url);
    return failure(QStringLiteral("There is no picture on the clipboard."));
  }
  const QImage image = qvariant_cast<QImage>(mime->imageData());
  if (image.isNull()) return failure(QStringLiteral("The picture on the clipboard could not be read."));
  const QString path =
      QDir::temp().filePath(QStringLiteral("rancha-paste-%1.png").arg(QUuid::createUuid().toString(QUuid::WithoutBraces)));
  if (!image.save(path, "PNG")) return failure(QStringLiteral("The pasted picture could not be stored."));
  tempPictures_ << path;
  return openPicture(QUrl::fromLocalFile(path));
}

QVariantMap LibraryModel::cropStep(const QString& shape, double imageWidth, double imageHeight, const QVariantMap& view,
                                   const QString& op, double a, double b) const {
  namespace crop = rancha::crop;
  const crop::Size frame = frameOf(shape);
  const crop::Size image{std::max(1.0, imageWidth), std::max(1.0, imageHeight)};
  crop::View v = viewOf(view);
  if (op == QLatin1String("fill")) v = crop::fillView(image, frame);
  else if (op == QLatin1String("fit")) v = crop::fitView(image, frame);
  else if (op == QLatin1String("zoom")) v = crop::zoomTo(v, crop::fillScale(image, frame) * a, image, frame);
  else if (op == QLatin1String("wheel")) v = crop::zoomTo(v, v.scale * a, image, frame);
  else if (op == QLatin1String("pan")) v = crop::panBy(v, a, b, image, frame);
  else v = crop::clampView(v, image, frame);
  return {{QStringLiteral("scale"), v.scale},
          {QStringLiteral("offsetX"), v.offsetX},
          {QStringLiteral("offsetY"), v.offsetY},
          {QStringLiteral("zoom"), crop::zoomFactor(v, image, frame)},
          {QStringLiteral("minZoom"), crop::fitScale(image, frame) / crop::fillScale(image, frame)},
          {QStringLiteral("maxZoom"), crop::kMaxZoom},
          {QStringLiteral("frameWidth"), frame.width},
          {QStringLiteral("frameHeight"), frame.height}};
}

QVariantMap LibraryModel::saveCrop(const QUrl& source, const QString& shape, const QVariantMap& view) {
  namespace crop = rancha::crop;
  if (!covers_) return failure(notOpen());
  QString error;
  const QImage image = readPicture(localPath(source), &error);
  if (image.isNull()) return failure(error);
  const crop::Size frame = frameOf(shape);
  const crop::Size size{static_cast<double>(image.width()), static_cast<double>(image.height())};
  const double outputWidth = shape == QLatin1String("wallpaper") ? crop::kWallpaperOutputWidth : crop::kCoverOutputWidth;
  const crop::View v = crop::clampView(viewOf(view), size, frame);
  const crop::Rect r = crop::outputRect(v, size, frame, outputWidth);

  QImage canvas(r.canvasWidth, r.canvasHeight, QImage::Format_RGB32);
  canvas.fill(Qt::black);  // bars around a picture that does not fill the frame
  {
    QPainter painter(&canvas);
    painter.setRenderHint(QPainter::SmoothPixmapTransform);
    painter.drawImage(QRectF(r.x, r.y, r.width, r.height), image);
  }
  QByteArray bytes;
  QBuffer buffer(&bytes);
  buffer.open(QIODevice::WriteOnly);
  if (!canvas.save(&buffer, "JPG", 90)) return failure(QStringLiteral("The picture could not be saved as JPEG."));
  try {
    const std::string file = covers_->add(std::string_view(bytes.constData(), static_cast<std::size_t>(bytes.size())));
    const QString name = QString::fromStdString(file);
    return {{QStringLiteral("ok"), true}, {QStringLiteral("file"), name}, {QStringLiteral("url"), coverUrl(name)}};
  } catch (const std::exception& e) {
    return failure(QString::fromUtf8(e.what()));
  }
}
