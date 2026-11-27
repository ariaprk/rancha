#pragma once
#include <QAbstractListModel>
#include <QString>
#include <QStringList>
#include <QThreadPool>
#include <QVariantList>
#include <QtQml/qqmlregistration.h>

#include <deque>
#include <functional>
#include <optional>
#include <string>
#include <unordered_set>
#include <vector>

#include "rancha/folder_scan.h"
#include "rancha/item_repository.h"
#include "rancha/scan_tree.h"

// "Add a folder": scans a folder in the background, shows what was found as a tree with tick boxes, and adds only
// what is ticked. Nothing is added until "Add" is pressed. Port of the Electron app's FolderImportDialog.tsx; the
// logic itself is in the core (rancha/folder_scan.h, rancha/scan_tree.h).
// Several folders (dropped at once) wait in a queue and are shown one after the other.
// The rows are the visible lines of the tree (folders that are open show what is inside them).
class FolderImport : public QAbstractListModel {
  Q_OBJECT
  QML_ELEMENT
  QML_UNCREATABLE("Use LibraryModel.folderImport")
  // what is being added, and where to
  Q_PROPERTY(bool active READ active NOTIFY changed)
  Q_PROPERTY(QString folderPath READ folderPath NOTIFY changed)
  Q_PROPERTY(int remaining READ remaining NOTIFY changed)  // folders waiting after this one
  Q_PROPERTY(QString parentName READ parentName NOTIFY changed)
  // the choices
  Q_PROPERTY(QString content READ content WRITE setContent NOTIFY changed)  // games | roms | videos | comics | music | all
  Q_PROPERTY(bool subfolders READ subfolders WRITE setSubfolders NOTIFY changed)
  Q_PROPERTY(bool allPrograms READ allPrograms WRITE setAllPrograms NOTIFY changed)
  Q_PROPERTY(bool gameFolders READ gameFolders WRITE setGameFolders NOTIFY changed)
  Q_PROPERTY(QString layout READ layout WRITE setLayout NOTIFY changed)  // tree | flat
  Q_PROPERTY(bool wrap READ wrap WRITE setWrap NOTIFY changed)
  Q_PROPERTY(QString wrapName READ wrapName WRITE setWrapName NOTIFY changed)
  Q_PROPERTY(QString emulator READ emulator WRITE setEmulator NOTIFY changed)  // ROMs: the emulator profile id
  Q_PROPERTY(QVariantList emulators READ emulators NOTIFY changed)           // [{id, name}] from the settings
  Q_PROPERTY(QString search READ search WRITE setSearch NOTIFY changed)
  Q_PROPERTY(QVariantList contentChoices READ contentChoices CONSTANT)  // [{value, label, hint}]
  // the state
  Q_PROPERTY(bool scanning READ scanning NOTIFY changed)
  Q_PROPERTY(bool hasScan READ hasScan NOTIFY changed)
  Q_PROPERTY(bool busy READ busy NOTIFY changed)  // adding
  Q_PROPERTY(QString error READ error NOTIFY changed)
  Q_PROPERTY(bool nothingFound READ nothingFound NOTIFY changed)
  Q_PROPERTY(QString emptyText READ emptyText NOTIFY changed)
  Q_PROPERTY(QString notes READ notes NOTIFY changed)  // cut off / folders that could not be opened / ignored files
  Q_PROPERTY(int total READ total NOTIFY changed)
  Q_PROPERTY(int selectedCount READ selectedCount NOTIFY changed)
  Q_PROPERTY(int shownCount READ shownCount NOTIFY changed)
  Q_PROPERTY(bool searching READ searching NOTIFY changed)
  Q_PROPERTY(bool canAdd READ canAdd NOTIFY changed)
  Q_PROPERTY(QString addLabel READ addLabel NOTIFY changed)

 public:
  enum Roles {
    NameRole = Qt::UserRole + 1,
    DetailRole,  // "3 items" for a folder, otherwise the kind ("Video")
    DepthRole,
    IsFolderRole,
    ExpandedRole,
    CheckRole,  // "all" | "some" | "none"
    DuplicateRole,
    SuggestedRole,
    TipRole  // the full path
  };

  // What the dialog needs from the library.
  struct Hooks {
    std::function<std::unordered_set<std::string>()> existingKeys;  // pathKey of every location already in the library
    std::function<rancha::TreeImportResult(const std::optional<std::string>&, const std::vector<rancha::ImportNode>&)>
        importTree;  // adds, then shows the new items
  };

  explicit FolderImport(Hooks hooks, QObject* parent = nullptr);
  ~FolderImport() override;

  int rowCount(const QModelIndex& parent = {}) const override;
  QVariant data(const QModelIndex& index, int role) const override;
  QHash<int, QByteArray> roleNames() const override;

  /// Opens the dialog for these folders (UTF-8 paths are made from the QStrings), adding into `parentId`.
  void start(std::optional<std::string> parentId, const QString& parentName, const QStringList& paths, const QString& content);

  bool active() const { return active_; }
  QString folderPath() const { return queue_.empty() ? QString() : queue_.front(); }
  int remaining() const { return queue_.empty() ? 0 : static_cast<int>(queue_.size()) - 1; }
  QString parentName() const { return parentName_; }
  QString content() const { return QString::fromLatin1(rancha::toString(content_)); }
  void setContent(const QString& value);
  bool subfolders() const { return subfolders_; }
  void setSubfolders(bool value);
  bool allPrograms() const { return allPrograms_; }
  void setAllPrograms(bool value);
  bool gameFolders() const { return gameFolders_; }
  void setGameFolders(bool value);
  QString layout() const;
  void setLayout(const QString& value);
  bool wrap() const { return wrap_; }
  void setWrap(bool value);
  QString wrapName() const { return wrapName_; }
  void setWrapName(const QString& value);
  QString emulator() const { return emulator_; }
  void setEmulator(const QString& value);
  QVariantList emulators() const { return emulators_; }
  QString search() const { return search_; }
  void setSearch(const QString& value);
  QVariantList contentChoices() const;
  bool scanning() const { return scanning_; }
  bool hasScan() const { return scan_.has_value(); }
  bool busy() const { return busy_; }
  QString error() const { return error_; }
  bool nothingFound() const { return scan_ && scan_->nodes.empty(); }
  QString emptyText() const;
  QString notes() const;
  int total() const { return total_; }
  int selectedCount() const { return static_cast<int>(checked_.size()); }
  int shownCount() const { return shownCount_; }
  bool searching() const { return !words_.empty(); }
  bool canAdd() const;
  QString addLabel() const;

  Q_INVOKABLE void toggleRow(int row);       // the tick box ("some" becomes all ticked)
  Q_INVOKABLE void toggleExpanded(int row);  // open or close a folder of the list
  Q_INVOKABLE void selectShown(bool on);     // everything, or while searching only what is shown
  Q_INVOKABLE void expandAll();
  Q_INVOKABLE void collapseAll();
  Q_INVOKABLE void add();
  Q_INVOKABLE void cancel();  // skips this folder (the next one in the queue opens)

 signals:
  void changed();
  void imported(const QString& message);  // "Added 3 items in 1 collection."

 private:
  struct Row {
    const rancha::ScanNode* node;  // inside shown_
    int depth;
    int inside;  // things inside a folder
  };
  void openFirst();  // the first folder of the queue, with the choices it starts with
  void rescan();
  void finishScan(int generation, std::optional<rancha::FolderScan> result, const QString& problem);
  void rebuildRows();
  void collectRows(const std::vector<rancha::ScanNode>& nodes, int depth, bool openAll, std::vector<Row>& out) const;
  void recount();
  void afterTicks();
  void doAdd();
  void next();
  void close();

  Hooks hooks_;
  QThreadPool pool_;
  int generation_ = 0;  // a scan that finishes after a newer one started is thrown away

  bool active_ = false;
  std::deque<QString> queue_;
  std::optional<std::string> parentId_;
  QString parentName_;
  rancha::ScanContent startContent_ = rancha::ScanContent::All;

  rancha::ScanContent content_ = rancha::ScanContent::All;
  bool subfolders_ = true;
  bool allPrograms_ = false;
  bool gameFolders_ = false;
  rancha::scan::Layout layout_ = rancha::scan::Layout::Tree;
  bool wrap_ = false;
  QString wrapName_;
  QString emulator_;
  QVariantList emulators_;
  QString search_;
  std::vector<std::string> words_;

  bool scanning_ = false;
  bool busy_ = false;
  QString error_;
  std::optional<rancha::FolderScan> scan_;
  std::vector<rancha::ScanNode> shown_;  // the scan, filtered by the search
  std::vector<Row> rows_;
  rancha::scan::Checked checked_;
  std::unordered_set<std::string> expanded_;
  int total_ = 0;
  int shownCount_ = 0;
  int importCount_ = 0;
};
