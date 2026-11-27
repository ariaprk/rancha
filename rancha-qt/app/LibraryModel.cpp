#include "LibraryModel.h"

#include <QDateTime>
#include <QVariantMap>

#include "ThemeBridge.h"
#include "rancha/cover.h"
#include "rancha/data_paths.h"
#include "rancha/sample_library.h"

LibraryModel::LibraryModel(QObject* parent) : QAbstractListModel(parent) { loadLibrary(); }

int LibraryModel::rowCount(const QModelIndex& parent) const { return parent.isValid() ? 0 : static_cast<int>(view_.size()); }

QHash<int, QByteArray> LibraryModel::roleNames() const {
  return {{IdRole, "itemId"},         {NameRole, "name"},          {KindRole, "kind"},
          {IsFolderRole, "isFolder"}, {HueRole, "hue"},            {FavoriteRole, "isFavorite"},
          {DoneRole, "isDone"},       {InitialsRole, "initials"},  {TopColorRole, "topColor"},
          {BottomColorRole, "bottomColor"}, {GlowColorRole, "glowColor"}, {TagsRole, "tags"},
          {CountRole, "childCount"}, {SubtitleRole, "subtitle"}};
}

QVariant LibraryModel::data(const QModelIndex& index, int role) const {
  if (!index.isValid() || index.row() < 0 || index.row() >= static_cast<int>(view_.size())) return {};
  const rancha::Item& item = items_[view_[static_cast<std::size_t>(index.row())]];
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
    case SubtitleRole: {
      if (item.kind == rancha::ItemKind::Collection) {
        const auto it = counts_.find(item.id);
        const int n = it == counts_.end() ? 0 : it->second;
        return n == 1 ? QStringLiteral("1 item") : QStringLiteral("%1 items").arg(n);
      }
      switch (item.kind) {
        case rancha::ItemKind::Launchable: return QStringLiteral("App / Game");
        case rancha::ItemKind::Video: return QStringLiteral("Video");
        case rancha::ItemKind::Readable: return QStringLiteral("Reading");
        case rancha::ItemKind::Audio: return QStringLiteral("Music");
        default: return QString();
      }
    }
    default: return {};
  }
}

QVariantList LibraryModel::breadcrumb() const {
  QVariantList list;
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

void LibraryModel::setSortMode(const QString& value) {
  const auto mode = rancha::sortModeFromString(value.toStdString());
  if (mode == sort_) return;
  sort_ = mode;
  rebuild();
  emit sortModeChanged();
}

void LibraryModel::open(const QString& id) {
  currentId_ = id.toStdString();
  rebuild();
  emit locationChanged();
}

void LibraryModel::openRow(int row) {
  if (row < 0 || row >= static_cast<int>(view_.size())) return;
  const rancha::Item& item = items_[view_[static_cast<std::size_t>(row)]];
  if (item.kind == rancha::ItemKind::Collection) open(QString::fromStdString(item.id));
}

void LibraryModel::back() {
  if (currentId_.empty()) return;
  std::string parent;
  for (const auto& item : items_) {
    if (item.id == currentId_) {
      if (item.parentId) parent = *item.parentId;
      break;
    }
  }
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

void LibraryModel::closeLibrary() {
  repo_.reset();
  db_.reset();
}

void LibraryModel::showItems(std::vector<rancha::Item> items) {
  items_ = std::move(items);
  currentId_.clear();
  reindex();
  rebuild();
  emit dataReset();
  emit locationChanged();
}

void LibraryModel::rebuild() {
  beginResetModel();
  view_ = rancha::childrenOf(items_, currentId_, sort_);
  endResetModel();
}

void LibraryModel::reindex() {
  counts_.clear();
  for (const auto& item : items_) {
    if (item.parentId) ++counts_[*item.parentId];
  }
}
