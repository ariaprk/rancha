import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Rancha

// The top bar: Add, search, tag filter, card size, sort and the three views.
// Q5: search (Ctrl+K, Esc clears), "only here / everywhere" and the tag filter work.
// Q4: Add opens a small menu; "Add a folder…" works (adding one item comes with the item editor).
Rectangle {
  id: root
  property string viewMode: "covers"
  property real cardWidth: 190
  signal viewModeSelected(string mode)
  signal cardWidthSelected(real value)
  signal addFolderClicked
  signal addFilesClicked
  signal createClicked(string kind, bool rom)

  // This bar IS the top of the window (title bar and toolbar in one, 48 px, like the Electron app): no frame of
  // the system, our own window buttons at the right end, and no line under it.
  implicitHeight: 48
  color: "transparent"

  DragArea { anchors.fill: parent }  // empty parts move the window; double-click maximizes

  readonly property var sortNames: ({
    "custom": "Custom order", "name": "Name A-Z", "nameDesc": "Name Z-A", "added": "Newest added",
    "addedOld": "Oldest added", "opened": "Recently opened", "type": "Type"
  })

  RowLayout {
    anchors.fill: parent
    anchors.leftMargin: 20
    anchors.rightMargin: 8
    spacing: 10

    Rectangle {  // Add
      implicitWidth: addRow.implicitWidth + 30
      implicitHeight: 38
      radius: 19
      // "a clear, fresh green button (the one thing that always stands out)": the same in every theme
      gradient: Gradient {
        GradientStop { position: 0.0; color: "#2fd37a" }
        GradientStop { position: 1.0; color: "#14a455" }
      }
      scale: addArea.containsMouse ? 1.03 : 1.0
      Behavior on scale { NumberAnimation { duration: ThemeBridge.fastMs } }
      Row {
        id: addRow
        anchors.centerIn: parent
        spacing: 6
        Icon {
          anchors.verticalCenter: parent.verticalCenter; name: "plus"; size: 18; lineWidth: 2.8; color: "white"
          rotation: addArea.containsMouse ? 90 : 0
          Behavior on rotation { NumberAnimation { duration: ThemeBridge.medMs; easing.type: Easing.OutBack } }
        }
        Text { anchors.verticalCenter: parent.verticalCenter; text: "Add"; color: "white"; font.family: ThemeBridge.fontBold; font.weight: Font.Bold; font.pixelSize: 15 }
      }
      MouseArea { id: addArea; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: addMenu.popup(0, parent.height + 4) }
      RMenu {
        id: addMenu
        // as in the Electron app's Toolbar.tsx; adding works while a folder (or Home) is open
        RMenuItem { text: "New collection…"; enabled: LibraryModel.canAdd; onTriggered: root.createClicked("collection", false) }
        RMenuItem { text: "PC game or app…"; enabled: LibraryModel.canAdd; onTriggered: root.createClicked("launchable", false) }
        RMenuItem { text: "Console game (ROM)…"; enabled: LibraryModel.canAdd; onTriggered: root.createClicked("launchable", true) }
        RMenuItem { text: "Video…"; enabled: LibraryModel.canAdd; onTriggered: root.createClicked("video", false) }
        RMenuItem { text: "Comic, manga or PDF…"; enabled: LibraryModel.canAdd; onTriggered: root.createClicked("readable", false) }
        RMenuItem { text: "Music file…"; enabled: LibraryModel.canAdd; onTriggered: root.createClicked("audio", false) }
        RMenuSeparator {}
        RMenuItem { text: "Add several files at once…"; enabled: LibraryModel.canAdd; onTriggered: root.addFilesClicked() }
        RMenuItem { text: "Add a whole folder…"; enabled: LibraryModel.canAdd; onTriggered: root.addFolderClicked() }
      }
    }

    Rectangle {  // search
      Layout.fillWidth: true
      Layout.maximumWidth: 440
      Layout.minimumWidth: 140
      implicitHeight: 32
      radius: 16
      // frosted glass in every theme; clicking it does not change its color (as in Electron). No real blur yet.
      gradient: Gradient {
        GradientStop { position: 0.0; color: ThemeBridge.isDark ? Qt.rgba(1, 1, 1, 0.16) : Qt.rgba(1, 1, 1, ThemeBridge.mode === "airy" ? 0.80 : 0.85) }
        GradientStop { position: 1.0; color: ThemeBridge.isDark ? Qt.rgba(1, 1, 1, 0.05) : Qt.rgba(1, 1, 1, ThemeBridge.mode === "airy" ? 0.45 : 0.50) }
      }
      border.width: 1
      border.color: ThemeBridge.isDark ? Qt.rgba(1, 1, 1, 0.22) : Qt.rgba(1, 1, 1, 0.95)
      Icon { id: searchIcon; x: 12; anchors.verticalCenter: parent.verticalCenter; name: "search"; size: 18; color: ThemeBridge.textDim }
      TextField {
        id: searchField
        anchors.left: searchIcon.right
        anchors.leftMargin: 6
        anchors.right: parent.right
        anchors.rightMargin: 10
        anchors.verticalCenter: parent.verticalCenter
        placeholderText: "Search everything  (Ctrl+K)"
        placeholderTextColor: ThemeBridge.textDim
        color: ThemeBridge.text
        font.pixelSize: 14
        background: null
        // The model clears the search when another place opens; typing sends every change to the model.
        text: LibraryModel.query
        onTextEdited: LibraryModel.query = text
        Keys.onEscapePressed: { LibraryModel.query = ""; focus = false }
      }
      Shortcut { sequence: "Ctrl+K"; onActivated: { searchField.forceActiveFocus(); searchField.selectAll() } }
    }

    Rectangle {  // search only inside the open folder, or everywhere (shown while searching in a folder)
      readonly property bool inFolder: LibraryModel.viewType === "folder" && LibraryModel.currentId !== ""
      visible: inFolder && LibraryModel.query.trim() !== ""
      implicitWidth: hereText.implicitWidth + 24
      implicitHeight: 32
      radius: 16
      color: LibraryModel.searchHere ? Qt.rgba(ThemeBridge.accentColor.r, ThemeBridge.accentColor.g, ThemeBridge.accentColor.b, 0.25)
                                     : Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, 0.07)
      Text {
        id: hereText
        anchors.centerIn: parent
        text: LibraryModel.searchHere ? "Only here" : "Everywhere"
        color: LibraryModel.searchHere ? ThemeBridge.text : ThemeBridge.textDim
        font.pixelSize: 13
      }
      MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: LibraryModel.searchHere = !LibraryModel.searchHere }
    }

    Rectangle {  // tag filter: an item must have every chosen tag
      implicitWidth: tagRow.implicitWidth + 28
      implicitHeight: 32
      radius: ThemeBridge.radiusSmall
      readonly property int chosen: LibraryModel.selectedTags.length
      color: chosen > 0 ? Qt.rgba(ThemeBridge.accentColor.r, ThemeBridge.accentColor.g, ThemeBridge.accentColor.b, 0.25)
                        : Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, tagArea.containsMouse ? 0.12 : 0.07)
      visible: root.width > 900
      Row {
        id: tagRow
        anchors.centerIn: parent
        spacing: 8
        Text {
          anchors.verticalCenter: parent.verticalCenter
          text: LibraryModel.allTags.length === 0 ? "No tags yet"
                : parent.parent.chosen === 0 ? "Tags"
                : parent.parent.chosen === 1 ? LibraryModel.selectedTags[0]
                : parent.parent.chosen + " tags"
          color: parent.parent.chosen > 0 ? ThemeBridge.text : ThemeBridge.textDim
          font.pixelSize: 14
        }
        Icon { anchors.verticalCenter: parent.verticalCenter; name: "chevDown"; size: 14; color: ThemeBridge.textDim }
      }
      MouseArea {
        id: tagArea
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        enabled: LibraryModel.allTags.length > 0
        onClicked: tagMenu.popup()
      }
      RMenu {
        id: tagMenu
        Instantiator {
          model: LibraryModel.allTags
          delegate: RMenuItem {
            required property var modelData
            // not "checkable": a click would replace the binding below
            showCheck: true
            on: LibraryModel.selectedTags.indexOf(modelData.tag) >= 0
            text: modelData.tag
            hint: String(modelData.count)
            onTriggered: LibraryModel.toggleTag(modelData.tag)
          }
          onObjectAdded: (index, object) => tagMenu.insertItem(index, object)
          onObjectRemoved: (index, object) => tagMenu.removeItem(object)
        }
        RMenuSeparator {}
        RMenuItem { text: "Clear tags"; enabled: LibraryModel.selectedTags.length > 0; onTriggered: LibraryModel.clearTags() }
      }
    }

    Item { Layout.fillWidth: true }

    Slider {  // card size: hidden below 1400 px (Poppins is wide); the same setting will be in Settings
      visible: Window.window !== null && Window.window.width > 1400
      implicitWidth: 150
      from: 130
      to: 280
      value: root.cardWidth
      onMoved: root.cardWidthSelected(value)
    }

    Rectangle {  // sort
      implicitWidth: sortRow.implicitWidth + 28
      implicitHeight: 32
      radius: ThemeBridge.radiusSmall
      color: sortArea.containsMouse ? Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, 0.12)
                                    : Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, 0.07)
      Row {
        id: sortRow
        anchors.centerIn: parent
        spacing: 8
        Text { anchors.verticalCenter: parent.verticalCenter; text: "Sort: " + root.sortNames[LibraryModel.sortMode]; color: ThemeBridge.text; font.pixelSize: 14 }
        Icon { anchors.verticalCenter: parent.verticalCenter; name: "chevDown"; size: 14; color: ThemeBridge.textDim }
      }
      MouseArea { id: sortArea; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: sortMenu.popup() }
      RMenu {
        id: sortMenu
        RMenuItem { text: "Custom order"; showCheck: true; on: LibraryModel.sortMode === "custom"; onTriggered: LibraryModel.sortMode = "custom" }
        RMenuItem { text: "Name A-Z"; showCheck: true; on: LibraryModel.sortMode === "name"; onTriggered: LibraryModel.sortMode = "name" }
        RMenuItem { text: "Name Z-A"; showCheck: true; on: LibraryModel.sortMode === "nameDesc"; onTriggered: LibraryModel.sortMode = "nameDesc" }
        RMenuItem { text: "Newest added"; showCheck: true; on: LibraryModel.sortMode === "added"; onTriggered: LibraryModel.sortMode = "added" }
        RMenuItem { text: "Oldest added"; showCheck: true; on: LibraryModel.sortMode === "addedOld"; onTriggered: LibraryModel.sortMode = "addedOld" }
        RMenuItem { text: "Recently opened"; showCheck: true; on: LibraryModel.sortMode === "opened"; onTriggered: LibraryModel.sortMode = "opened" }
        RMenuItem { text: "Type"; showCheck: true; on: LibraryModel.sortMode === "type"; onTriggered: LibraryModel.sortMode = "type" }
      }
    }

    Rectangle {  // the three views
      implicitWidth: 3 * 36 + 8
      implicitHeight: 32
      radius: ThemeBridge.radiusSmall + 2
      color: Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, 0.07)
      Row {
        anchors.centerIn: parent
        spacing: 2
        Repeater {
          model: [{ m: "covers", i: "viewCovers" }, { m: "compact", i: "viewCompact" }, { m: "list", i: "viewList" }]
          delegate: Rectangle {
            required property var modelData
            width: 36
            height: 26
            radius: ThemeBridge.radiusSmall
            gradient: Gradient {
              orientation: Gradient.Horizontal
              GradientStop { position: 0.0; color: root.viewMode === modelData.m ? ThemeBridge.accentFrom : "transparent" }
              GradientStop { position: 1.0; color: root.viewMode === modelData.m ? ThemeBridge.accentTo : "transparent" }
            }
            Icon { anchors.centerIn: parent; name: modelData.i; size: 18; color: root.viewMode === modelData.m ? "white" : ThemeBridge.textDim }
            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.viewModeSelected(modelData.m) }
          }
        }
      }
    }

    WindowControls { Layout.leftMargin: 6 }
  }
}
