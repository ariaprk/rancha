import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Rancha

// The top bar: Add, search, tag filter, card size, sort and the three views.
// Q2.1: Add, search and the tag filter are only drawn (they work in Q4 and Q5); size, sort and views work.
Rectangle {
  id: root
  property string viewMode: "covers"
  property real cardWidth: 190
  signal viewModeSelected(string mode)
  signal cardWidthSelected(real value)

  implicitHeight: 64
  color: ThemeBridge.glassColor

  Rectangle {  // bottom line
    anchors.bottom: parent.bottom
    width: parent.width
    height: 1
    color: ThemeBridge.glassBorder
  }

  readonly property var sortNames: ({
    "custom": "Custom order", "name": "Name A-Z", "nameDesc": "Name Z-A", "added": "Newest added",
    "addedOld": "Oldest added", "opened": "Recently opened", "type": "Type"
  })

  RowLayout {
    anchors.fill: parent
    anchors.leftMargin: 20
    anchors.rightMargin: 20
    spacing: 12

    Rectangle {  // Add
      implicitWidth: addRow.implicitWidth + 32
      implicitHeight: 38
      radius: 19
      gradient: Gradient {
        orientation: Gradient.Horizontal
        GradientStop { position: 0.0; color: ThemeBridge.accentFrom }
        GradientStop { position: 1.0; color: ThemeBridge.accentTo }
      }
      scale: addArea.containsMouse ? 1.03 : 1.0
      Behavior on scale { NumberAnimation { duration: ThemeBridge.fastMs } }
      Row {
        id: addRow
        anchors.centerIn: parent
        spacing: 6
        Icon { anchors.verticalCenter: parent.verticalCenter; name: "plus"; size: 18; lineWidth: 2.2; color: "white" }
        Text { anchors.verticalCenter: parent.verticalCenter; text: "Add"; color: "white"; font.family: ThemeBridge.fontBold; font.weight: Font.Bold; font.pixelSize: 15 }
      }
      MouseArea { id: addArea; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor }
    }

    Rectangle {  // search
      Layout.fillWidth: true
      Layout.maximumWidth: 440
      Layout.minimumWidth: 140
      implicitHeight: 38
      radius: 19
      color: Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, searchField.activeFocus ? 0.10 : 0.07)
      border.width: searchField.activeFocus ? 1 : 0
      border.color: ThemeBridge.accentColor
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
      }
    }

    Rectangle {  // tag filter (drawn only)
      implicitWidth: tagRow.implicitWidth + 28
      implicitHeight: 36
      radius: ThemeBridge.radiusSmall
      color: Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, 0.07)
      visible: root.width > 900
      Row {
        id: tagRow
        anchors.centerIn: parent
        spacing: 8
        Text { anchors.verticalCenter: parent.verticalCenter; text: "No tags yet"; color: ThemeBridge.textDim; font.pixelSize: 14 }
        Icon { anchors.verticalCenter: parent.verticalCenter; name: "chevDown"; size: 14; color: ThemeBridge.textDim }
      }
    }

    Item { Layout.fillWidth: true }

    Slider {  // card size
      visible: root.width > 1000
      implicitWidth: 150
      from: 130
      to: 280
      value: root.cardWidth
      onMoved: root.cardWidthSelected(value)
    }

    Rectangle {  // sort
      implicitWidth: sortRow.implicitWidth + 28
      implicitHeight: 36
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
      Menu {
        id: sortMenu
        MenuItem { text: "Custom order"; onTriggered: LibraryModel.sortMode = "custom" }
        MenuItem { text: "Name A-Z"; onTriggered: LibraryModel.sortMode = "name" }
        MenuItem { text: "Name Z-A"; onTriggered: LibraryModel.sortMode = "nameDesc" }
        MenuItem { text: "Newest added"; onTriggered: LibraryModel.sortMode = "added" }
        MenuItem { text: "Oldest added"; onTriggered: LibraryModel.sortMode = "addedOld" }
        MenuItem { text: "Recently opened"; onTriggered: LibraryModel.sortMode = "opened" }
        MenuItem { text: "Type"; onTriggered: LibraryModel.sortMode = "type" }
      }
    }

    Rectangle {  // the three views
      implicitWidth: 3 * 36 + 8
      implicitHeight: 38
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
            height: 30
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
  }
}
