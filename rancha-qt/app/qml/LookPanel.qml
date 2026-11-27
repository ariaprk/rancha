import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Rancha

// Temporary panel for the look settings (opened from "Settings"). The real Settings page comes with Q7.
Popup {
  id: root
  modal: false
  focus: true
  closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
  padding: 16
  width: 420

  background: Rectangle {
    radius: ThemeBridge.radius
    color: ThemeBridge.surface
    border.color: ThemeBridge.border
  }

  component Caption: Text { color: ThemeBridge.textDim; font.pixelSize: 12; Layout.topMargin: 8 }

  contentItem: ColumnLayout {
    spacing: 6
    Text { text: "Look"; color: ThemeBridge.text; font.family: ThemeBridge.fontBold; font.weight: Font.Bold; font.pixelSize: 18 }

    Caption { text: "Theme" }
    Flow {
      Layout.fillWidth: true
      spacing: 6
      Repeater {
        model: ["dark", "light", "airy"]
        delegate: Chip { required property string modelData; label: modelData; selected: ThemeBridge.mode === modelData; onClicked: ThemeBridge.mode = modelData }
      }
    }

    Caption { text: "Accent color" }
    Flow {
      Layout.fillWidth: true
      spacing: 8
      Repeater {
        model: ThemeBridge.accentPresets()
        delegate: Rectangle {
          required property var modelData
          width: 26; height: 26; radius: 13
          gradient: Gradient {
            GradientStop { position: 0; color: modelData.from }
            GradientStop { position: 1; color: modelData.to }
          }
          border.width: ThemeBridge.accent === modelData.main ? 2 : 0
          border.color: ThemeBridge.text
          MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: ThemeBridge.accent = modelData.main }
        }
      }
    }

    Caption { text: "Corners" }
    Flow {
      Layout.fillWidth: true
      spacing: 6
      Repeater {
        model: ["sharp", "soft", "round"]
        delegate: Chip { required property string modelData; label: modelData; selected: ThemeBridge.corners === modelData; onClicked: ThemeBridge.corners = modelData }
      }
    }

    Caption { text: "Frosted glass (blur comes later)" }
    Flow {
      Layout.fillWidth: true
      spacing: 6
      Repeater {
        model: ["off", "normal", "strong"]
        delegate: Chip { required property string modelData; label: modelData; selected: ThemeBridge.glass === modelData; onClicked: ThemeBridge.glass = modelData }
      }
    }

    Caption { text: "Motion" }
    Flow {
      Layout.fillWidth: true
      spacing: 6
      Repeater {
        model: ["full", "subtle", "off"]
        delegate: Chip { required property string modelData; label: modelData; selected: ThemeBridge.motion === modelData; onClicked: ThemeBridge.motion = modelData }
      }
    }

    Caption { text: "Background glow" }
    Flow {
      Layout.fillWidth: true
      spacing: 6
      Chip { label: "on"; selected: ThemeBridge.ambientGlow; onClicked: ThemeBridge.ambientGlow = true }
      Chip { label: "off"; selected: !ThemeBridge.ambientGlow; onClicked: ThemeBridge.ambientGlow = false }
    }
  }
}
