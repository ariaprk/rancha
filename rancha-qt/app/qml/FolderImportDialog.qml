import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Rancha

// "Add a folder": everything found in the folder, with tick boxes. Only what is ticked is added, and nothing is
// added until "Add" is pressed. Port of the Electron app's FolderImportDialog.tsx; the state lives in
// LibraryModel.folderImport (C++), this file only draws it.
Popup {
  id: root
  readonly property var fi: LibraryModel.folderImport
  modal: true
  focus: true
  closePolicy: fi.busy ? Popup.NoAutoClose : Popup.CloseOnEscape
  // Opened and closed from the C++ state (a "visible" binding would be broken by Esc).
  Connections {
    target: root.fi
    function onChanged() {
      if (root.fi.active && !root.visible) root.open()
      else if (!root.fi.active && root.visible) root.close()
    }
  }
  onClosed: {
    if (!fi.active) return
    fi.cancel()  // Esc: skip this folder
    if (fi.active) open()  // the next folder of the queue
  }
  anchors.centerIn: Overlay.overlay
  width: Math.min(680, Overlay.overlay ? Overlay.overlay.width - 40 : 680)
  height: Math.min(720, Overlay.overlay ? Overlay.overlay.height - 40 : 720)
  padding: 20

  background: Rectangle {
    radius: ThemeBridge.radius
    color: ThemeBridge.surface
    border.color: ThemeBridge.border
  }
  Overlay.modal: Rectangle { color: Qt.rgba(0, 0, 0, 0.45) }

  component Dim: Text { color: ThemeBridge.textDim; font.pixelSize: 12; wrapMode: Text.WordWrap; Layout.fillWidth: true }
  component LinkButton: Text {
    signal clicked
    color: linkArea.containsMouse ? ThemeBridge.text : ThemeBridge.accentColor
    font.pixelSize: 12
    MouseArea { id: linkArea; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: parent.clicked() }
  }
  component Choice: CheckBox {
    font.pixelSize: 13
    contentItem: Text {
      leftPadding: parent.indicator.width + parent.spacing
      text: parent.text
      color: ThemeBridge.text
      font: parent.font
      wrapMode: Text.WordWrap
      verticalAlignment: Text.AlignVCenter
    }
  }
  component Pick: RadioButton {
    font.pixelSize: 13
    contentItem: Text {
      leftPadding: parent.indicator.width + parent.spacing
      text: parent.text
      color: ThemeBridge.text
      font: parent.font
      verticalAlignment: Text.AlignVCenter
    }
  }

  contentItem: ColumnLayout {
    spacing: 8

    Text {
      text: "Add a folder"
      color: ThemeBridge.text
      font.family: ThemeBridge.fontBold
      font.weight: Font.Bold
      font.pixelSize: 18
    }
    Dim {
      text: root.fi.folderPath + (root.fi.remaining > 0
            ? "  —  " + root.fi.remaining + (root.fi.remaining === 1 ? " more folder" : " more folders") + " waiting after this one" : "")
      elide: Text.ElideMiddle
      wrapMode: Text.NoWrap
    }
    Text {
      visible: root.fi.error !== ""
      text: root.fi.error
      color: "#ff6b6b"
      font.pixelSize: 13
      wrapMode: Text.WordWrap
      Layout.fillWidth: true
    }
    Dim { visible: root.fi.scanning; text: "Looking through the folder…"; font.pixelSize: 13 }

    // the choices (shown once a scan is there, as in the Electron app)
    GridLayout {
      visible: root.fi.hasScan
      Layout.fillWidth: true
      columns: 2
      columnSpacing: 10
      rowSpacing: 2

      Text { text: "What is in this folder?"; color: ThemeBridge.text; font.pixelSize: 13 }
      ComboBox {
        Layout.fillWidth: true
        model: root.fi.contentChoices
        textRole: "label"
        valueRole: "value"
        currentIndex: indexOfValue(root.fi.content)
        onActivated: root.fi.content = currentValue
      }

      Text { visible: root.fi.content === "roms"; text: "Run these games with"; color: ThemeBridge.text; font.pixelSize: 13 }
      ComboBox {
        visible: root.fi.content === "roms"
        Layout.fillWidth: true
        model: [{ id: "", name: root.fi.emulators.length === 0 ? "(add an emulator in Settings first)" : "Choose an emulator…" }]
               .concat(root.fi.emulators)
        textRole: "name"
        valueRole: "id"
        currentIndex: Math.max(0, indexOfValue(root.fi.emulator))
        onActivated: root.fi.emulator = currentValue
      }
    }
    ColumnLayout {
      visible: root.fi.hasScan
      Layout.fillWidth: true
      spacing: 0
      Choice {
        visible: root.fi.content === "games"
        Layout.fillWidth: true
        text: "Show every program inside each game folder (not just the best guess)"
        checked: root.fi.allPrograms
        onToggled: root.fi.allPrograms = checked
      }
      Choice {
        visible: root.fi.content === "roms"
        Layout.fillWidth: true
        text: "Every sub-folder is one game (games kept as folders)"
        checked: root.fi.gameFolders
        onToggled: root.fi.gameFolders = checked
      }
      Choice {
        visible: !(root.fi.content === "roms" && root.fi.gameFolders)
        Layout.fillWidth: true
        text: "Look inside sub-folders"
        checked: root.fi.subfolders
        onToggled: root.fi.subfolders = checked
      }
      RowLayout {
        spacing: 12
        Pick { text: "Keep the folder structure"; checked: root.fi.layout === "tree"; onClicked: root.fi.layout = "tree" }
        Pick { text: "One plain list"; checked: root.fi.layout === "flat"; onClicked: root.fi.layout = "flat" }
      }
      RowLayout {
        Layout.fillWidth: true
        spacing: 6
        Choice { text: "Put it all in a new collection named"; checked: root.fi.wrap; onToggled: root.fi.wrap = checked }
        TextField {
          Layout.fillWidth: true
          enabled: root.fi.wrap
          maximumLength: 200
          text: root.fi.wrapName
          onTextEdited: root.fi.wrapName = text
          color: ThemeBridge.text
          font.pixelSize: 13
        }
      }
    }

    Dim { visible: root.fi.nothingFound; text: root.fi.emptyText; font.pixelSize: 13 }

    // the list
    ColumnLayout {
      visible: root.fi.hasScan && !root.fi.nothingFound
      Layout.fillWidth: true
      Layout.fillHeight: true
      spacing: 6

      RowLayout {
        Layout.fillWidth: true
        spacing: 12
        Dim {
          text: "Selected " + root.fi.selectedCount + " of " + root.fi.total + ". Adding into “" + root.fi.parentName + "”."
                + (root.fi.searching ? " Showing " + root.fi.shownCount + " matches." : "")
        }
        LinkButton { text: root.fi.searching ? "Select shown" : "Select all"; onClicked: root.fi.selectShown(true) }
        LinkButton { text: root.fi.searching ? "Unselect shown" : "Select none"; onClicked: root.fi.selectShown(false) }
        LinkButton { text: "Expand all"; onClicked: root.fi.expandAll() }
        LinkButton { text: "Collapse all"; onClicked: root.fi.collapseAll() }
      }
      TextField {
        id: listSearch
        Layout.fillWidth: true
        placeholderText: "Search this list…"
        placeholderTextColor: ThemeBridge.textDim
        color: ThemeBridge.text
        font.pixelSize: 13
        text: root.fi.search
        onTextEdited: root.fi.search = text
        // clear the search first; a second Esc closes the dialog
        Keys.onEscapePressed: (event) => {
          if (text !== "") { root.fi.search = ""; event.accepted = true }
          else event.accepted = false
        }
      }
      Dim { visible: root.fi.searching && rows.count === 0; text: "Nothing in this list matches “" + root.fi.search + "”."; font.pixelSize: 13 }

      ListView {
        id: rows
        Layout.fillWidth: true
        Layout.fillHeight: true
        Layout.minimumHeight: 120
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        model: root.fi
        ScrollBar.vertical: ScrollBar {}
        delegate: Rectangle {
          required property int index
          required property string name
          required property string detail
          required property int depth
          required property bool isFolder
          required property bool expanded
          required property string check
          required property bool duplicate
          required property bool suggested
          required property string tip
          width: rows.width - 10
          height: 32
          radius: ThemeBridge.radiusSmall
          color: rowArea.containsMouse ? Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, 0.06) : "transparent"

          MouseArea {  // a click on the row ticks it; a folder's arrow opens it
            id: rowArea
            anchors.fill: parent
            hoverEnabled: true
            onClicked: root.fi.toggleRow(index)
          }
          ToolTip.visible: rowArea.containsMouse && tip !== ""
          ToolTip.delay: 700
          ToolTip.text: tip

          RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 8 + depth * 20
            anchors.rightMargin: 8
            spacing: 6
            Item {
              implicitWidth: 18
              implicitHeight: 18
              Text {
                anchors.centerIn: parent
                visible: isFolder
                text: expanded ? "▾" : "▸"
                color: ThemeBridge.textDim
                font.pixelSize: 14
              }
              MouseArea { anchors.fill: parent; enabled: isFolder; cursorShape: Qt.PointingHandCursor; onClicked: root.fi.toggleExpanded(index) }
            }
            CheckBox {
              padding: 0
              tristate: true
              checkState: check === "all" ? Qt.Checked : check === "some" ? Qt.PartiallyChecked : Qt.Unchecked
              nextCheckState: function() { return checkState }  // the model decides; it is redrawn from "check"
              onClicked: root.fi.toggleRow(index)
            }
            Text {
              Layout.fillWidth: true
              text: name
              color: ThemeBridge.text
              font.pixelSize: 13
              elide: Text.ElideRight
            }
            Text { text: detail; color: ThemeBridge.textDim; font.pixelSize: 12 }
            Text {
              visible: duplicate || !suggested
              text: duplicate ? "already in library" : "probably not wanted"
              color: "#ffb454"
              font.pixelSize: 11
            }
          }
        }
      }
      Dim { visible: root.fi.notes !== ""; text: root.fi.notes }
    }

    Item { visible: !root.fi.hasScan || root.fi.nothingFound; Layout.fillHeight: true }

    RowLayout {
      Layout.fillWidth: true
      Item { Layout.fillWidth: true }
      Button { text: "Cancel"; enabled: !root.fi.busy; onClicked: root.fi.cancel() }
      Button {
        text: root.fi.addLabel
        enabled: root.fi.canAdd
        highlighted: true
        onClicked: root.fi.add()
      }
    }
  }
}
