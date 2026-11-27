import QtQuick
import QtQuick.Controls
import QtQuick.Effects
import Rancha

// The app's pop-up menu (right-click menus, Add, Tags, Sort), styled like the Electron app's ContextMenu:
// a rounded surface with a thin glass border and a deep shadow, 6 px padding, rows with a rounded accent
// highlight under the pointer, red rows for dangerous actions, a dimmed hint at the right ("Middle click")
// and a check mark for on/off rows. It grows out of the clicked corner and stays 8 px inside the window.
// Put RMenuItem and RMenuSeparator inside it. The width follows the widest row, at least 210 px.
Menu {
  id: root
  padding: 6
  margins: 8
  transformOrigin: Popup.TopLeft

  delegate: RMenuItem {}

  background: Rectangle {
    implicitWidth: 210
    radius: 12
    color: ThemeBridge.surface
    border.width: 1
    border.color: ThemeBridge.glassBorder
    // box-shadow: 0 18px 44px rgba(0,0,0,.5)
    layer.enabled: true
    layer.effect: MultiEffect {
      shadowEnabled: true
      shadowVerticalOffset: 18
      shadowBlur: 1.0
      blurMax: 44
      shadowColor: Qt.rgba(0, 0, 0, ThemeBridge.isDark ? 0.5 : 0.22)
    }
  }

  // menu-in: from 98 % size and transparent to its place, in the fast time of the theme
  enter: Transition {
    ParallelAnimation {
      NumberAnimation { property: "opacity"; from: 0; to: 1; duration: ThemeBridge.fastMs; easing.type: Easing.OutCubic }
      NumberAnimation { property: "scale"; from: 0.98; to: 1; duration: ThemeBridge.fastMs; easing.type: Easing.OutCubic }
    }
  }
  exit: Transition {
    NumberAnimation { property: "opacity"; from: 1; to: 0; duration: Math.round(ThemeBridge.fastMs * 0.6) }
  }
}
