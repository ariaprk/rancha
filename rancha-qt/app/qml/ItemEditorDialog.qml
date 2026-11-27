import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts
import Rancha

// The form for adding a new item or editing an existing one. Port of the Electron app's ItemDialog.tsx.
// Saving goes through LibraryModel.saveItem (ItemRepository in the core); pictures go through CropDialog.
// Online artwork search arrives with R8.
Popup {
  id: root
  modal: true
  focus: true
  closePolicy: busy ? Popup.NoAutoClose : Popup.CloseOnEscape
  anchors.centerIn: Overlay.overlay
  width: Math.min(700, Overlay.overlay ? Overlay.overlay.width - 40 : 700)
  height: Math.min(760, Overlay.overlay ? Overlay.overlay.height - 40 : 760)
  padding: 20

  // ---- the item being edited (a copy of LibraryModel.itemById / newItemDefaults)
  property var original: null       // null = a new item
  property string kind: "collection"
  property bool rom: false          // adding a console game
  property string parentId: ""
  property string itemName: ""
  property string description: ""
  property string target: ""
  property string tagsText: ""
  property int hue: 0
  property string coverFile: ""
  property string coverUrl: ""
  property string wallpaperFile: ""
  property string wallpaperUrl: ""
  property string emulator: ""
  property string core: ""
  property var profiles: []
  property bool busy: false
  property string error: ""
  property string missing: ""      // "emulator" | "core" | ""

  readonly property bool isCollection: kind === "collection"
  readonly property bool hasWallpaper: LibraryModel.hasWallpaper(kind, parentId)
  readonly property bool canEmulate: hasWallpaper || rom
  readonly property var selectedProfile: profiles.find(p => p.id === emulator) || null
  readonly property bool isRetroArch: selectedProfile !== null && selectedProfile.retroarch === true
  readonly property var face: LibraryModel.placeholder(hue, itemName.trim() === "" ? "Untitled" : itemName.trim())

  function loadFrom(map) {
    kind = map.kind
    parentId = map.parentId || ""
    itemName = map.name || ""
    description = map.description || ""
    target = map.target || ""
    tagsText = (map.tags || []).join(", ")
    hue = map.hue
    coverFile = map.coverFile || ""
    coverUrl = map.coverUrl || ""
    wallpaperFile = map.wallpaperFile || ""
    wallpaperUrl = map.wallpaperUrl || ""
    emulator = map.emulator || ""
    core = map.core || ""
    profiles = LibraryModel.emulatorProfiles()
    error = ""
    missing = ""
    busy = false
  }
  // A new item of this kind in the open folder (Home on the flat pages).
  function create(newKind, asRom) {
    original = null
    rom = asRom === true
    loadFrom(LibraryModel.newItemDefaults(newKind))
    open()
    nameField.forceActiveFocus()
  }
  function edit(id) {
    const map = LibraryModel.itemById(id)
    if (!map.id) return
    original = map
    rom = false
    loadFrom(map)
    open()
    nameField.forceActiveFocus()
  }

  function splitTags(text) { return text.split(",").map(t => t.trim()).filter(t => t !== "") }

  function save() {
    if (itemName.trim() === "") { error = "Please enter a name."; return }
    // A console game never gets an emulator by default: the user must choose it.
    if (rom && emulator === "") {
      missing = "emulator"
      error = profiles.length === 0 ? "There is no emulator yet. Add one in Settings > Emulators, then choose it here."
                                     : "Choose the emulator that runs this game."
      return
    }
    if (rom && isRetroArch && core.trim() === "") { missing = "core"; error = "Choose the RetroArch core that runs this game."; return }
    const data = {
      kind: kind,
      parentId: parentId,
      name: itemName.trim(),
      description: description.trim().slice(0, 5000),
      target: isCollection ? "" : target.trim(),
      tags: splitTags(tagsText),
      hue: hue,
      coverFile: coverFile,
      // fields this item cannot show keep what they had
      wallpaperFile: hasWallpaper ? wallpaperFile : (original ? (original.wallpaperFile || "") : ""),
      emulator: canEmulate ? emulator : (original ? (original.emulator || "") : ""),
      core: canEmulate ? (emulator !== "" && isRetroArch ? core.trim() : "") : (original ? (original.core || "") : "")
    }
    if (original) data.id = original.id
    busy = true
    error = ""
    const problem = LibraryModel.saveItem(data)
    busy = false
    if (problem !== "") { error = problem; return }
    close()
  }

  // ---- pictures: chosen, pasted or dropped, then cropped
  function takePicture(picture, shape) {
    if (!picture.ok) { error = picture.error; return }
    error = ""
    cropper.start(picture, shape)
  }
  CropDialog {
    id: cropper
    onDone: (file, url) => {
      if (shape === "wallpaper") { root.wallpaperFile = file; root.wallpaperUrl = url }
      else { root.coverFile = file; root.coverUrl = url }
    }
  }
  property string pictureShape: "cover"
  FileDialog {
    id: picturePicker
    title: "Choose a picture"
    nameFilters: LibraryModel.pictureFilters()
    onAccepted: root.takePicture(LibraryModel.openPicture(selectedFile), root.pictureShape)
  }
  FileDialog {
    id: targetPicker
    title: "Choose a file"
    nameFilters: LibraryModel.fileFilters(root.kind, root.rom || root.emulator !== "")
    onAccepted: root.useTarget(LibraryModel.localPath(selectedFile), false)
  }
  FolderDialog {
    id: targetFolderPicker
    title: "Choose a folder"
    onAccepted: root.useTarget(LibraryModel.localPath(selectedFolder), true)
  }
  function useTarget(path, folder) {
    if (path === "") return
    target = path
    if (itemName.trim() === "") itemName = LibraryModel.suggestName(path, folder, rom || emulator !== "")
  }

  // Ctrl+V: a picture on the clipboard becomes the cover; ordinary text pasting is left alone.
  Shortcut {
    sequences: [StandardKey.Paste]  // every Paste key of the system (Ctrl+V, Shift+Insert)
    enabled: root.opened && !cropper.opened
    onActivated: if (LibraryModel.clipboardHasPicture()) root.takePicture(LibraryModel.pastePicture(), "cover")
  }

  background: Rectangle { radius: ThemeBridge.radius; color: ThemeBridge.surface; border.color: ThemeBridge.border }
  Overlay.modal: Rectangle { color: Qt.rgba(0, 0, 0, 0.45) }

  component FieldLabel: Text { color: ThemeBridge.text; font.pixelSize: 13; font.weight: Font.DemiBold }
  component Hint: Text { color: ThemeBridge.textDim; font.pixelSize: 12; wrapMode: Text.WordWrap; Layout.fillWidth: true }
  component Field: TextField {
    signal picturePasted(var picture)
    color: ThemeBridge.text
    font.pixelSize: 13
    placeholderTextColor: ThemeBridge.textDim
    Layout.fillWidth: true
    // Ctrl+V with a picture on the clipboard: the picture becomes the cover; ordinary text pasting is left alone.
    Keys.onPressed: (event) => {
      if (event.matches(StandardKey.Paste) && LibraryModel.clipboardHasPicture()) {
        picturePasted(LibraryModel.pastePicture())
        event.accepted = true
      }
    }
  }

  contentItem: ColumnLayout {
    spacing: 10
    Text {
      text: root.original ? "Edit “" + root.original.name + "”"
            : root.rom ? "Add a console game (ROM)"
            : root.kind === "launchable" ? "Add a PC game or app"
            : root.kind === "collection" ? "New collection"
            : root.kind === "video" ? "Add a video"
            : root.kind === "readable" ? "Add a comic, manga or PDF" : "Add a music file"
      color: ThemeBridge.text
      font.family: ThemeBridge.fontBold
      font.weight: Font.Bold
      font.pixelSize: 18
      elide: Text.ElideRight
      Layout.fillWidth: true
    }

    RowLayout {
      Layout.fillWidth: true
      Layout.fillHeight: true
      spacing: 18

      // ---- the cover
      ColumnLayout {
        Layout.alignment: Qt.AlignTop
        Layout.preferredWidth: 160
        spacing: 6
        Rectangle {
          implicitWidth: 160
          implicitHeight: 240
          radius: ThemeBridge.radius
          clip: true
          border.width: coverDrop.containsDrag ? 2 : 0
          border.color: ThemeBridge.accentColor
          gradient: Gradient {
            GradientStop { position: 0; color: root.face.top }
            GradientStop { position: 1; color: root.face.bottom }
          }
          Text {
            anchors.centerIn: parent
            visible: root.coverUrl === ""
            text: root.face.initials
            color: Qt.rgba(1, 1, 1, 0.92)
            font.family: ThemeBridge.fontBold
            font.weight: Font.Bold
            font.pixelSize: 28
          }
          Image {
            anchors.fill: parent
            visible: root.coverUrl !== ""
            source: root.coverUrl
            fillMode: Image.PreserveAspectCrop
            asynchronous: true
          }
          DropArea {
            id: coverDrop
            anchors.fill: parent
            onDropped: (drop) => {
              if (drop.hasUrls) root.takePicture(LibraryModel.openPicture(drop.urls[0]), "cover")
              else root.error = "Drop a picture file (PNG, JPG, WebP…) here."
            }
          }
        }
        Button { Layout.fillWidth: true; text: "Choose image…"; onClicked: { root.pictureShape = "cover"; picturePicker.open() } }
        Hint { text: "or paste (Ctrl+V) / drop a picture on the cover" }
        Button { Layout.fillWidth: true; visible: root.coverFile !== ""; text: "Remove image"; onClicked: { root.coverFile = ""; root.coverUrl = "" } }
        RowLayout {
          visible: root.coverFile === ""
          Layout.fillWidth: true
          Hint { text: "Color"; Layout.fillWidth: false }
          Slider { Layout.fillWidth: true; from: 0; to: 359; stepSize: 1; value: root.hue; onMoved: root.hue = Math.round(value) }
        }
      }

      // ---- the fields
      ScrollView {
        id: fieldsScroll
        Layout.fillWidth: true
        Layout.fillHeight: true
        contentWidth: availableWidth
        clip: true
        ColumnLayout {
          width: fieldsScroll.availableWidth
          spacing: 6
          Hint { text: LibraryModel.kindLabel(root.kind) }

          FieldLabel { text: "Name" }
          Field {
            id: nameField
            maximumLength: 200
            text: root.itemName
            onTextEdited: root.itemName = text
            onAccepted: root.save()
            onPicturePasted: (picture) => root.takePicture(picture, "cover")
          }

          FieldLabel { visible: !root.isCollection; text: "Location"; Layout.topMargin: 6 }
          RowLayout {
            visible: !root.isCollection
            Layout.fillWidth: true
            Field {
              text: root.target
              onTextEdited: root.target = text
              onPicturePasted: (picture) => root.takePicture(picture, "cover")
              placeholderText: root.rom ? "/home/you/ROMs/SNES/game.sfc"
                               : root.kind === "launchable" ? "/home/you/Games/MyGame/start.sh"
                               : root.kind === "video" ? "/home/you/Videos/episode01.mkv"
                               : root.kind === "readable" ? "/home/you/Comics/volume1.cbz  (or a folder of images)"
                               : "/home/you/Music/song.mp3"
            }
            Button { text: "Browse…"; onClicked: targetPicker.open() }
            Button {
              visible: root.rom || root.emulator !== "" || root.kind === "readable"
              text: root.kind === "readable" ? "Folder…" : "Choose folder…"
              onClicked: targetFolderPicker.open()
            }
          }
          Hint { visible: !root.isCollection; text: "Your file stays where it is; the library only remembers its location." }

          FieldLabel { visible: root.canEmulate && !root.isCollection; text: root.rom ? "Emulator" : "Run with"; Layout.topMargin: 6 }
          RowLayout {
            visible: root.canEmulate && !root.isCollection
            Layout.fillWidth: true
            ComboBox {
              Layout.fillWidth: true
              textRole: "name"
              valueRole: "id"
              model: [{ id: "", name: root.rom ? "Choose an emulator…" : "Run the file directly (a PC game)" }]
                     .concat(root.profiles)
                     .concat(root.emulator !== "" && root.selectedProfile === null ? [{ id: root.emulator, name: "(removed emulator)" }] : [])
              currentIndex: Math.max(0, indexOfValue(root.emulator))
              onActivated: { root.emulator = currentValue; root.core = ""; root.missing = "" }
            }
            Field {
              visible: root.isRetroArch
              Layout.preferredWidth: 180
              placeholderText: "core, e.g. snes9x_libretro"
              text: root.core
              onTextEdited: { root.core = text; root.missing = "" }
            }
          }
          Text {
            visible: root.missing !== ""
            text: root.missing === "emulator" ? "! Required: choose an emulator" : "! Required: choose a core"
            color: "#ffb454"
            font.pixelSize: 12
          }
          Hint {
            visible: root.canEmulate && !root.isCollection
            text: root.profiles.length === 0 ? "For ROMs (Nintendo, PlayStation…): add an emulator first in Settings > Emulators."
                                             : "Choose the emulator for a ROM file."
          }

          FieldLabel { text: "Description"; Layout.topMargin: 6 }
          TextArea {
            Layout.fillWidth: true
            Layout.preferredHeight: 80
            wrapMode: TextEdit.Wrap
            color: ThemeBridge.text
            font.pixelSize: 13
            text: root.description
            onTextChanged: root.description = text
          }

          FieldLabel { visible: root.hasWallpaper; text: "Wallpaper"; Layout.topMargin: 6 }
          Rectangle {
            visible: root.hasWallpaper
            Layout.fillWidth: true
            Layout.preferredHeight: width * 9 / 16
            radius: ThemeBridge.radiusSmall
            color: ThemeBridge.surface2
            clip: true
            border.width: wallpaperDrop.containsDrag ? 2 : 1
            border.color: wallpaperDrop.containsDrag ? ThemeBridge.accentColor : ThemeBridge.border
            Image { anchors.fill: parent; visible: root.wallpaperUrl !== ""; source: root.wallpaperUrl; fillMode: Image.PreserveAspectCrop; asynchronous: true }
            Hint {
              anchors.centerIn: parent
              width: parent.width - 20
              horizontalAlignment: Text.AlignHCenter
              visible: root.wallpaperUrl === ""
              text: "No wallpaper. The game screen blurs the cover instead."
            }
            DropArea {
              id: wallpaperDrop
              anchors.fill: parent
              onDropped: (drop) => {
                if (drop.hasUrls) root.takePicture(LibraryModel.openPicture(drop.urls[0]), "wallpaper")
                else root.error = "Drop a picture file (PNG, JPG, WebP…) here."
              }
            }
          }
          RowLayout {
            visible: root.hasWallpaper
            Button { text: "Choose image…"; onClicked: { root.pictureShape = "wallpaper"; picturePicker.open() } }
            Button { visible: root.wallpaperFile !== ""; text: "Remove wallpaper"; onClicked: { root.wallpaperFile = ""; root.wallpaperUrl = "" } }
          }
          Hint {
            visible: root.hasWallpaper
            text: "Shown full-screen when you double-click the game. Drop a picture on the box above, or use a 16:9 picture for the best fit."
          }

          FieldLabel { text: "Tags"; Layout.topMargin: 6 }
          Field { text: root.tagsText; onTextEdited: root.tagsText = text; placeholderText: "rpg, co-op, favorite series"; onAccepted: root.save(); onPicturePasted: (picture) => root.takePicture(picture, "cover") }
          Hint { text: "Separate tags with commas." }
        }
      }
    }

    Text { visible: root.error !== ""; text: root.error; color: "#ff6b6b"; font.pixelSize: 13; wrapMode: Text.WordWrap; Layout.fillWidth: true }
    RowLayout {
      Layout.fillWidth: true
      Item { Layout.fillWidth: true }
      Button { text: "Cancel"; enabled: !root.busy; onClicked: root.close() }
      Button { text: root.busy ? "Saving…" : root.original ? "Save" : "Add"; enabled: !root.busy; highlighted: true; onClicked: root.save() }
    }
  }
}
