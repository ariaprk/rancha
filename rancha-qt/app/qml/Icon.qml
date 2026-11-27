import QtQuick
import QtQuick.Shapes

// A small line icon (same drawings as the Electron app, 24x24 grid), drawn as a vector path in the given color.
Item {
  id: root
  property string name
  property color color: "white"
  property real size: 20
  property real lineWidth: 1.8
  implicitWidth: size
  implicitHeight: size
  width: size
  height: size

  readonly property var paths: ({
    "home": "M3 11l9-8 9 8 M5 10v10h5v-6h4v6h5V10",
    "list": "M4 6h16M4 12h16M4 18h16",
    "star": "M12 3l2.8 5.8 6.2.8-4.5 4.4 1.1 6.3L12 17.3 6.4 20.3l1.1-6.3L3 9.6l6.2-.8z",
    "clock": "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 7v5l3 2",
    "sliders": "M4 7h10M18 7h2M4 17h2M10 17h10 M14 7a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M6 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    "search": "M4 11a7 7 0 1 0 14 0a7 7 0 1 0 -14 0 M20 20l-4-4",
    "folder": "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    "play": "M8 5l11 7-11 7z",
    "film": "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4",
    "book": "M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z M4 4.5v17",
    "note": "M9 18V6l10-2v12 M4 18a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M14 16a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0",
    "chevL": "M15 6l-6 6 6 6",
    "chevR": "M9 6l6 6-6 6",
    "collapse": "M11 6l-6 6 6 6M19 6l-6 6 6 6",
    "expand": "M13 6l6 6-6 6M5 6l6 6-6 6",
    "plus": "M12 5v14M5 12h14",
    "check": "M5 12.5l4.5 4.5L19 7.5",
    "viewCovers": "M5.5 3h4a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 4 11.5v-7A1.5 1.5 0 0 1 5.5 3z M14.5 3h4A1.5 1.5 0 0 1 20 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 14.5 3z M4 17h7M13 17h7M4 21h5M13 21h5",
    "viewCompact": "M4 3h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M10.5 3h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M17 3h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M4 10h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z M10.5 10h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z M17 10h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z M4 17h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z M10.5 17h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z M17 17h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z",
    "viewList": "M4 6h16M4 12h16M4 18h16",
    "tag": "M3 12V4h8l10 10-8 8z M7.5 8.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
    "chevDown": "M6 9l6 6 6-6"
  })

  Shape {
    width: 24
    height: 24
    scale: root.size / 24
    transformOrigin: Item.TopLeft
    preferredRendererType: Shape.CurveRenderer
    ShapePath {
      strokeColor: root.color
      strokeWidth: root.lineWidth
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap
      joinStyle: ShapePath.RoundJoin
      PathSvg { path: root.paths[root.name] || "" }
    }
  }
}
