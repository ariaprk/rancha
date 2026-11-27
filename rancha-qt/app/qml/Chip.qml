import QtQuick
import Rancha

// A small selectable button used in the top bar and the settings strip.
Rectangle {
  id: root
  property string label
  property bool selected: false
  signal clicked
  implicitWidth: text.implicitWidth + 20
  implicitHeight: 28
  radius: ThemeBridge.radiusSmall
  color: selected ? ThemeBridge.accentColor : (area.containsMouse ? ThemeBridge.surface2 : "transparent")
  border.color: selected ? "transparent" : ThemeBridge.border
  Behavior on color { ColorAnimation { duration: ThemeBridge.fastMs } }
  Text {
    id: text
    anchors.centerIn: parent
    text: root.label
    color: root.selected ? "white" : ThemeBridge.text
    font.pixelSize: 12
  }
  MouseArea {
    id: area
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: root.clicked()
  }
}
