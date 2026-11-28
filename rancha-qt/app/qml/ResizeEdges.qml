import QtQuick

// Thin strips along the window edges and corners: the window has no frame of its own, so these give back resizing
// (the system does the resizing through startSystemResize). Not active while maximized or full screen.
Item {
  id: root
  property int grip: 6
  readonly property bool active: Window.window && Window.window.visibility === Window.Windowed

  component Edge: MouseArea {
    property int edges
    enabled: root.active
    hoverEnabled: true
    onPressed: if (Window.window) Window.window.startSystemResize(edges)
  }

  Edge { edges: Qt.TopEdge;    height: root.grip; anchors { top: parent.top; left: parent.left; right: parent.right; leftMargin: root.grip * 2; rightMargin: root.grip * 2 } cursorShape: Qt.SizeVerCursor }
  Edge { edges: Qt.BottomEdge; height: root.grip; anchors { bottom: parent.bottom; left: parent.left; right: parent.right; leftMargin: root.grip * 2; rightMargin: root.grip * 2 } cursorShape: Qt.SizeVerCursor }
  Edge { edges: Qt.LeftEdge;   width: root.grip; anchors { left: parent.left; top: parent.top; bottom: parent.bottom; topMargin: root.grip * 2; bottomMargin: root.grip * 2 } cursorShape: Qt.SizeHorCursor }
  Edge { edges: Qt.RightEdge;  width: root.grip; anchors { right: parent.right; top: parent.top; bottom: parent.bottom; topMargin: root.grip * 2; bottomMargin: root.grip * 2 } cursorShape: Qt.SizeHorCursor }
  Edge { edges: Qt.TopEdge | Qt.LeftEdge;     width: root.grip * 2; height: root.grip * 2; anchors { top: parent.top; left: parent.left } cursorShape: Qt.SizeFDiagCursor }
  Edge { edges: Qt.TopEdge | Qt.RightEdge;    width: root.grip * 2; height: root.grip * 2; anchors { top: parent.top; right: parent.right } cursorShape: Qt.SizeBDiagCursor }
  Edge { edges: Qt.BottomEdge | Qt.LeftEdge;  width: root.grip * 2; height: root.grip * 2; anchors { bottom: parent.bottom; left: parent.left } cursorShape: Qt.SizeBDiagCursor }
  Edge { edges: Qt.BottomEdge | Qt.RightEdge; width: root.grip * 2; height: root.grip * 2; anchors { bottom: parent.bottom; right: parent.right } cursorShape: Qt.SizeFDiagCursor }
}
