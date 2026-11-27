import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Rancha

// "Delete …?": the safe button (Cancel) has the keyboard focus, so pressing Enter by accident deletes nothing.
// Only library entries are removed, never the files. Port of the Electron app's ConfirmDialog.tsx (delete and
// bulk delete in App.tsx).
Popup {
  id: root
  modal: true
  focus: true
  closePolicy: busy ? Popup.NoAutoClose : Popup.CloseOnEscape
  anchors.centerIn: Overlay.overlay
  width: 460
  padding: 20

  property var ids: []
  property int hidden: 0      // items inside the chosen collections that are not chosen themselves
  property string heading: ""
  property bool busy: false
  property string error: ""

  function start(itemIds) {
    ids = LibraryModel.deletable(itemIds)  // the main sections are kept
    if (ids.length === 0) return
    hidden = LibraryModel.countHidden(ids)
    heading = ids.length === 1 ? "Delete “" + LibraryModel.itemById(ids[0]).name + "”?"
                               : "Delete " + ids.length + " items?"
    error = ""
    busy = false
    open()
    cancelButton.forceActiveFocus()
  }

  background: Rectangle { radius: ThemeBridge.radius; color: ThemeBridge.surface; border.color: ThemeBridge.border }
  Overlay.modal: Rectangle { color: Qt.rgba(0, 0, 0, 0.45) }

  contentItem: ColumnLayout {
    spacing: 10
    Text {
      text: root.heading
      color: ThemeBridge.text
      font.family: ThemeBridge.fontBold
      font.weight: Font.Bold
      font.pixelSize: 18
      elide: Text.ElideRight
      Layout.fillWidth: true
    }
    Text {
      visible: root.hidden > 0
      text: "This also deletes the " + root.hidden + (root.hidden === 1 ? " item" : " items")
            + (root.ids.length === 1 ? " inside it." : " inside the selected collections.")
      color: ThemeBridge.text
      font.pixelSize: 13
      wrapMode: Text.WordWrap
      Layout.fillWidth: true
    }
    Text {
      text: "This only removes entries from your library. Your actual files, games and videos are never touched."
      color: ThemeBridge.textDim
      font.pixelSize: 13
      wrapMode: Text.WordWrap
      Layout.fillWidth: true
    }
    Text { visible: root.error !== ""; text: root.error; color: "#ff6b6b"; font.pixelSize: 13; wrapMode: Text.WordWrap; Layout.fillWidth: true }
    RowLayout {
      Layout.fillWidth: true
      Item { Layout.fillWidth: true }
      Button { id: cancelButton; text: "Cancel"; enabled: !root.busy; onClicked: root.close() }
      Button {
        text: root.busy ? "Working…" : "Delete"
        enabled: !root.busy
        palette.button: "#c0392b"
        palette.buttonText: "white"
        onClicked: {
          root.busy = true
          const problem = LibraryModel.deleteItems(root.ids)
          root.busy = false
          if (problem !== "") { root.error = problem; return }
          LibraryModel.clearSelection()
          root.close()
        }
      }
    }
  }
}
