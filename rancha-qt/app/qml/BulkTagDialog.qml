import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Rancha

// Add a tag to, or remove a tag from, all the selected items at once. Add: every tag in the library is offered.
// Remove: the tags the selected items have. Port of the Electron app's BulkTagDialog.tsx.
Popup {
  id: root
  modal: true
  focus: true
  closePolicy: busy ? Popup.NoAutoClose : Popup.CloseOnEscape
  anchors.centerIn: Overlay.overlay
  width: 460
  padding: 20

  property var ids: []
  property string mode: "add"   // add | remove
  property var tags: []         // [{tag, count}]
  property bool busy: false
  property string error: ""
  readonly property string tag: field.text.trim().replace(/\s+/g, " ")
  readonly property string verb: mode === "add" ? "Add" : "Remove"

  function start(itemIds, tagMode) {
    ids = itemIds
    mode = tagMode
    tags = (mode === "add" ? LibraryModel.allTags : LibraryModel.tagsOf(itemIds)).slice(0, 60)
    field.text = ""
    error = ""
    busy = false
    open()
    field.forceActiveFocus()
  }
  function apply() {
    if (tag === "" || busy) return
    busy = true
    const problem = LibraryModel.changeTag(ids, tag, mode === "add")
    busy = false
    if (problem !== "") { error = problem; return }
    close()
  }

  background: Rectangle { radius: ThemeBridge.radius; color: ThemeBridge.surface; border.color: ThemeBridge.border }
  Overlay.modal: Rectangle { color: Qt.rgba(0, 0, 0, 0.45) }

  contentItem: ColumnLayout {
    spacing: 10
    Text {
      text: root.verb + " a tag " + (root.mode === "add" ? "to " : "from ") + root.ids.length + (root.ids.length === 1 ? " item" : " items")
      color: ThemeBridge.text
      font.family: ThemeBridge.fontBold
      font.weight: Font.Bold
      font.pixelSize: 18
    }
    TextField {
      id: field
      Layout.fillWidth: true
      maximumLength: 40
      color: ThemeBridge.text
      font.pixelSize: 13
      placeholderTextColor: ThemeBridge.textDim
      placeholderText: root.mode === "add" ? "Type a tag, e.g. action" : "Type or pick the tag to remove"
      onAccepted: root.apply()
    }
    Flow {
      Layout.fillWidth: true
      spacing: 6
      Repeater {
        model: root.tags
        delegate: Chip {
          required property var modelData
          label: modelData.tag + "  " + modelData.count
          selected: modelData.tag.toLowerCase() === root.tag.toLowerCase()
          onClicked: field.text = modelData.tag
        }
      }
    }
    Text {
      visible: root.mode === "remove" && root.tags.length === 0
      text: "The selected items have no tags."
      color: ThemeBridge.textDim
      font.pixelSize: 12
    }
    Text { visible: root.error !== ""; text: root.error; color: "#ff6b6b"; font.pixelSize: 13; wrapMode: Text.WordWrap; Layout.fillWidth: true }
    RowLayout {
      Layout.fillWidth: true
      Item { Layout.fillWidth: true }
      Button { text: "Cancel"; enabled: !root.busy; onClicked: root.close() }
      Button { text: root.busy ? "Working…" : root.verb + " tag"; enabled: !root.busy && root.tag !== ""; highlighted: true; onClicked: root.apply() }
    }
  }
}
