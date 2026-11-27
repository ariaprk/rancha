import QtQuick
import QtQuick.Effects
import Rancha

// One item as a card (like the Electron app): a cover with a soft gradient, a faint kind icon and the initials,
// then the name and a small line of text under it.
Item {
  id: root
  // filled by the model's roles of the same names
  required property string name
  required property string kind
  required property string initials
  required property string subtitle
  required property color topColor
  required property color bottomColor
  required property color glowColor
  required property bool isFolder
  required property bool isFavorite
  required property bool isSelected
  required property bool isMissing  // its file or folder was not found
  property bool compact: false
  signal activated                              // double-click (a folder: one click)
  signal clicked(bool ctrl, bool shift)         // select
  signal menuRequested                          // right-click
  signal favoriteToggled
  // drag-to-reorder: positions are in window coordinates; Main.qml moves the ghost and places the items
  signal dragStarted(real x, real y)
  signal dragMoved(real x, real y)
  signal dragEnded

  readonly property string iconName: kind === "collection" ? "folder" : kind === "video" ? "film"
                                    : kind === "readable" ? "book" : kind === "audio" ? "note" : "play"

  Item {
    id: card
    anchors.fill: parent
    anchors.margins: 9
    scale: mouse.containsMouse ? ThemeBridge.hoverScale : 1.0
    Behavior on scale { NumberAnimation { duration: ThemeBridge.fastMs; easing.type: Easing.OutCubic } }

    // the cover
    Rectangle {
      id: cover
      width: parent.width
      height: root.compact ? width : width * 1.5
      radius: ThemeBridge.radius
      clip: true
      // a missing file: grayscale(.85) brightness(.7)
      layer.enabled: root.isMissing
      layer.effect: MultiEffect { saturation: -0.85; brightness: -0.3 }
      gradient: Gradient {
        GradientStop { position: 0.0; color: root.topColor }
        GradientStop { position: 1.0; color: root.bottomColor }
      }
      // light from the upper left (the glow of the Electron cover, simplified)
      Rectangle {
        anchors.fill: parent
        gradient: Gradient {
          orientation: Gradient.Horizontal
          GradientStop { position: 0.0; color: Qt.rgba(root.glowColor.r, root.glowColor.g, root.glowColor.b, 0.30) }
          GradientStop { position: 0.7; color: "transparent" }
        }
      }
      Icon {
        anchors.centerIn: parent
        size: Math.min(parent.width, parent.height) * 0.46
        lineWidth: 1.5
        name: root.iconName
        color: Qt.rgba(1, 1, 1, 0.16)
      }
      Text {
        anchors.centerIn: parent
        text: root.initials
        color: Qt.rgba(1, 1, 1, 0.92)
        font.family: ThemeBridge.fontBold
        font.weight: Font.Bold
        font.pixelSize: Math.max(16, Math.min(30, cover.width * 0.17))
        font.letterSpacing: 1
      }
      Rectangle {  // ring under the pointer
        anchors.fill: parent
        radius: parent.radius
        color: "transparent"
        border.width: root.isSelected ? 3 : 2
        border.color: ThemeBridge.accentColor
        opacity: mouse.containsMouse || root.isSelected ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: ThemeBridge.fastMs } }
      }
      Rectangle {  // favorite badge
        width: 24
        height: 24
        radius: 12
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: 8
        color: Qt.rgba(0, 0, 0, 0.45)
        visible: root.isFavorite || mouse.containsMouse
        Icon {
          anchors.centerIn: parent
          size: 14
          name: "star"
          lineWidth: 2
          color: root.isFavorite ? "#ffd166" : "white"
        }
        MouseArea {
          anchors.fill: parent
          cursorShape: Qt.PointingHandCursor
          onClicked: root.favoriteToggled()
        }
      }
    }

    Rectangle {  // "Missing": the file was not found
      visible: root.isMissing
      anchors.left: cover.left
      anchors.bottom: cover.bottom
      anchors.margins: 8
      width: missingText.implicitWidth + 16
      height: missingText.implicitHeight + 4
      radius: height / 2
      color: "#ffb454"
      Text {
        id: missingText
        anchors.centerIn: parent
        text: "Missing"
        color: "#2b1500"
        font.pixelSize: 11
        font.weight: Font.Bold
        font.letterSpacing: 0.33
      }
    }

    Column {
      anchors.top: cover.bottom
      anchors.topMargin: 10
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.leftMargin: 2
      anchors.rightMargin: 2
      spacing: 2
      Text {
        width: parent.width
        text: root.name
        color: root.isMissing ? ThemeBridge.textDim : ThemeBridge.text
        elide: Text.ElideRight
        font.family: ThemeBridge.fontBold
        font.weight: Font.DemiBold
        font.pixelSize: root.compact ? 12 : 15
      }
      Text {
        width: parent.width
        visible: !root.compact
        text: root.subtitle
        color: ThemeBridge.textDim
        elide: Text.ElideRight
        font.pixelSize: 12
      }
    }

    MouseArea {
      id: mouse
      anchors.fill: parent
      z: -1
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      acceptedButtons: Qt.LeftButton | Qt.RightButton
      preventStealing: true  // a drag moves the card, it does not scroll the grid
      // Pressing and moving 6 px lifts the card (drag-to-reorder); the click that ends a drag is ignored.
      property point pressPoint
      property bool dragging: false
      property bool justDragged: false
      onPressed: (event) => { pressPoint = Qt.point(event.x, event.y); dragging = false; justDragged = false }
      onPositionChanged: (event) => {
        if (!(event.buttons & Qt.LeftButton)) return
        const at = mapToItem(null, event.x, event.y)
        if (dragging) { root.dragMoved(at.x, at.y); return }
        if (Math.abs(event.x - pressPoint.x) + Math.abs(event.y - pressPoint.y) < 6) return
        dragging = true
        root.dragStarted(at.x, at.y)
      }
      onReleased: if (dragging) { dragging = false; justDragged = true; root.dragEnded() }
      onCanceled: if (dragging) { dragging = false; root.dragEnded() }
      // As in the Electron app: a click selects (a folder opens), a double-click opens, Ctrl / Shift add to the selection.
      onClicked: (event) => {
        if (justDragged) { justDragged = false; return }
        if (event.button === Qt.RightButton) { root.menuRequested(); return }
        const ctrl = (event.modifiers & Qt.ControlModifier) !== 0
        const shift = (event.modifiers & Qt.ShiftModifier) !== 0
        if (root.isFolder && !ctrl && !shift) root.activated()
        else root.clicked(ctrl, shift)
      }
      onDoubleClicked: (event) => { if (event.button === Qt.LeftButton && !root.isFolder) root.activated() }
    }
  }
}
