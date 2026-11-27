import QtQuick
import QtQuick.Effects
import Rancha

// The designed section icons (PNG shapes, as in the Electron app) painted in one color.
Item {
  id: root
  property string source
  property color tint: "white"
  property real size: 28
  width: size
  height: size
  Image {
    id: img
    anchors.fill: parent
    source: root.source
    sourceSize: Qt.size(root.size * 2, root.size * 2)
    smooth: true
    visible: false
    layer.enabled: true
  }
  MultiEffect {
    anchors.fill: img
    source: img
    colorization: 1.0
    colorizationColor: root.tint
  }
}
