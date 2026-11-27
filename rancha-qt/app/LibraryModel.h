#pragma once
#include <QAbstractListModel>
#include <QString>
#include <QVariantList>
#include <QtQml/qqmlregistration.h>
#include <memory>

#include <string>
#include <unordered_map>
#include <vector>

#include "rancha/database.h"
#include "rancha/item.h"
#include "rancha/item_repository.h"
#include "rancha/library_view.h"

// The items of the folder that is open, as a list for QML (grid or list views draw only what is visible).
// Q3: the data is the real library (library.db in the data folder, shared with the Electron app).
// When it cannot be opened, the invented sample library is shown and `libraryError` says why.
class LibraryModel : public QAbstractListModel {
  Q_OBJECT
  QML_ELEMENT
  QML_SINGLETON
  Q_PROPERTY(QString currentId READ currentId NOTIFY locationChanged)  // "" = top level
  Q_PROPERTY(QVariantList breadcrumb READ breadcrumb NOTIFY locationChanged)  // [{id, name}] from the top down
  Q_PROPERTY(QVariantList sections READ sections NOTIFY dataReset)            // the top-level folders [{id, name, hue}]
  Q_PROPERTY(QString sortMode READ sortMode WRITE setSortMode NOTIFY sortModeChanged)
  Q_PROPERTY(int totalCount READ totalCount NOTIFY dataReset)  // all items in the library
  Q_PROPERTY(bool canGoBack READ canGoBack NOTIFY locationChanged)
  Q_PROPERTY(bool usingLibrary READ usingLibrary NOTIFY dataReset)     // false = sample or stress data
  Q_PROPERTY(QString libraryError READ libraryError NOTIFY dataReset)  // why the library could not be opened

 public:
  enum Roles {
    IdRole = Qt::UserRole + 1,
    NameRole,
    KindRole,
    IsFolderRole,
    HueRole,
    FavoriteRole,
    DoneRole,
    InitialsRole,
    TopColorRole,
    BottomColorRole,
    GlowColorRole,
    TagsRole,
    CountRole,    // items directly inside (folders)
    SubtitleRole  // the small text under the name
  };
  explicit LibraryModel(QObject* parent = nullptr);

  int rowCount(const QModelIndex& parent = {}) const override;
  QVariant data(const QModelIndex& index, int role) const override;
  QHash<int, QByteArray> roleNames() const override;

  QString currentId() const { return QString::fromStdString(currentId_); }
  QVariantList breadcrumb() const;
  QVariantList sections() const;
  QString sortMode() const { return QString::fromLatin1(rancha::toString(sort_)); }
  void setSortMode(const QString& value);
  int totalCount() const { return static_cast<int>(items_.size()); }
  bool canGoBack() const { return !currentId_.empty(); }
  bool usingLibrary() const { return repo_ != nullptr; }
  QString libraryError() const { return libraryError_; }

  Q_INVOKABLE void open(const QString& id);       // enter a folder ("" = top level)
  Q_INVOKABLE void openRow(int row);              // enter the folder in this row (does nothing for other kinds)
  Q_INVOKABLE void back();                        // up one level
  Q_INVOKABLE void toggleFavorite(int row);       // saved in the library (only in memory for sample data)
  Q_INVOKABLE void loadLibrary();                 // the real library; falls back to the sample on error
  Q_INVOKABLE void loadSample();
  Q_INVOKABLE void loadStress(int count);         // a big invented library for speed tests

 signals:
  void locationChanged();
  void sortModeChanged();
  void dataReset();

 private:
  void rebuild();
  void reindex();  // counts the items inside every folder
  void closeLibrary();
  void showItems(std::vector<rancha::Item> items);
  std::vector<rancha::Item> items_;
  std::vector<std::size_t> view_;  // indexes into items_ for the open folder, already sorted
  std::unordered_map<std::string, int> counts_;
  std::string currentId_;
  rancha::SortMode sort_ = rancha::SortMode::Custom;
  std::unique_ptr<rancha::db::Database> db_;  // open while the real library is shown
  std::unique_ptr<rancha::ItemRepository> repo_;
  QString libraryError_;
};
