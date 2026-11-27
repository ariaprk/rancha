import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts
import Rancha

// Asked before a folder is scanned: what kind of things does it hold? The answer decides what the scan looks for
// (a games folder is full of helper programs that should not be listed; a video folder has none of that).
// Then the system's folder picker opens. Port of the Electron app's ContentTypeDialog.tsx.
Popup {
  id: root
  modal: true
  focus: true
  closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
  anchors.centerIn: Overlay.overlay
  width: 460
  padding: 20

  property string chosen: "all"
  property var pendingPaths: []  // folders dropped or picked elsewhere: no folder picker, they are scanned at once

  // Asks what the folder holds, then opens the folder picker.
  function ask() { pendingPaths = []; open() }
  // Asks what these folders hold (LibraryModel.foldersToScan), then scans them one after another.
  function askFor(paths) { pendingPaths = paths; open() }

  background: Rectangle {
    radius: ThemeBridge.radius
    color: ThemeBridge.surface
    border.color: ThemeBridge.border
  }
  Overlay.modal: Rectangle { color: Qt.rgba(0, 0, 0, 0.45) }

  FolderDialog {
    id: picker
    title: "Choose the folder to add"
    onAccepted: LibraryModel.addFolder(selectedFolder, root.chosen)
  }

  contentItem: ColumnLayout {
    spacing: 8
    Text {
      text: "What are you adding?"
      color: ThemeBridge.text
      font.family: ThemeBridge.fontBold
      font.weight: Font.Bold
      font.pixelSize: 18
    }
    Text {
      text: "This decides what the app looks for in the folder you choose next."
      color: ThemeBridge.textDim
      font.pixelSize: 12
      wrapMode: Text.WordWrap
      Layout.fillWidth: true
    }
    Repeater {
      model: LibraryModel.folderImport.contentChoices
      delegate: Rectangle {
        required property var modelData
        required property int index
        Layout.fillWidth: true
        implicitHeight: choiceColumn.implicitHeight + 18
        radius: ThemeBridge.radiusSmall
        color: choiceArea.containsMouse || activeFocus ? ThemeBridge.surface2 : "transparent"
        border.color: activeFocus ? ThemeBridge.accentColor : ThemeBridge.border
        activeFocusOnTab: true
        focus: index === 0
        Keys.onReturnPressed: pick()
        Keys.onEnterPressed: pick()
        Keys.onSpacePressed: pick()
        function pick() {
          root.chosen = modelData.value
          root.close()
          if (root.pendingPaths.length > 0) LibraryModel.addFolders(root.pendingPaths, root.chosen)
          else picker.open()
          root.pendingPaths = []
        }
        Column {
          id: choiceColumn
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          anchors.leftMargin: 14
          anchors.rightMargin: 14
          spacing: 2
          Text { text: modelData.label; color: ThemeBridge.text; font.family: ThemeBridge.fontBold; font.weight: Font.DemiBold; font.pixelSize: 14 }
          Text { text: modelData.hint; color: ThemeBridge.textDim; font.pixelSize: 12; width: parent.width; wrapMode: Text.WordWrap }
        }
        MouseArea { id: choiceArea; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: parent.pick() }
      }
    }
    RowLayout {
      Layout.topMargin: 6
      Item { Layout.fillWidth: true }
      Button { text: "Cancel"; onClicked: root.close() }
    }
  }
}
