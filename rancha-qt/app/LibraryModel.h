#pragma once
#include <QAbstractListModel>
#include <QString>
#include <QStringList>
#include <QUrl>
#include <QVariantList>
#include <QVariantMap>
#include <QtQml/qqmlregistration.h>
#include <memory>

#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "FolderImport.h"
#include "rancha/cover_store.h"
#include "rancha/database.h"
#include "rancha/item.h"
#include "rancha/item_repository.h"
#include "rancha/library_query.h"
#include "rancha/library_view.h"
#include "rancha/nav_history.h"
#include "rancha/selection.h"

// The items on screen, as a list for QML (grid or list views draw only what is visible).
// Q3: the data is the real library (library.db in the data folder, shared with the Electron app).
// When it cannot be opened, the invented sample library is shown and `libraryError` says why.
// Q5: what is shown is decided by rancha::buildView: one folder, or a flat list for a search, a tag filter,
// "All items", "Favorites" and "Recent".
// Q4 / R2: adding, editing, covers, move, delete, multi-select and the bulk changes (LibraryActions.cpp).
class LibraryModel : public QAbstractListModel {
  Q_OBJECT
  QML_ELEMENT
  QML_SINGLETON
  Q_PROPERTY(QString currentId READ currentId NOTIFY locationChanged)  // "" = top level
  Q_PROPERTY(QString viewType READ viewType NOTIFY locationChanged)   // folder | all | favorites | recent
  Q_PROPERTY(QVariantList breadcrumb READ breadcrumb NOTIFY locationChanged)  // [{id, name}] from the top down
  Q_PROPERTY(QVariantList sections READ sections NOTIFY dataReset)            // the top-level folders [{id, name, hue}]
  Q_PROPERTY(QString sortMode READ sortMode WRITE setSortMode NOTIFY sortModeChanged)
  Q_PROPERTY(int totalCount READ totalCount NOTIFY dataReset)  // all items in the library
  Q_PROPERTY(bool canGoBack READ canGoBack NOTIFY locationChanged)        // the history has a place behind
  Q_PROPERTY(bool canGoForward READ canGoForward NOTIFY locationChanged)  // a Back can be undone
  Q_PROPERTY(bool usingLibrary READ usingLibrary NOTIFY dataReset)     // false = sample or stress data
  Q_PROPERTY(QString libraryError READ libraryError NOTIFY dataReset)  // why the library could not be opened
  Q_PROPERTY(QString query READ query WRITE setQuery NOTIFY queryChanged)              // the search box
  Q_PROPERTY(bool searchHere READ searchHere WRITE setSearchHere NOTIFY queryChanged)  // only inside the open folder
  Q_PROPERTY(QStringList selectedTags READ selectedTags NOTIFY queryChanged)
  Q_PROPERTY(QVariantList allTags READ allTags NOTIFY dataReset)  // [{tag, count}], most used first
  Q_PROPERTY(QString title READ title NOTIFY viewChanged)         // "Favorites", "Search results for “x”"...
  Q_PROPERTY(bool flat READ flat NOTIFY viewChanged)              // a list of matches from many folders
  Q_PROPERTY(FolderImport* folderImport READ folderImport CONSTANT)  // the "Add a folder" dialog
  Q_PROPERTY(QString status READ status NOTIFY statusChanged)     // a short message after a change ("Added 3 items.")
  Q_PROPERTY(bool canAdd READ canAdd NOTIFY locationChanged)      // adding works while a folder (or Home) is open
  Q_PROPERTY(QString folderName READ folderName NOTIFY locationChanged)  // "Home" or the open folder's name
  Q_PROPERTY(int selectedCount READ selectedCount NOTIFY selectionChanged)
  Q_PROPERTY(QStringList selectedIds READ selectedIds NOTIFY selectionChanged)  // in the order shown

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
    CountRole,     // items directly inside (folders)
    SubtitleRole,  // the small text under the name (where the item lives, in a flat list)
    LocationRole,  // "Video › Anime" ("Home" at the top level)
    CoverUrlRole,  // file URL of the cover picture, "" for the placeholder
    TargetRole,
    ParentIdRole,
    ProtectedRole,  // one of the five main sections
    SelectedRole,
    MissingRole  // its file or folder was not found
  };
  explicit LibraryModel(QObject* parent = nullptr);
  ~LibraryModel() override;

  int rowCount(const QModelIndex& parent = {}) const override;
  QVariant data(const QModelIndex& index, int role) const override;
  QHash<int, QByteArray> roleNames() const override;

  QString currentId() const { return QString::fromStdString(currentId_); }
  QString viewType() const;
  QVariantList breadcrumb() const;
  QVariantList sections() const;
  QString sortMode() const { return QString::fromLatin1(rancha::toString(sort_)); }
  void setSortMode(const QString& value);
  int totalCount() const { return static_cast<int>(items_.size()); }
  bool canGoBack() const { return !history_.back.empty(); }
  bool canGoForward() const { return !history_.forward.empty(); }
  bool usingLibrary() const { return repo_ != nullptr; }
  QString libraryError() const { return libraryError_; }
  QString query() const { return query_; }
  void setQuery(const QString& value);
  bool searchHere() const { return searchHere_; }
  void setSearchHere(bool value);
  QStringList selectedTags() const;
  QVariantList allTags() const { return allTags_; }
  QString title() const { return title_; }
  bool flat() const { return flat_; }
  FolderImport* folderImport() const { return folderImport_; }
  QString status() const { return status_; }
  bool canAdd() const { return viewType_ == rancha::ViewType::Folder; }
  QString folderName() const;
  int selectedCount() const { return static_cast<int>(selectedIds().size()); }
  QStringList selectedIds() const;

  Q_INVOKABLE void open(const QString& id);       // enter a folder ("" = top level)
  Q_INVOKABLE void openRow(int row);              // enter the folder in this row, or start the item (launch)
  Q_INVOKABLE void back();                        // the place before (like a browser; deleted folders are skipped)
  Q_INVOKABLE void forward();                     // undo a Back
  Q_INVOKABLE void up();                          // the folder above the open one
  Q_INVOKABLE void showAll();                     // "All items"
  Q_INVOKABLE void showFavorites();
  Q_INVOKABLE void showRecent();
  Q_INVOKABLE void toggleTag(const QString& tag);  // add or remove a tag from the filter (any case)
  Q_INVOKABLE void clearTags();
  Q_INVOKABLE void toggleFavorite(int row);       // saved in the library (only in memory for sample data)
  Q_INVOKABLE void loadLibrary();                 // the real library; falls back to the sample on error
  Q_INVOKABLE void loadSample();
  Q_INVOKABLE void loadStress(int count);         // a big invented library for speed tests
  // "Add a folder": scans `folder` for `content` (games | roms | videos | comics | music | all) and opens the preview.
  // Things are added into the open folder (Home on the All items / Favorites / Recent pages).
  Q_INVOKABLE void addFolder(const QUrl& folder, const QString& content);
  Q_INVOKABLE void addFolders(const QStringList& paths, const QString& content);  // a queue: one preview after another
  // "Add several files at once" and files dropped on the window: the kind comes from the extension, folders go to
  // the folder scan (foldersToScan).
  Q_INVOKABLE void addFiles(const QList<QUrl>& files);
  Q_INVOKABLE void clearStatus();
  Q_INVOKABLE void showStatus(const QString& text);

  // ---- selecting (Ctrl+click, Shift+click, Ctrl+A)
  Q_INVOKABLE void clickRow(int row, bool ctrl, bool shift);
  Q_INVOKABLE void selectAllShown();
  Q_INVOKABLE void clearSelection();
  Q_INVOKABLE bool isSelectedRow(int row) const;
  Q_INVOKABLE int rowOf(const QString& id) const;  // -1 when it is not shown
  // {count, everyFavorite, everyDone, songs, deletable: [ids that are not main sections]}
  Q_INVOKABLE QVariantMap selectionInfo() const;

  // ---- one item
  Q_INVOKABLE QVariantMap itemAt(int row) const;
  Q_INVOKABLE QVariantMap itemById(const QString& id) const;
  Q_INVOKABLE QVariantMap newItemDefaults(const QString& kind) const;
  // Games (apps and games outside the Applications section) can have a wallpaper for the game screen.
  Q_INVOKABLE bool hasWallpaper(const QString& kind, const QString& parentId) const;
  // Creates (no "id") or updates an item from the editor's fields. Returns "" or the error text.
  Q_INVOKABLE QString saveItem(const QVariantMap& data);
  Q_INVOKABLE QString kindLabel(const QString& kind) const;            // "App / Game"...
  Q_INVOKABLE QString markLabel(const QString& kind, bool done) const;  // "Mark as watched"...
  Q_INVOKABLE QVariantList emulatorProfiles() const;                    // [{id, name, retroarch}] from settings.json
  Q_INVOKABLE QVariantMap placeholder(int hue, const QString& name) const;  // {top, bottom, glow, initials}
  Q_INVOKABLE QString localPath(const QUrl& url) const;
  Q_INVOKABLE QString suggestName(const QString& path, bool folder, bool rom) const;
  // Filters of the system file picker: "Video files (*.mp4 *.mkv …)", …, "All files (*)".
  // kind "" = every supported kind (adding several files); rom = console games.
  Q_INVOKABLE QStringList fileFilters(const QString& kind, bool rom) const;
  Q_INVOKABLE QStringList pictureFilters() const;  // the cover / wallpaper picker
  Q_INVOKABLE void showInFolder(const QString& id);         // a flat list: open the item's folder and select it
  Q_INVOKABLE void revealInFileManager(const QString& id);  // the folder that holds the file
  Q_INVOKABLE QString openLabel(const QString& kind) const; // Open, Launch, Play, Read (the context menu)
  // Starts an item that is not a collection (core openLibraryItem + planLaunch). The outcome is in `status`; the
  // result is "" when it started, otherwise the text the game screen shows. Not yet: the built-in reader (R6),
  // the music player and emulators (R9).
  Q_INVOKABLE QString launch(const QString& id);
  // ---- the game screen and missing files
  Q_INVOKABLE bool opensGameScreen(const QString& id) const;    // a game (not an app in the Applications section)
  Q_INVOKABLE QString lastPlayedText(const QString& id) const;  // "Not played yet", "Played 3 days ago"...
  Q_INVOKABLE void checkMissing();                              // looks again which files are gone (window focus)
  // "Locate file…" / "Locate folder…": points the item at its new place. Returns "" or the error text.
  Q_INVOKABLE QString relocate(const QString& id, const QUrl& url);

  // ---- organizing (one or many ids)
  Q_INVOKABLE QVariantList moveTargets(const QStringList& ids) const;  // [{id ("" = Home), name, depth, current}]
  Q_INVOKABLE QString moveItems(const QStringList& ids, const QString& parentId);
  Q_INVOKABLE QStringList deletable(const QStringList& ids) const;  // without the main sections
  Q_INVOKABLE int countHidden(const QStringList& ids) const;        // items below them that are not chosen themselves
  Q_INVOKABLE QString deleteItems(const QStringList& ids);
  Q_INVOKABLE bool canReorder() const;  // custom order, inside a folder
  Q_INVOKABLE void reorder(const QString& id, bool later);
  // Drag-to-reorder: the ids that travel (the selection when the pressed item is part of it, in display order),
  // and dropping them before or after the item shown in `row` (the Electron bulk action "place").
  Q_INVOKABLE QStringList dragGroup(const QString& pressedId) const;
  Q_INVOKABLE void placeItems(const QStringList& ids, int row, bool after);
  Q_INVOKABLE void setDone(const QStringList& ids, bool value);
  Q_INVOKABLE void setFavorites(const QStringList& ids, bool value);
  Q_INVOKABLE QString changeTag(const QStringList& ids, const QString& tag, bool add);
  Q_INVOKABLE QVariantList tagsOf(const QStringList& ids) const;

  // ---- pictures (covers and wallpapers): {ok, url, width, height} or {ok: false, error}
  Q_INVOKABLE QVariantMap openPicture(const QUrl& url);
  Q_INVOKABLE QVariantMap pastePicture();
  Q_INVOKABLE bool clipboardHasPicture() const;
  // The cropper's arithmetic (core crop_math): op = fill | fit | zoom (a = zoom factor) | wheel (a = factor) |
  // pan (a, b = drag). Returns {scale, offsetX, offsetY, zoom, minZoom, maxZoom, frameWidth, frameHeight}.
  Q_INVOKABLE QVariantMap cropStep(const QString& shape, double imageWidth, double imageHeight, const QVariantMap& view,
                                   const QString& op, double a = 0, double b = 0) const;
  // Crops, shrinks and stores the picture in the covers folder: {ok, file, url} or {ok: false, error}.
  Q_INVOKABLE QVariantMap saveCrop(const QUrl& source, const QString& shape, const QVariantMap& view);
  Q_INVOKABLE QString coverUrl(const QString& file) const;

 signals:
  void locationChanged();
  void sortModeChanged();
  void dataReset();
  void queryChanged();
  void viewChanged();
  void statusChanged();
  void selectionChanged();
  void foldersToScan(const QStringList& paths);  // dropped or picked folders: ask what they hold first
  void revealRow(int row);                       // scroll this row into view
  void gameScreenRequested(const QString& id);   // a game was opened: show its game screen

 private:
  // A place in the history: a page, and for the Folder page the open folder ("" = Home).
  struct Place {
    rancha::ViewType type = rancha::ViewType::Folder;
    std::string folderId;
    bool operator==(const Place&) const = default;
  };
  Place here() const { return {viewType_, currentId_}; }
  bool exists(const Place& place) const;  // a deleted folder cannot be returned to
  // A new place: the search and the tag filter start empty. `record` = remember the place left (not for Back / Forward).
  void go(rancha::ViewType type, std::string folderId, bool record = true);
  rancha::NavHistory<Place> history_;
  void rebuild();
  void reindex();  // ids, counts of the items inside every folder, the tag list, done ids
  void closeLibrary();
  void refresh();  // reads the library again and keeps the place, the search and the history
  void setStatus(const QString& text);
  void showItems(std::vector<rancha::Item> items);
  void selectionUpdated();
  bool updateMissing();                        // recomputes missingIds_ (real library only); true when it changed
  void missingChanged(const std::string& id);  // repaints the row of this item
  std::vector<std::string> shownIds() const;
  const rancha::Item* find(const std::string& id) const;
  QVariantMap itemMap(const rancha::Item& item) const;
  QString nameOrHome(const std::optional<std::string>& id) const;
  QString notOpen() const;  // the error text when there is no real library

  std::vector<rancha::Item> items_;
  rancha::ItemIndex byId_;
  std::vector<std::size_t> view_;  // indexes into items_ for what is on screen, already sorted
  std::unordered_map<std::string, int> counts_;
  std::unordered_set<std::string> doneIds_;
  QVariantList allTags_;
  rancha::ViewType viewType_ = rancha::ViewType::Folder;
  std::string currentId_;
  QString query_;
  bool searchHere_ = false;  // like the Electron app: a new place searches everywhere
  std::vector<std::string> tags_;
  QString title_;
  bool flat_ = false;
  rancha::SortMode sort_ = rancha::SortMode::Custom;
  rancha::Selection selection_;
  std::unique_ptr<rancha::db::Database> db_;  // open while the real library is shown
  std::unique_ptr<rancha::ItemRepository> repo_;
  std::unique_ptr<rancha::CoverStore> covers_;
  QString libraryError_;
  FolderImport* folderImport_ = nullptr;
  QString status_;
  QStringList tempPictures_;  // pasted pictures, deleted when the app closes
  std::unordered_set<std::string> missingIds_;  // items whose file was not found when they were opened
};
