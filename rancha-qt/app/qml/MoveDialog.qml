import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Rancha

// "Move to…": pick a destination among the collections. The items themselves (and everything inside them) are left
// out, because an item cannot be moved into itself. Port of the Electron app's MoveDialog.tsx.
Popup {
  id: root
  modal: true
  focus: true
  closePolicy: busy ? Popup.NoAutoClose : Popup.CloseOnEscape
  anchors.centerIn: Overlay.overlay
  width: 480
  height: Math.min(560, Overlay.overlay ? Overlay.overlay.height - 40 : 560)
  padding: 20

  property var ids: []
  property var targets: []       // [{id, name, depth, current}]
  property var choice: undefined // undefined = nothing chosen yet; "" = Home
  property string heading: ""
  property bool busy: false
  property string error: ""

  function start(itemIds) {
    ids = LibraryModel.deletable(itemIds)  // the main sections stay where they are
    if (ids.length === 0) return
    targets = LibraryModel.moveTargets(ids)
    heading = ids.length === 1 ? "Move “" + LibraryModel.itemById(ids[0]).name + "” to…" : "Move " + ids.length + " items to…"
    choice = undefined
    error = ""
    busy = false
    open()
  }
  // Moving needs a destination where at least one of the items is not already.
  readonly property bool canMove: choice !== undefined && !(targets.find(t => t.id === choice) || {}).current

  background: Rectangle { radius: ThemeBridge.radius; color: ThemeBridge.surface; border.color: ThemeBridge.border }
  Overlay.modal: Rectangle { color: Qt.rgba(0, 0, 0, 0.45) }

  contentItem: ColumnLayout {
    spacing: 10
    Text {
      text: root.heading
      color: ThemeBridge.text
      font.family: ThemeBridge.fontBold
      font.weight: Font.Bold
      font.pixelSize: 18
      elide: Text.ElideRight
      Layout.fillWidth: true
    }
    ListView {
      id: list
      Layout.fillWidth: true
      Layout.fillHeight: true
      clip: true
      boundsBehavior: Flickable.StopAtBounds
      model: root.targets
      ScrollBar.vertical: ScrollBar {}
      delegate: Rectangle {
        required property var modelData
        width: list.width - 10
        height: 34
        radius: ThemeBridge.radiusSmall
        readonly property bool chosen: root.choice === modelData.id
        color: chosen ? Qt.rgba(ThemeBridge.accentColor.r, ThemeBridge.accentColor.g, ThemeBridge.accentColor.b, 0.25)
               : rowArea.containsMouse ? Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, 0.06) : "transparent"
        RowLayout {
          anchors.fill: parent
          anchors.leftMargin: 12 + modelData.depth * 20
          anchors.rightMargin: 10
          spacing: 8
          Icon { name: modelData.id === "" ? "home" : "folder"; size: 16; color: ThemeBridge.textDim }
          Text {
            Layout.fillWidth: true
            text: modelData.id === "" ? "Home (top level)" : modelData.name
            color: ThemeBridge.text
            font.pixelSize: 13
            elide: Text.ElideRight
          }
          Text { visible: modelData.current; text: "current location"; color: ThemeBridge.textDim; font.pixelSize: 11 }
        }
        MouseArea {
          id: rowArea
          anchors.fill: parent
          hoverEnabled: true
          onClicked: root.choice = modelData.id
          onDoubleClicked: { root.choice = modelData.id; if (root.canMove) root.move() }
        }
      }
    }
    Text { visible: root.error !== ""; text: root.error; color: "#ff6b6b"; font.pixelSize: 13; wrapMode: Text.WordWrap; Layout.fillWidth: true }
    RowLayout {
      Layout.fillWidth: true
      Item { Layout.fillWidth: true }
      Button { text: "Cancel"; enabled: !root.busy; onClicked: root.close() }
      Button { text: root.busy ? "Moving…" : "Move here"; enabled: root.canMove && !root.busy; highlighted: true; onClicked: root.move() }
    }
  }

  function move() {
    busy = true
    const problem = LibraryModel.moveItems(ids, choice)
    busy = false
    if (problem !== "") { error = problem; return }
    LibraryModel.clearSelection()
    close()
  }
}
