import QtQuick
import QtQuick.Controls
import Rancha

// The thin dividing line of an RMenu (the Electron app's .menu-separator: 1 px, 5 px above and below, 6 px in from the sides).
MenuSeparator {
  topPadding: 5
  bottomPadding: 5
  leftPadding: 6
  rightPadding: 6
  contentItem: Rectangle {
    implicitHeight: 1
    color: ThemeBridge.border
  }
}
