import QtQuick
import QtQuick.Shapes
import Rancha

// Minimize / maximize (restore) / close in the app's own style (the Electron WindowControls.tsx and .wc-btn CSS):
// 38 x 30 buttons, thin rounded icons, a hover tint; the close button turns red and its cross turns a quarter.
Row {
  id: root
  spacing: 4
  readonly property var win: Window.window
  readonly property bool maximized: win !== null && win.visibility === Window.Maximized

  component WcButton: Rectangle {
    id: btn
    property var paths: []          // SVG paths on a 14 x 14 grid
    property real stroke: 1.5
    property bool isClose: false
    signal clicked
    width: 38
    height: 30
    radius: 9
    color: !area.containsMouse ? "transparent"
           : isClose ? "#e5484d" : Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, 0.12)
    Behavior on color { ColorAnimation { duration: ThemeBridge.fastMs } }

    Item {
      id: glyph
      anchors.centerIn: parent
      width: 14
      height: 14
      scale: area.containsMouse ? (btn.isClose ? 1.1 : 1.12) : 1.0
      rotation: btn.isClose && area.containsMouse ? 90 : 0
      Behavior on scale { NumberAnimation { duration: ThemeBridge.medMs; easing.type: Easing.OutCubic } }
      Behavior on rotation { NumberAnimation { duration: ThemeBridge.medMs; easing.type: Easing.OutCubic } }
      Shape {
        anchors.fill: parent
        preferredRendererType: Shape.CurveRenderer
        ShapePath {
          strokeColor: area.containsMouse ? (btn.isClose ? "white" : ThemeBridge.text) : ThemeBridge.textDim
          strokeWidth: btn.stroke
          fillColor: "transparent"
          capStyle: ShapePath.RoundCap
          joinStyle: ShapePath.RoundJoin
          PathSvg { path: btn.paths.length > 0 ? btn.paths[0] : "" }
        }
        ShapePath {  // second path (the restore icon has two parts)
          strokeColor: area.containsMouse ? (btn.isClose ? "white" : ThemeBridge.text) : ThemeBridge.textDim
          strokeWidth: btn.stroke
          fillColor: "transparent"
          capStyle: ShapePath.RoundCap
          joinStyle: ShapePath.RoundJoin
          PathSvg { path: btn.paths.length > 1 ? btn.paths[1] : "" }
        }
      }
    }
    MouseArea {
      id: area
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onClicked: btn.clicked()
    }
  }

  WcButton {
    paths: ["M3 10h8"]
    stroke: 1.6
    onClicked: if (root.win) root.win.showMinimized()
  }
  WcButton {
    paths: root.maximized
           ? ["M4.3 4.5h3.4a1.8 1.8 0 0 1 1.8 1.8v3.4a1.8 1.8 0 0 1-1.8 1.8H4.3a1.8 1.8 0 0 1-1.8-1.8V6.3a1.8 1.8 0 0 1 1.8-1.8z",
              "M5 4.5V4a1.8 1.8 0 0 1 1.8-1.8H10A1.8 1.8 0 0 1 11.8 4v3.2A1.8 1.8 0 0 1 10 9h-.5"]
           : ["M4.7 2.5h4.6a2.2 2.2 0 0 1 2.2 2.2v4.6a2.2 2.2 0 0 1-2.2 2.2H4.7a2.2 2.2 0 0 1-2.2-2.2V4.7a2.2 2.2 0 0 1 2.2-2.2z"]
    onClicked: if (root.win) { if (root.maximized) root.win.showNormal(); else root.win.showMaximized() }
  }
  WcButton {
    isClose: true
    paths: ["M3.2 3.2l7.6 7.6M10.8 3.2l-7.6 7.6"]
    stroke: 1.6
    onClicked: if (root.win) root.win.close()
  }
}
