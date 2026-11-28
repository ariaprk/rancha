#include "LibraryModel.h"

#include <QDateTime>
#include <QVariantMap>

#include <algorithm>
#include <functional>

#include "ThemeBridge.h"
#include "rancha/cover.h"
#include "rancha/data_paths.h"
#include "rancha/launch.h"
#include "rancha/sample_library.h"

LibraryModel::LibraryModel(QObject* parent) : QAbstractListModel(parent) {
  FolderImport::Hooks hooks;
  hooks.existingKeys = [this] { return repo_ ? repo_->existingTargets() : std::unordered_set<std::string>{}; };
  hooks.importTree = [this](const std::optional<std::string>& parentId, const std::vector<rancha::ImportNode>& nodes) {
    if (!repo_) throw std::runtime_error("The library is not open, so nothing can be added (this is the sample library).");
    const auto result = repo_->importTree(parentId, nodes);
    refresh();
    return result;
  };
  folderImport_ = new FolderImport(std::move(hooks), this);
  connect(folderImport_, &FolderImport::imported, this, &LibraryModel::setStatus);
  loadLibrary();
}

int LibraryModel::rowCount(const QModelIndex& parent) const { return parent.isValid() ? 0 : static_cast<int>(view_.size()); }

QHash<int, QByteArray> LibraryModel::roleNames() const {
  return {{IdRole, "itemId"},         {NameRole, "name"},          {KindRole, "kind"},
          {IsFolderRole, "isFolder"}, {HueRole, "hue"},            {FavoriteRole, "isFavorite"},
          {DoneRole, "isDone"},       {InitialsRole, "initials"},  {TopColorRole, "topColor"},
          {BottomColorRole, "bottomColor"}, {GlowColorRole, "glowColor"}, {TagsRole, "tags"},
          {CountRole, "childCount"}, {SubtitleRole, "subtitle"}, {LocationRole, "location"},
          {CoverUrlRole, "coverUrl"}, {TargetRole, "target"},  {ParentIdRole, "parentId"},
          {ProtectedRole, "isProtected"}, {SelectedRole, "isSelected"}, {MissingRole, "isMissing"}};
}

QVariant LibraryModel::data(const QModelIndex& index, int role) const {
  if (!index.isValid() || index.row() < 0 || index.row() >= static_cast<int>(view_.size())) return {};
  const std::size_t at = view_[static_cast<std::size_t>(index.row())];
  const rancha::Item& item = items_[at];
  switch (role) {
    case IdRole: return QString::fromStdString(item.id);
    case NameRole: case Qt::DisplayRole: return QString::fromStdString(item.name);
    case KindRole: return QString::fromLatin1(rancha::toString(item.kind));
    case IsFolderRole: return item.kind == rancha::ItemKind::Collection;
    case HueRole: return item.hue;
    case FavoriteRole: return item.isFavorite;
    case DoneRole: return item.isDone;
    case InitialsRole: return QString::fromStdString(rancha::initials(item.name));
    case TopColorRole: return ThemeBridge::toQt(rancha::coverColors(item.hue).top);
    case BottomColorRole: return ThemeBridge::toQt(rancha::coverColors(item.hue).bottom);
    case GlowColorRole: return ThemeBridge::toQt(rancha::coverColors(item.hue).glow);
    case TagsRole: {
      QStringList tags;
      for (const auto& t : item.tags) tags << QString::fromStdString(t);
      return tags;
    }
    case CountRole: {
      const auto it = counts_.find(item.id);
      return it == counts_.end() ? 0 : it->second;
    }
    case LocationRole: return QString::fromStdString(rancha::locationOf(items_, byId_, at));
    case CoverUrlRole: return item.coverFile ? coverUrl(QString::fromStdString(*item.coverFile)) : QString();
    case TargetRole: return item.target ? QString::fromStdString(*item.target) : QString();
    case ParentIdRole: return item.parentId ? QString::fromStdString(*item.parentId) : QString();
    case ProtectedRole: return rancha::isProtectedSection(item.id, item.parentId);
    case SelectedRole: return selection_.ids.count(item.id) > 0;
    case MissingRole: return missingIds_.count(item.id) > 0;
    case SubtitleRole: {
      // In a flat list (search, filters, All / Favorites / Recent) the line says where the item lives.
      if (flat_) return QString::fromStdString(rancha::locationOf(items_, byId_, at));
      if (item.kind == rancha::ItemKind::Collection) {
        const auto it = counts_.find(item.id);
        const int n = it == counts_.end() ? 0 : it->second;
        return n == 1 ? QStringLiteral("1 item") : QStringLiteral("%1 items").arg(n);
      }
      return QString();  // the Electron cards show NO kind label (owner's choice); only folders say "N items"
    }
    default: return {};
  }
}

QString LibraryModel::viewType() const {
  switch (viewType_) {
    case rancha::ViewType::All: return QStringLiteral("all");
    case rancha::ViewType::Favorites: return QStringLiteral("favorites");
    case rancha::ViewType::Recent: return QStringLiteral("recent");
    case rancha::ViewType::Folder: break;
  }
  return QStringLiteral("folder");
}

QVariantList LibraryModel::breadcrumb() const {
  QVariantList list;
  if (viewType_ != rancha::ViewType::Folder) return list;
  for (std::size_t i : rancha::pathTo(items_, currentId_)) {
    QVariantMap m;
    m[QStringLiteral("id")] = QString::fromStdString(items_[i].id);
    m[QStringLiteral("name")] = QString::fromStdString(items_[i].name);
    list.append(m);
  }
  return list;
}

QVariantList LibraryModel::sections() const {
  QVariantList list;
  for (std::size_t i : rancha::childrenOf(items_, "", rancha::SortMode::Custom)) {
    QVariantMap m;
    m[QStringLiteral("id")] = QString::fromStdString(items_[i].id);
    m[QStringLiteral("name")] = QString::fromStdString(items_[i].name);
    m[QStringLiteral("hue")] = items_[i].hue;
    list.append(m);
  }
  return list;
}

QStringList LibraryModel::selectedTags() const {
  QStringList list;
  for (const auto& tag : tags_) list << QString::fromStdString(tag);
  return list;
}

void LibraryModel::setSortMode(const QString& value) {
  const auto mode = rancha::sortModeFromString(value.toStdString());
  if (mode == sort_) return;
  sort_ = mode;
  rebuild();
  emit sortModeChanged();
}

void LibraryModel::setQuery(const QString& value) {
  if (value == query_) return;
  query_ = value;
  rebuild();
  emit queryChanged();
}

void LibraryModel::setSearchHere(bool value) {
  if (value == searchHere_) return;
  searchHere_ = value;
  rebuild();
  emit queryChanged();
}

void LibraryModel::toggleTag(const QString& tag) {
  const std::string wanted = tag.toStdString();
  const std::string lower = rancha::lowerAscii(wanted);
  const auto found = std::find_if(tags_.begin(), tags_.end(),
                                  [&](const std::string& t) { return rancha::lowerAscii(t) == lower; });
  if (found != tags_.end()) tags_.erase(found);
  else tags_.push_back(wanted);
  rebuild();
  emit queryChanged();
}

void LibraryModel::clearTags() {
  if (tags_.empty()) return;
  tags_.clear();
  rebuild();
  emit queryChanged();
}

bool LibraryModel::exists(const Place& place) const {
  return place.type != rancha::ViewType::Folder || place.folderId.empty() || byId_.count(place.folderId) > 0;
}

void LibraryModel::go(rancha::ViewType type, std::string folderId, bool record) {
  if (record) history_ = rancha::visit(history_, here(), Place{type, folderId}, std::equal_to<Place>{});
  viewType_ = type;
  currentId_ = std::move(folderId);
  // Like the Electron app's navigate(): a new place starts with an empty search and no tag filter.
  query_.clear();
  tags_.clear();
  searchHere_ = false;
  rebuild();
  emit locationChanged();
  emit queryChanged();
}

void LibraryModel::open(const QString& id) { go(rancha::ViewType::Folder, id.toStdString()); }
void LibraryModel::showAll() { go(rancha::ViewType::All, {}); }
void LibraryModel::showFavorites() { go(rancha::ViewType::Favorites, {}); }
void LibraryModel::showRecent() { go(rancha::ViewType::Recent, {}); }

void LibraryModel::openRow(int row) {
  if (row < 0 || row >= static_cast<int>(view_.size())) return;
  const rancha::Item& item = items_[view_[static_cast<std::size_t>(row)]];
  if (item.kind == rancha::ItemKind::Collection) open(QString::fromStdString(item.id));
  else if (rancha::opensGameScreen(items_, byId_, item)) emit gameScreenRequested(QString::fromStdString(item.id));
  else launch(QString::fromStdString(item.id));
}

void LibraryModel::back() {
  const auto step = rancha::stepBack(history_, here(), [this](const Place& place) { return exists(place); });
  if (!step) return;
  history_ = step->history;
  go(step->target.type, step->target.folderId, false);
}

void LibraryModel::forward() {
  const auto step = rancha::stepForward(history_, here(), [this](const Place& place) { return exists(place); });
  if (!step) return;
  history_ = step->history;
  go(step->target.type, step->target.folderId, false);
}

void LibraryModel::up() {
  if (viewType_ != rancha::ViewType::Folder) {
    open(QString());
    return;
  }
  if (currentId_.empty()) return;
  std::string parent;
  const auto found = byId_.find(currentId_);
  if (found != byId_.end() && items_[found->second].parentId) parent = *items_[found->second].parentId;
  open(QString::fromStdString(parent));
}

void LibraryModel::toggleFavorite(int row) {
  if (row < 0 || row >= static_cast<int>(view_.size())) return;
  rancha::Item& item = items_[view_[static_cast<std::size_t>(row)]];
  if (repo_) {
    try {
      repo_->setFavorite(item.id, !item.isFavorite);
    } catch (const std::exception& error) {
      qWarning("Could not change the favorite: %s", error.what());
      return;
    }
  }
  item.isFavorite = !item.isFavorite;
  if (viewType_ == rancha::ViewType::Favorites) {
    rebuild();  // an item taken out of the favorites leaves the Favorites page
    return;
  }
  const QModelIndex idx = index(row);
  emit dataChanged(idx, idx, {FavoriteRole});
}

void LibraryModel::loadLibrary() {
  closeLibrary();
  try {
    const auto paths = rancha::dataPaths();
    db_ = std::make_unique<rancha::db::Database>(paths.library());
    repo_ = std::make_unique<rancha::ItemRepository>(*db_);
    libraryError_.clear();
    showItems(repo_->listItems());
  } catch (const std::exception& error) {
    closeLibrary();
    libraryError_ = QString::fromUtf8(error.what());
    qWarning("Could not open the library, showing the sample instead: %s", error.what());
    showItems(rancha::sampleItems(QDateTime::currentMSecsSinceEpoch()));
  }
}

void LibraryModel::loadSample() {
  closeLibrary();
  showItems(rancha::sampleItems(QDateTime::currentMSecsSinceEpoch()));
}

void LibraryModel::loadStress(int count) {
  if (count < 1) count = 1;
  closeLibrary();
  showItems(rancha::stressItems(static_cast<std::size_t>(count), QDateTime::currentMSecsSinceEpoch()));
}

void LibraryModel::setStatus(const QString& text) {
  status_ = text;
  emit statusChanged();
}

void LibraryModel::clearStatus() { setStatus(QString()); }

void LibraryModel::refresh() {
  if (!repo_) return;
  try {
    items_ = repo_->listItems();
  } catch (const std::exception& error) {
    qWarning("Could not read the library again: %s", error.what());
    return;
  }
  reindex();
  emit dataReset();
  rebuild();
  emit locationChanged();  // counts and names on the path may have changed
}

void LibraryModel::closeLibrary() {
  repo_.reset();
  db_.reset();
}

void LibraryModel::showItems(std::vector<rancha::Item> items) {
  items_ = std::move(items);
  reindex();
  history_ = {};  // another library: the old places mean nothing here
  emit dataReset();
  go(rancha::ViewType::Folder, {}, false);
}

void LibraryModel::rebuild() {
  rancha::ViewRequest request;
  request.type = viewType_;
  if (!currentId_.empty()) request.folderId = currentId_;
  request.query = query_.toStdString();
  request.filters.tags = tags_;
  request.sort = sort_;
  request.searchHere = searchHere_;
  auto result = rancha::buildView(items_, byId_, request);

  beginResetModel();
  view_ = std::move(result.items);
  const QString title = QString::fromStdString(result.title);
  const bool changed = title != title_ || result.flat != flat_;
  title_ = title;
  flat_ = result.flat;
  endResetModel();
  if (changed) emit viewChanged();
}

void LibraryModel::reindex() {
  byId_ = rancha::indexById(items_);
  counts_.clear();
  for (const auto& item : items_) {
    if (item.parentId) ++counts_[*item.parentId];
  }
  allTags_.clear();
  for (const auto& entry : rancha::collectTags(items_)) {
    QVariantMap m;
    m[QStringLiteral("tag")] = QString::fromStdString(entry.tag);
    m[QStringLiteral("count")] = entry.count;
    allTags_.append(m);
  }
  updateMissing();  // a changed library: which files are gone now
}
