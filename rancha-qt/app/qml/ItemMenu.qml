import QtQuick
import QtQuick.Controls
import Rancha

// The right-click menu of an item, or of the whole selection when the item is part of a multi-selection.
// Port of the Electron app's menuEntriesFor / bulkMenuEntries (App.tsx). The dialogs are opened by Main.qml.
// Drawn with RMenu / RMenuItem (the look of the Electron ContextMenu).
RMenu {
  id: root
  signal editRequested(string id)
  signal moveRequested(var ids)
  signal deleteRequested(var ids)
  signal tagRequested(var ids, string mode)
  signal launchRequested(string id)
  signal locateRequested(string id, bool folder)  // a missing item: choose its new place

  property var entries: []  // [{label, hint, run, separator, danger}]

  // Right-clicking something that is part of a multi-selection acts on all of them.
  function popupFor(row) {
    const item = LibraryModel.itemAt(row)
    if (!item.id) return
    if (LibraryModel.isSelectedRow(row) && LibraryModel.selectedCount > 1) entries = bulkEntries()
    else {
      if (!LibraryModel.isSelectedRow(row) || LibraryModel.selectedCount !== 1) LibraryModel.clickRow(row, false, false)
      entries = itemEntries(item)
    }
    popup()
  }

  readonly property var separator: ({ separator: true, label: "" })

  function itemEntries(item) {
    const list = []
    if (item.isFolder) list.push({ label: "Open", run: () => LibraryModel.open(item.id) })
    else {
      list.push({ label: LibraryModel.openLabel(item.kind), run: () => root.launchRequested(item.id) })
      if (item.target !== "" && !item.missing) list.push({ label: "Show in file manager", run: () => LibraryModel.revealInFileManager(item.id) })
      if (item.missing) {
        list.push({ label: "Locate file…", run: () => root.locateRequested(item.id, false) })
        if (item.kind === "readable") list.push({ label: "Locate folder…", run: () => root.locateRequested(item.id, true) })
      }
    }
    if (LibraryModel.flat) list.push({ label: "Show in its folder", run: () => LibraryModel.showInFolder(item.id) })
    list.push({ label: "Edit…", run: () => root.editRequested(item.id) })
    list.push({
      label: item.isFavorite ? "Remove from favorites" : "Add to favorites",
      run: () => LibraryModel.setFavorites([item.id], !item.isFavorite)
    })
    if (!item.protected) list.push({ label: "Move to…", run: () => root.moveRequested([item.id]) })
    list.push({ label: LibraryModel.markLabel(item.kind, item.isDone), run: () => LibraryModel.setDone([item.id], !item.isDone) })
    if (LibraryModel.canReorder()) {
      list.push(separator)
      list.push({ label: "Move earlier", run: () => LibraryModel.reorder(item.id, false) })
      list.push({ label: "Move later", run: () => LibraryModel.reorder(item.id, true) })
    }
    if (!item.protected) {
      list.push(separator)
      list.push({ label: "Delete…", danger: true, run: () => root.deleteRequested([item.id]) })
    }
    return list
  }

  function bulkEntries() {
    const ids = LibraryModel.selectedIds
    const info = LibraryModel.selectionInfo()
    const list = [
      { label: info.everyFavorite ? "Remove from favorites" : "Add to favorites", run: () => LibraryModel.setFavorites(ids, !info.everyFavorite) },
      { label: info.everyDone ? "Mark as not done" : "Mark as done", run: () => LibraryModel.setDone(ids, !info.everyDone) },
      { label: "Add a tag…", run: () => root.tagRequested(ids, "add") },
      { label: "Remove a tag…", run: () => root.tagRequested(ids, "remove") },
      { label: "Move to…", run: () => root.moveRequested(ids) },
      separator
    ]
    if (info.deletable.length > 0) list.push({ label: "Delete…", danger: true, run: () => root.deleteRequested(info.deletable) })
    list.push(separator)
    list.push({ label: "Clear selection", run: () => LibraryModel.clearSelection() })
    return list
  }

  Instantiator {
    model: root.entries
    delegate: RMenuItem {
      required property var modelData
      separator: modelData.separator === true
      text: modelData.label
      danger: modelData.danger === true
      hint: modelData.hint || ""
      onTriggered: if (modelData.run) modelData.run()
    }
    onObjectAdded: (index, object) => root.insertItem(index, object)
    onObjectRemoved: (index, object) => root.removeItem(object)
  }
}
