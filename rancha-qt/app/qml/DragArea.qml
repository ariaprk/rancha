import QtQuick

// An empty part of the title bar: drag it to move the window, double-click to maximize / restore (like the Electron
// -webkit-app-region: drag). Put it BEHIND the buttons (z: -1) so the buttons keep their own clicks.
Item {
  z: -1
  DragHandler {
    target: null
    onActiveChanged: if (active && Window.window) Window.window.startSystemMove()
  }
  TapHandler {
    onDoubleTapped: {
      const w = Window.window
      if (!w) return
      if (w.visibility === Window.Maximized) w.showNormal()
      else w.showMaximized()
    }
  }
}
