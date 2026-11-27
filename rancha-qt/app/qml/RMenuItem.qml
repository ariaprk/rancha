import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Rancha

// One row of an RMenu (the Electron app's .menu-item): 8 x 12 px padding, 14.5 px medium text, a rounded
// accent highlight under the pointer or the keyboard, red text and highlight for "danger" rows, 40 % opacity
// when disabled, an optional check mark column ("showCheck" + "on", kept apart from MenuItem.checkable so a
// click never breaks a binding) and an optional dimmed hint at the right.
// With "separator: true" the row is drawn as the thin dividing line instead (for menus built from a list,
// where one delegate has to cover both kinds of rows).
MenuItem {
  id: control
  property bool separator: false
  property string hint: ""
  property bool danger: false
  property bool showCheck: false
  property bool on: false

  readonly property color dangerColor: "#ff7b7b"

  leftPadding: separator ? 6 : 12
  rightPadding: separator ? 6 : 12
  topPadding: separator ? 5 : 8
  bottomPadding: separator ? 5 : 8
  spacing: 10
  enabled: !separator
  implicitWidth: leftPadding + rightPadding + (separator ? 0 : contentItem.implicitWidth)
  implicitHeight: topPadding + bottomPadding + (separator ? 1 : contentItem.implicitHeight)
  opacity: enabled || separator ? 1 : 0.4

  Rectangle {  // the dividing line of a separator row
    visible: control.separator
    x: control.leftPadding
    y: control.topPadding
    width: control.width - control.leftPadding - control.rightPadding
    height: 1
    color: ThemeBridge.border
  }

  contentItem: RowLayout {
    visible: !control.separator
    spacing: control.spacing
    Item {  // the check mark column
      visible: control.showCheck
      Layout.preferredWidth: 14
      Layout.preferredHeight: 14
      Icon {
        anchors.centerIn: parent
        visible: control.on
        name: "check"
        size: 14
        lineWidth: 2.2
        color: ThemeBridge.accentColor
      }
    }
    Text {
      Layout.fillWidth: true
      text: control.text
      color: control.danger ? control.dangerColor : ThemeBridge.text
      font.pixelSize: 15
      font.weight: Font.Medium
      elide: Text.ElideRight
    }
    Text {
      visible: control.hint !== ""
      Layout.leftMargin: 14
      text: control.hint
      color: ThemeBridge.textDim
      font.pixelSize: 13
    }
  }

  background: Rectangle {
    radius: 7
    color: !control.highlighted || !control.enabled || control.separator ? "transparent"
           : control.danger ? Qt.rgba(1, 0.36, 0.36, 0.22)
           : Qt.rgba(ThemeBridge.accentColor.r, ThemeBridge.accentColor.g, ThemeBridge.accentColor.b, 0.24)
    Behavior on color { ColorAnimation { duration: ThemeBridge.fastMs } }
  }
}
