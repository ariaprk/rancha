import QtQuick
import QtQuick.Layouts
import Rancha

// The left bar: brand, Home / All items / Favorites / Recent, the sections, and Big Picture / Settings / Collapse at the bottom.
// Home, All items, Favorites, Recent and the sections work (Q5); Big Picture is only drawn (Q9).
Rectangle {
  id: root
  property bool collapsed: false
  signal settingsClicked

  implicitWidth: collapsed ? 72 : 250
  Behavior on implicitWidth { NumberAnimation { duration: ThemeBridge.medMs; easing.type: Easing.OutCubic } }
  color: ThemeBridge.glassColor
  clip: true

  Rectangle {  // right edge line
    anchors.right: parent.right
    width: 1
    height: parent.height
    color: ThemeBridge.glassBorder
  }

  readonly property var sectionIcons: ({
    "games": "video-game", "reading": "book", "video": "play", "apps": "apps", "music": "music"
  })

  component NavItem: Rectangle {
    id: item
    property string label
    property string iconName       // a line icon
    property string pngName        // or a designed icon (file name without .png)
    property bool active: false
    signal clicked
    Layout.fillWidth: true
    implicitHeight: 44
    radius: ThemeBridge.radiusSmall
    color: active ? Qt.rgba(ThemeBridge.accentColor.r, ThemeBridge.accentColor.g, ThemeBridge.accentColor.b, 0.20)
                  : (area.containsMouse ? Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, 0.07) : "transparent")
    Behavior on color { ColorAnimation { duration: ThemeBridge.fastMs } }

    Rectangle {  // selection bar
      x: 0
      anchors.verticalCenter: parent.verticalCenter
      width: 3
      height: item.active ? parent.height - 18 : 0
      radius: 2
      color: ThemeBridge.accentColor
      Behavior on height { NumberAnimation { duration: ThemeBridge.medMs; easing.type: Easing.OutCubic } }
    }
    Item {
      id: iconBox
      x: 14
      anchors.verticalCenter: parent.verticalCenter
      width: 28
      height: 28
      Icon {
        anchors.centerIn: parent
        visible: item.pngName === ""
        name: item.iconName
        size: 21
        color: item.active ? ThemeBridge.accentColor : ThemeBridge.textDim
      }
      SectionIcon {
        anchors.centerIn: parent
        visible: item.pngName !== ""
        size: 28
        source: item.pngName === "" ? "" : "../assets/icons/" + item.pngName + ".png"
        tint: item.active ? ThemeBridge.accentColor : ThemeBridge.accentFrom
        opacity: item.active || area.containsMouse ? 1.0 : 0.8
      }
    }
    Text {
      anchors.left: iconBox.right
      anchors.leftMargin: 12
      anchors.verticalCenter: parent.verticalCenter
      text: item.label
      color: item.active ? ThemeBridge.text : ThemeBridge.textDim
      font.family: ThemeBridge.fontBold
      font.weight: Font.DemiBold
      font.pixelSize: 15
      opacity: root.collapsed ? 0 : 1
      Behavior on opacity { NumberAnimation { duration: ThemeBridge.fastMs } }
    }
    MouseArea {
      id: area
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onClicked: item.clicked()
    }
  }

  ColumnLayout {
    anchors.fill: parent
    anchors.margins: 11
    spacing: 2

    RowLayout {  // brand
      Layout.preferredHeight: 52
      Layout.leftMargin: 6
      spacing: 10
      Rectangle {
        width: 26
        height: 26
        radius: 8
        gradient: Gradient {
          GradientStop { position: 0.0; color: ThemeBridge.accentFrom }
          GradientStop { position: 1.0; color: ThemeBridge.accentTo }
        }
      }
      Text {
        text: "Rancha"
        color: ThemeBridge.text
        font.family: ThemeBridge.fontBold
        font.weight: Font.Bold
        font.pixelSize: 21
        visible: !root.collapsed
      }
    }

    NavItem { label: "Home"; iconName: "home"; active: LibraryModel.viewType === "folder" && LibraryModel.currentId === ""; onClicked: LibraryModel.open("") }
    NavItem { label: "All items"; iconName: "list"; active: LibraryModel.viewType === "all"; onClicked: LibraryModel.showAll() }
    NavItem { label: "Favorites"; iconName: "star"; active: LibraryModel.viewType === "favorites"; onClicked: LibraryModel.showFavorites() }
    NavItem { label: "Recent"; iconName: "clock"; active: LibraryModel.viewType === "recent"; onClicked: LibraryModel.showRecent() }

    Text {
      Layout.topMargin: 14
      Layout.leftMargin: 14
      text: "COLLECTIONS"
      color: ThemeBridge.textDim
      font.pixelSize: 11
      font.letterSpacing: 1
      opacity: root.collapsed ? 0 : 1
      Behavior on opacity { NumberAnimation { duration: ThemeBridge.fastMs } }
    }

    Repeater {
      model: LibraryModel.sections
      delegate: NavItem {
        required property var modelData
        label: modelData.name
        pngName: root.sectionIcons[modelData.id] || ""
        iconName: "folder"
        active: LibraryModel.breadcrumb.length > 0 && LibraryModel.breadcrumb[0].id === modelData.id
        onClicked: LibraryModel.open(modelData.id)
      }
    }

    Item { Layout.fillHeight: true }

    // speed-test libraries (temporary: a developer aid until the Settings page exists, Q7)
    RowLayout {
      visible: !root.collapsed
      Layout.leftMargin: 4
      spacing: 4
      Chip { label: "Library"; onClicked: LibraryModel.loadLibrary() }
      Chip { label: "Sample"; onClicked: LibraryModel.loadSample() }
      Chip { label: "5 000"; onClicked: LibraryModel.loadStress(5000) }
      Chip { label: "50 000"; onClicked: LibraryModel.loadStress(50000) }
    }
    Text {
      visible: !root.collapsed
      Layout.leftMargin: 8
      Layout.bottomMargin: 6
      text: LibraryModel.totalCount + " items" + (LibraryModel.usingLibrary ? "" : " (sample)") + " • core " + CoreInfo.version
      color: ThemeBridge.textDim
      font.pixelSize: 11
    }

    NavItem { label: "Big Picture"; pngName: "game" }
    NavItem { label: "Settings"; iconName: "sliders"; onClicked: root.settingsClicked() }
    NavItem { label: "Collapse"; iconName: root.collapsed ? "expand" : "collapse"; onClicked: root.collapsed = !root.collapsed }
  }
}
