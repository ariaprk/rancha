import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Rancha

ApplicationWindow {
  id: window
  width: 1280
  height: 800
  minimumWidth: 760
  minimumHeight: 480
  visible: true
  title: "Rancha"
  color: ThemeBridge.bg

  property string viewMode: "covers"   // covers | compact | list
  property real cardWidth: 190          // wanted width of a card in "covers" view

  Behavior on color { ColorAnimation { duration: ThemeBridge.medMs } }

  // soft light and shade behind everything (values come from the core)
  Rectangle {
    anchors.fill: parent
    gradient: Gradient {
      GradientStop { position: 0.0; color: ThemeBridge.lightCenter }
      GradientStop { position: 1.0; color: ThemeBridge.shadeBottom }
    }
  }
  Rectangle {  // accent glow at the top
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    height: parent.height * 0.5
    visible: ThemeBridge.ambientStrength > 0
    gradient: Gradient {
      GradientStop { position: 0.0; color: Qt.rgba(ThemeBridge.accentColor.r, ThemeBridge.accentColor.g, ThemeBridge.accentColor.b, ThemeBridge.ambientStrength) }
      GradientStop { position: 1.0; color: "transparent" }
    }
  }

  LookPanel {
    id: lookPanel
    parent: Overlay.overlay
    x: sidebar.width + 12
    y: window.height - height - 20
  }

  RowLayout {
    anchors.fill: parent
    spacing: 0

    Sidebar {
      id: sidebar
      Layout.fillHeight: true
      Layout.preferredWidth: implicitWidth
      onSettingsClicked: lookPanel.opened ? lookPanel.close() : lookPanel.open()
    }

    ColumnLayout {
      Layout.fillWidth: true
      Layout.fillHeight: true
      spacing: 0

      TopBar {
        Layout.fillWidth: true
        viewMode: window.viewMode
        cardWidth: window.cardWidth
        onViewModeSelected: (mode) => window.viewMode = mode
        onCardWidthSelected: (value) => window.cardWidth = value
      }

      // breadcrumb: back / forward and the path
      RowLayout {
        Layout.fillWidth: true
        Layout.leftMargin: 24
        Layout.rightMargin: 24
        Layout.topMargin: 14
        Layout.bottomMargin: 4
        spacing: 6

        Rectangle {
          implicitWidth: 38; implicitHeight: 34; radius: ThemeBridge.radiusSmall
          color: Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, backArea.containsMouse ? 0.12 : 0.07)
          opacity: LibraryModel.canGoBack ? 1 : 0.4
          Icon { anchors.centerIn: parent; name: "chevL"; size: 18; color: ThemeBridge.text }
          MouseArea { id: backArea; anchors.fill: parent; hoverEnabled: true; onClicked: LibraryModel.back() }
        }
        Rectangle {  // forward: drawn only (history comes later)
          implicitWidth: 38; implicitHeight: 34; radius: ThemeBridge.radiusSmall
          color: Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, 0.07)
          opacity: 0.4
          Icon { anchors.centerIn: parent; name: "chevR"; size: 18; color: ThemeBridge.text }
        }
        Item { implicitWidth: 6 }
        Text {
          text: "Home"
          color: LibraryModel.currentId === "" ? ThemeBridge.text : ThemeBridge.textDim
          font.family: ThemeBridge.fontBold
          font.weight: Font.DemiBold
          font.pixelSize: 18
          MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: LibraryModel.open("") }
        }
        Repeater {
          model: LibraryModel.breadcrumb
          delegate: RowLayout {
            required property var modelData
            required property int index
            spacing: 6
            Icon { name: "chevR"; size: 16; color: ThemeBridge.textDim }
            Text {
              text: modelData.name
              color: index === LibraryModel.breadcrumb.length - 1 ? ThemeBridge.text : ThemeBridge.textDim
              font.family: ThemeBridge.fontBold
              font.weight: Font.DemiBold
              font.pixelSize: 18
              MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: LibraryModel.open(modelData.id) }
            }
          }
        }
        Item { Layout.fillWidth: true }
      }

      // the items of the open folder
      Item {
        Layout.fillWidth: true
        Layout.fillHeight: true

        GridView {
          id: grid
          anchors.fill: parent
          anchors.leftMargin: 15
          anchors.rightMargin: 6
          anchors.topMargin: 4
          visible: window.viewMode !== "list"
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          model: LibraryModel
          readonly property bool compactView: window.viewMode === "compact"
          readonly property real wanted: compactView ? window.cardWidth * 0.62 : window.cardWidth
          readonly property int columns: Math.max(1, Math.floor(width / wanted))
          cellWidth: Math.floor(width / columns)
          // cover (2:3, or square when compact) + the text under it
          cellHeight: (cellWidth - 18) * (compactView ? 1.0 : 1.5) + 18 + (compactView ? 34 : 54)
          ScrollBar.vertical: ScrollBar {}
          delegate: CoverCard {
            required property int index
            width: grid.cellWidth
            height: grid.cellHeight
            compact: grid.compactView
            onActivated: LibraryModel.openRow(index)
            onFavoriteToggled: LibraryModel.toggleFavorite(index)
          }
        }

        ListView {
          id: list
          anchors.fill: parent
          anchors.leftMargin: 24
          anchors.rightMargin: 12
          anchors.topMargin: 4
          visible: window.viewMode === "list"
          clip: true
          spacing: 2
          boundsBehavior: Flickable.StopAtBounds
          model: LibraryModel
          ScrollBar.vertical: ScrollBar {}
          delegate: Rectangle {
            required property int index
            required property string name
            required property string initials
            required property string subtitle
            required property color topColor
            required property color bottomColor
            required property bool isFavorite
            width: list.width - 12
            height: 52
            radius: ThemeBridge.radiusSmall
            color: rowArea.containsMouse ? Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, 0.07) : "transparent"
            MouseArea {
              id: rowArea
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: LibraryModel.openRow(index)
            }
            Rectangle {
              id: thumb
              x: 8
              anchors.verticalCenter: parent.verticalCenter
              width: 34; height: 40; radius: 7
              gradient: Gradient {
                GradientStop { position: 0; color: topColor }
                GradientStop { position: 1; color: bottomColor }
              }
              Text { anchors.centerIn: parent; text: initials; color: "white"; font.pixelSize: 12; font.family: ThemeBridge.fontBold; font.weight: Font.Bold }
            }
            Text {
              anchors.left: thumb.right; anchors.leftMargin: 14; anchors.verticalCenter: parent.verticalCenter
              text: name; color: ThemeBridge.text; font.family: ThemeBridge.fontBold; font.weight: Font.DemiBold; font.pixelSize: 15
            }
            Text {
              anchors.right: star.left; anchors.rightMargin: 20; anchors.verticalCenter: parent.verticalCenter
              text: subtitle; color: ThemeBridge.textDim; font.pixelSize: 13
            }
            Item {
              id: star
              anchors.right: parent.right; anchors.rightMargin: 14; anchors.verticalCenter: parent.verticalCenter
              width: 24; height: 24
              Icon { anchors.centerIn: parent; name: "star"; size: 18; lineWidth: 2; color: isFavorite ? "#ffd166" : ThemeBridge.textDim }
              MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: LibraryModel.toggleFavorite(index) }
            }
          }
        }

        Text {
          anchors.centerIn: parent
          visible: grid.count === 0
          text: "This folder is empty"
          color: ThemeBridge.textDim
        }
      }
    }
  }
}
