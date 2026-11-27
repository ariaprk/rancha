import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts
import Rancha

ApplicationWindow {
  id: window
  width: 1280
  height: 800
  minimumWidth: 760
  minimumHeight: 480
  visible: true
  title: "Rancha"
  color: ThemeBridge.bg

  property string viewMode: "covers"   // covers | compact | list
  property real cardWidth: 190          // wanted width of a card in "covers" view

  Behavior on color { ColorAnimation { duration: ThemeBridge.medMs } }
  // Coming back to the window (maybe after plugging a drive in or moving a file) checks again which files exist.
  onActiveChanged: if (active) LibraryModel.checkMissing()

  // Back / forward with Alt+Left / Alt+Right and the mouse's side buttons (as in the Electron app).
  // Inside the search box Alt+arrows stay with the text field.
  Shortcut { sequence: "Alt+Left"; enabled: !gameScreen.visible && !(window.activeFocusItem instanceof TextInput); onActivated: LibraryModel.back() }
  Shortcut { sequence: "Alt+Right"; enabled: !gameScreen.visible && !(window.activeFocusItem instanceof TextInput); onActivated: LibraryModel.forward() }
  MouseArea {
    anchors.fill: parent
    z: 1000
    acceptedButtons: Qt.BackButton | Qt.ForwardButton
    onClicked: (mouse) => mouse.button === Qt.BackButton ? LibraryModel.back() : LibraryModel.forward()
  }

  // soft light and shade behind everything (values come from the core)
  Rectangle {
    anchors.fill: parent
    gradient: Gradient {
      GradientStop { position: 0.0; color: ThemeBridge.lightCenter }
      GradientStop { position: 1.0; color: ThemeBridge.shadeBottom }
    }
  }
  Rectangle {  // accent glow at the top
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    height: parent.height * 0.5
    visible: ThemeBridge.ambientStrength > 0
    gradient: Gradient {
      GradientStop { position: 0.0; color: Qt.rgba(ThemeBridge.accentColor.r, ThemeBridge.accentColor.g, ThemeBridge.accentColor.b, ThemeBridge.ambientStrength) }
      GradientStop { position: 1.0; color: "transparent" }
    }
  }

  LookPanel {
    id: lookPanel
    parent: Overlay.overlay
    x: sidebar.width + 12
    y: window.height - height - 20
  }

  ContentTypeDialog { id: contentDialog }  // "What are you adding?", then the folder picker
  FolderImportDialog {}                    // opens by itself while LibraryModel.folderImport is active
  ItemEditorDialog { id: editor }
  MoveDialog { id: moveDialog }
  DeleteDialog { id: deleteDialog }
  BulkTagDialog { id: tagDialog }
  ItemMenu {
    id: itemMenu
    onEditRequested: (id) => editor.edit(id)
    onMoveRequested: (ids) => moveDialog.start(ids)
    onDeleteRequested: (ids) => deleteDialog.start(ids)
    onTagRequested: (ids, mode) => tagDialog.start(ids, mode)
    onLaunchRequested: (id) => LibraryModel.launch(id)
    onLocateRequested: (id, folder) => {
      if (folder) {
        locateFolder.itemId = id
        locateFolder.open()
        return
      }
      const item = LibraryModel.itemById(id)
      locateFile.itemId = id
      locateFile.nameFilters = LibraryModel.fileFilters(item.kind, (item.emulator || "") !== "")
      locateFile.open()
    }
  }
  FileDialog {  // "Locate file…": the new place of a missing item
    id: locateFile
    property string itemId: ""
    title: "Locate the file"
    fileMode: FileDialog.OpenFile
    onAccepted: LibraryModel.relocate(itemId, selectedFile)
  }
  FolderDialog {  // "Locate folder…" (a comic or book made of pictures)
    id: locateFolder
    property string itemId: ""
    title: "Locate the folder"
    onAccepted: LibraryModel.relocate(itemId, selectedFolder)
  }
  FileDialog {
    id: filesPicker
    title: "Choose the files to add"
    fileMode: FileDialog.OpenFiles
    nameFilters: LibraryModel.fileFilters("", false)
    onAccepted: LibraryModel.addFiles(selectedFiles)
  }
  Connections {
    target: LibraryModel
    function onFoldersToScan(paths) { contentDialog.askFor(paths) }
    function onRevealRow(row) { grid.positionViewAtIndex(row, GridView.Contain); list.positionViewAtIndex(row, ListView.Contain) }
    function onGameScreenRequested(id) { gameScreen.openFor(id) }
  }

  // Keys of the library (not while typing in a text field or while a dialog is open).
  readonly property bool libraryKeys: !gameScreen.visible && !(window.activeFocusItem instanceof TextInput) && !editor.opened && !moveDialog.opened
                                      && !deleteDialog.opened && !tagDialog.opened && !contentDialog.opened
  readonly property string singleId: LibraryModel.selectedCount === 1 ? LibraryModel.selectedIds[0] : ""
  Shortcut { sequence: "Ctrl+A"; enabled: window.libraryKeys; onActivated: LibraryModel.selectAllShown() }
  Shortcut { sequence: "Esc"; enabled: window.libraryKeys && LibraryModel.selectedCount > 0 && !reorderDrag.active; onActivated: LibraryModel.clearSelection() }
  Shortcut { sequence: "F2"; enabled: window.libraryKeys && window.singleId !== ""; onActivated: editor.edit(window.singleId) }
  Shortcut {
    sequence: "Del"
    enabled: window.libraryKeys && LibraryModel.selectedCount > 0
    onActivated: deleteDialog.start(LibraryModel.selectedIds)
  }
  Shortcut {
    sequences: ["Return", "Enter"]
    enabled: window.libraryKeys && window.singleId !== ""
    onActivated: { const row = LibraryModel.rowOf(window.singleId); if (row >= 0) LibraryModel.openRow(row) }
  }

  // a short message after a change ("Added 3 items in 1 collection."), gone after a few seconds
  Rectangle {
    id: toast
    parent: Overlay.overlay
    z: 10
    anchors.horizontalCenter: parent.horizontalCenter
    anchors.bottom: parent.bottom
    anchors.bottomMargin: 24
    visible: LibraryModel.status !== ""
    width: Math.min(toastText.implicitWidth + 36, window.width - 40)
    height: toastText.implicitHeight + 20
    radius: ThemeBridge.radiusSmall
    color: ThemeBridge.surface2
    border.color: ThemeBridge.border
    Text { id: toastText; anchors.centerIn: parent; width: parent.width - 36; text: LibraryModel.status; color: ThemeBridge.text; font.pixelSize: 13; wrapMode: Text.WordWrap; horizontalAlignment: Text.AlignHCenter }
    MouseArea { anchors.fill: parent; onClicked: LibraryModel.clearStatus() }
    Timer { running: toast.visible; interval: 5000; onTriggered: LibraryModel.clearStatus() }
  }

  // Files and folders dragged in from the file manager are added to the open folder (Home on the flat pages is
  // refused, as in the Electron app). Dialogs handle their own drops (a picture onto a cover), so a drop is not taken
  // while one is open. Folders go through "What are you adding?" and the preview, files are added at once.
  readonly property bool dialogOpen: editor.opened || moveDialog.opened || deleteDialog.opened || tagDialog.opened
                                     || contentDialog.opened || LibraryModel.folderImport.active || gameScreen.visible
  DropArea {
    id: fileDrop
    anchors.fill: parent
    z: 999
    enabled: !window.dialogOpen
    keys: ["text/uri-list"]
    onEntered: (drag) => { if (!drag.hasUrls) drag.accepted = false }
    onDropped: (drop) => {
      if (!drop.hasUrls) return
      if (!LibraryModel.canAdd) {
        LibraryModel.showStatus("Open Home or a collection first, then drop the files there.")
        return
      }
      drop.acceptProposedAction()
      LibraryModel.addFiles(drop.urls)
    }
  }
  Rectangle {  // the Electron .drop-overlay: the window dimmed, a dashed accent card in the middle
    parent: Overlay.overlay
    anchors.fill: parent
    z: 5
    visible: opacity > 0
    opacity: fileDrop.containsDrag ? 1 : 0
    Behavior on opacity { NumberAnimation { duration: ThemeBridge.medMs; easing.type: Easing.OutCubic } }
    color: Qt.rgba(ThemeBridge.bg.r, ThemeBridge.bg.g, ThemeBridge.bg.b, 0.55)
    Rectangle {
      anchors.centerIn: parent
      width: dropText.implicitWidth + 80
      height: dropText.implicitHeight + 56
      radius: 18
      color: ThemeBridge.glassColor
      border.width: 2
      border.color: ThemeBridge.accentColor
      Text {
        id: dropText
        anchors.centerIn: parent
        text: LibraryModel.canAdd ? "Drop files to add them to “" + LibraryModel.folderName + "”"
                                  : "Open Home or a collection first, then drop the files there"
        color: ThemeBridge.text
        font.family: ThemeBridge.fontBold
        font.weight: Font.DemiBold
        font.pixelSize: 18
      }
    }
  }

  // DRAG-TO-REORDER (the Electron reorderDrag.ts, simplified): pressing on a card and moving 6 px lifts it; a ghost
  // follows the pointer and an accent bar shows where it will land (before / after the card under the pointer).
  // Holding it over the middle of a folder for half a second lights the folder up: letting go then moves it inside.
  // The selection travels together when the pressed item is part of it. Near the top / bottom edge the view scrolls.
  // Esc cancels. Only in Custom order inside a folder (LibraryModel.canReorder), like the Electron app.
  Item {
    id: reorderDrag
    anchors.fill: parent
    z: 900
    enabled: false  // never takes the mouse; the pressed card keeps it

    property bool active: false
    property var ids: []
    property string label: ""
    property real px: 0
    property real py: 0
    property int targetRow: -1   // place before / after this row
    property bool after: false
    property int hotRow: -1      // the folder under the pointer
    property bool hotReady: false

    readonly property var view: window.viewMode === "list" ? list : grid

    function start(row, x, y) {
      if (!LibraryModel.canReorder()) return
      const item = LibraryModel.itemAt(row)
      if (!item.id) return
      ids = LibraryModel.dragGroup(item.id)
      label = ids.length > 1 ? ids.length + " items" : item.name
      active = true
      move(x, y)
    }
    function move(x, y) {
      if (!active) return
      px = x
      py = y
      update()
    }
    function update() {
      const v = view
      const p = v.mapFromItem(null, px, py)
      let row = -1, folder = false, isAfter = false
      if (p.x >= 0 && p.y >= 0 && p.x <= v.width && p.y <= v.height) {
        const cx = p.x + v.contentX, cy = p.y + v.contentY
        row = v.indexAt(cx, cy)
        if (row >= 0) {
          const d = v.itemAt(cx, cy)
          const item = LibraryModel.itemAt(row)
          const fx = (cx - d.x) / d.width, fy = (cy - d.y) / d.height
          if (ids.indexOf(item.id) >= 0) row = -1  // over itself: nothing changes
          else if (item.isFolder && (window.viewMode === "list" ? fy > 0.25 && fy < 0.75 : fx > 0.25 && fx < 0.75)) folder = true
          else isAfter = window.viewMode === "list" ? fy > 0.5 : fx > 0.5
        } else if (v.count > 0) {
          row = v.count - 1  // the empty space after the last item: put it last
          isAfter = true
          if (ids.indexOf(LibraryModel.itemAt(row).id) >= 0) row = -1
        }
      }
      if (folder) {
        if (hotRow !== row) { hotRow = row; hotReady = false; dwell.restart() }
        targetRow = -1
      } else {
        hotRow = -1
        hotReady = false
        dwell.stop()
        targetRow = row
        after = isAfter
      }
      placeMarks()
    }
    function placeMarks() {
      const v = view
      const row = hotRow >= 0 ? hotRow : targetRow
      const d = row >= 0 ? v.itemAtIndex(row) : null
      if (!d) { bar.visible = false; hotBox.visible = false; return }
      const tl = d.mapToItem(reorderDrag, 0, 0)
      const inset = window.viewMode === "list" ? 0 : 9  // the card's own margins
      if (hotRow >= 0) {
        bar.visible = false
        hotBox.visible = true
        hotBox.x = tl.x + inset; hotBox.y = tl.y + inset
        hotBox.width = d.width - 2 * inset; hotBox.height = d.height - 2 * inset
      } else {
        hotBox.visible = false
        bar.visible = true
        if (window.viewMode === "list") {
          bar.width = d.width; bar.height = 3
          bar.x = tl.x; bar.y = (after ? tl.y + d.height : tl.y) - 2
        } else {
          bar.width = 4; bar.height = d.height - 2 * inset
          bar.x = (after ? tl.x + d.width : tl.x) - 2; bar.y = tl.y + inset
        }
      }
    }
    function finish() {
      if (!active) return
      const moving = ids
      const folderRow = hotReady ? hotRow : -1
      const row = targetRow, isAfter = after
      cancel()
      if (folderRow >= 0) {
        const problem = LibraryModel.moveItems(moving, LibraryModel.itemAt(folderRow).id)
        if (problem !== "") LibraryModel.showStatus(problem)
      } else if (row >= 0) LibraryModel.placeItems(moving, row, isAfter)
    }
    function cancel() {
      active = false
      dwell.stop()
      hotRow = -1
      hotReady = false
      targetRow = -1
      bar.visible = false
      hotBox.visible = false
    }

    Timer { id: dwell; interval: 500; onTriggered: reorderDrag.hotReady = true }
    Timer {  // auto-scroll near the edges (64 px zone, up to 18 px a frame)
      interval: 16
      repeat: true
      running: reorderDrag.active
      onTriggered: {
        const v = reorderDrag.view
        const p = v.mapFromItem(null, reorderDrag.px, reorderDrag.py)
        if (p.x < 0 || p.x > v.width) return
        let step = 0
        if (p.y < 64) step = -18 * Math.min(1, (64 - p.y) / 64)
        else if (p.y > v.height - 64) step = 18 * Math.min(1, (p.y - v.height + 64) / 64)
        if (step === 0) return
        const top = v.originY, bottom = v.originY + Math.max(0, v.contentHeight - v.height)
        v.contentY = Math.max(top, Math.min(bottom, v.contentY + step))
        reorderDrag.update()
      }
    }
    Shortcut { sequence: "Esc"; enabled: reorderDrag.active; onActivated: reorderDrag.cancel() }

    Rectangle {  // where the item will land
      id: bar
      visible: false
      radius: 2
      color: ThemeBridge.accentColor
    }
    Rectangle {  // a folder that will take the item
      id: hotBox
      visible: false
      radius: ThemeBridge.radius
      color: Qt.rgba(ThemeBridge.accentColor.r, ThemeBridge.accentColor.g, ThemeBridge.accentColor.b, reorderDrag.hotReady ? 0.25 : 0.08)
      border.width: 3
      border.color: ThemeBridge.accentColor
      opacity: reorderDrag.hotReady ? 1 : 0.5
      Behavior on opacity { NumberAnimation { duration: ThemeBridge.fastMs } }
    }
    Rectangle {  // the ghost under the pointer
      visible: reorderDrag.active
      x: reorderDrag.px + 14
      y: reorderDrag.py + 10
      width: Math.min(260, ghostRow.implicitWidth + 24)
      height: 38
      radius: ThemeBridge.radiusSmall
      color: ThemeBridge.surface2
      border.width: 1
      border.color: ThemeBridge.accentColor
      opacity: 0.95
      Row {
        id: ghostRow
        anchors.verticalCenter: parent.verticalCenter
        x: 12
        spacing: 8
        Icon {
          anchors.verticalCenter: parent.verticalCenter
          visible: reorderDrag.hotReady
          name: "folder"
          size: 16
          color: ThemeBridge.accentColor
        }
        Text {
          anchors.verticalCenter: parent.verticalCenter
          width: Math.min(implicitWidth, 210)
          elide: Text.ElideRight
          text: reorderDrag.label
          color: ThemeBridge.text
          font.family: ThemeBridge.fontBold
          font.weight: Font.DemiBold
          font.pixelSize: 13
        }
      }
    }
  }

  RowLayout {
    anchors.fill: parent
    spacing: 0

    Sidebar {
      id: sidebar
      Layout.fillHeight: true
      Layout.preferredWidth: implicitWidth
      onSettingsClicked: lookPanel.opened ? lookPanel.close() : lookPanel.open()
    }

    ColumnLayout {
      Layout.fillWidth: true
      Layout.fillHeight: true
      spacing: 0

      TopBar {
        Layout.fillWidth: true
        viewMode: window.viewMode
        cardWidth: window.cardWidth
        onViewModeSelected: (mode) => window.viewMode = mode
        onCardWidthSelected: (value) => window.cardWidth = value
        onAddFolderClicked: contentDialog.ask()
        onAddFilesClicked: filesPicker.open()
        onCreateClicked: (kind, rom) => editor.create(kind, rom)
      }

      // breadcrumb: back / forward and the path
      RowLayout {
        Layout.fillWidth: true
        Layout.leftMargin: 24
        Layout.rightMargin: 24
        Layout.topMargin: 14
        Layout.bottomMargin: 4
        spacing: 6

        Rectangle {
          implicitWidth: 38; implicitHeight: 34; radius: ThemeBridge.radiusSmall
          color: Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, backArea.containsMouse ? 0.12 : 0.07)
          opacity: LibraryModel.canGoBack ? 1 : 0.4
          Icon { anchors.centerIn: parent; name: "chevL"; size: 18; color: ThemeBridge.text }
          MouseArea { id: backArea; anchors.fill: parent; hoverEnabled: true; onClicked: LibraryModel.back() }
        }
        Rectangle {  // forward: undoes a Back
          implicitWidth: 38; implicitHeight: 34; radius: ThemeBridge.radiusSmall
          color: Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, forwardArea.containsMouse ? 0.12 : 0.07)
          opacity: LibraryModel.canGoForward ? 1 : 0.4
          Icon { anchors.centerIn: parent; name: "chevR"; size: 18; color: ThemeBridge.text }
          MouseArea { id: forwardArea; anchors.fill: parent; hoverEnabled: true; onClicked: LibraryModel.forward() }
        }
        Item { implicitWidth: 6 }
        Text {  // a flat list (search, tag filter, All items, Favorites, Recent) shows its title instead of the path
          visible: LibraryModel.flat
          text: LibraryModel.title + "  •  " + grid.count + (grid.count === 1 ? " item" : " items")
          color: ThemeBridge.text
          font.family: ThemeBridge.fontBold
          font.weight: Font.DemiBold
          font.pixelSize: 18
          elide: Text.ElideRight
          Layout.fillWidth: true
        }
        Text {
          visible: !LibraryModel.flat
          text: "Home"
          color: LibraryModel.currentId === "" ? ThemeBridge.text : ThemeBridge.textDim
          font.family: ThemeBridge.fontBold
          font.weight: Font.DemiBold
          font.pixelSize: 18
          MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: LibraryModel.open("") }
        }
        Repeater {
          model: LibraryModel.flat ? [] : LibraryModel.breadcrumb
          delegate: RowLayout {
            required property var modelData
            required property int index
            spacing: 6
            Icon { name: "chevR"; size: 16; color: ThemeBridge.textDim }
            Text {
              text: modelData.name
              color: index === LibraryModel.breadcrumb.length - 1 ? ThemeBridge.text : ThemeBridge.textDim
              font.family: ThemeBridge.fontBold
              font.weight: Font.DemiBold
              font.pixelSize: 18
              MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: LibraryModel.open(modelData.id) }
            }
          }
        }
        Item { Layout.fillWidth: true }
      }

      // the items of the open folder
      Item {
        Layout.fillWidth: true
        Layout.fillHeight: true

        GridView {
          id: grid
          anchors.fill: parent
          anchors.leftMargin: 15
          anchors.rightMargin: 6
          anchors.topMargin: 4
          visible: window.viewMode !== "list"
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          model: LibraryModel
          readonly property bool compactView: window.viewMode === "compact"
          readonly property real wanted: compactView ? window.cardWidth * 0.62 : window.cardWidth
          readonly property int columns: Math.max(1, Math.floor(width / wanted))
          cellWidth: Math.floor(width / columns)
          // cover (2:3, or square when compact) + the text under it
          cellHeight: (cellWidth - 18) * (compactView ? 1.0 : 1.5) + 18 + (compactView ? 34 : 54)
          ScrollBar.vertical: ScrollBar {}
          delegate: CoverCard {
            required property int index
            width: grid.cellWidth
            height: grid.cellHeight
            compact: grid.compactView
            onActivated: LibraryModel.openRow(index)
            onClicked: (ctrl, shift) => LibraryModel.clickRow(index, ctrl, shift)
            onMenuRequested: itemMenu.popupFor(index)
            onFavoriteToggled: LibraryModel.toggleFavorite(index)
            onDragStarted: (x, y) => reorderDrag.start(index, x, y)
            onDragMoved: (x, y) => reorderDrag.move(x, y)
            onDragEnded: reorderDrag.finish()
          }
        }

        ListView {
          id: list
          anchors.fill: parent
          anchors.leftMargin: 24
          anchors.rightMargin: 12
          anchors.topMargin: 4
          visible: window.viewMode === "list"
          clip: true
          spacing: 2
          boundsBehavior: Flickable.StopAtBounds
          model: LibraryModel
          ScrollBar.vertical: ScrollBar {}
          delegate: Rectangle {
            required property int index
            required property string name
            required property string initials
            required property string subtitle
            required property color topColor
            required property color bottomColor
            required property bool isFavorite
            required property bool isFolder
            required property bool isSelected
            required property bool isMissing
            width: list.width - 12
            height: 52
            radius: ThemeBridge.radiusSmall
            color: isSelected ? Qt.rgba(ThemeBridge.accentColor.r, ThemeBridge.accentColor.g, ThemeBridge.accentColor.b, 0.22)
                   : rowArea.containsMouse ? Qt.rgba(ThemeBridge.text.r, ThemeBridge.text.g, ThemeBridge.text.b, 0.07) : "transparent"
            MouseArea {
              id: rowArea
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              acceptedButtons: Qt.LeftButton | Qt.RightButton
              preventStealing: true
              // drag-to-reorder, as on the cards
              property point pressPoint
              property bool dragging: false
              property bool justDragged: false
              onPressed: (event) => { pressPoint = Qt.point(event.x, event.y); dragging = false; justDragged = false }
              onPositionChanged: (event) => {
                if (!(event.buttons & Qt.LeftButton)) return
                const at = mapToItem(null, event.x, event.y)
                if (dragging) { reorderDrag.move(at.x, at.y); return }
                if (Math.abs(event.x - pressPoint.x) + Math.abs(event.y - pressPoint.y) < 6) return
                dragging = true
                reorderDrag.start(index, at.x, at.y)
              }
              onReleased: if (dragging) { dragging = false; justDragged = true; reorderDrag.finish() }
              onCanceled: if (dragging) { dragging = false; reorderDrag.finish() }
              // the same rules as a card: a click selects (a folder opens), a double-click opens
              onClicked: (event) => {
                if (justDragged) { justDragged = false; return }
                if (event.button === Qt.RightButton) { itemMenu.popupFor(index); return }
                const ctrl = (event.modifiers & Qt.ControlModifier) !== 0
                const shift = (event.modifiers & Qt.ShiftModifier) !== 0
                if (isFolder && !ctrl && !shift) LibraryModel.openRow(index)
                else LibraryModel.clickRow(index, ctrl, shift)
              }
              onDoubleClicked: (event) => { if (event.button === Qt.LeftButton && !isFolder) LibraryModel.openRow(index) }
            }
            Rectangle {
              id: thumb
              x: 8
              anchors.verticalCenter: parent.verticalCenter
              width: 34; height: 40; radius: 7
              opacity: isMissing ? 0.5 : 1
              gradient: Gradient {
                GradientStop { position: 0; color: topColor }
                GradientStop { position: 1; color: bottomColor }
              }
              Text { anchors.centerIn: parent; text: initials; color: "white"; font.pixelSize: 12; font.family: ThemeBridge.fontBold; font.weight: Font.Bold }
            }
            Text {
              id: rowName
              anchors.left: thumb.right; anchors.leftMargin: 14; anchors.verticalCenter: parent.verticalCenter
              text: name; color: isMissing ? ThemeBridge.textDim : ThemeBridge.text
              font.family: ThemeBridge.fontBold; font.weight: Font.DemiBold; font.pixelSize: 15
            }
            Rectangle {  // "Missing": the file was not found
              visible: isMissing
              anchors.left: rowName.right; anchors.leftMargin: 8; anchors.verticalCenter: parent.verticalCenter
              width: pillText.implicitWidth + 16; height: pillText.implicitHeight + 2; radius: height / 2
              color: "#ffb454"
              Text { id: pillText; anchors.centerIn: parent; text: "Missing"; color: "#2b1500"; font.pixelSize: 11; font.weight: Font.Bold }
            }
            Text {
              anchors.right: star.left; anchors.rightMargin: 20; anchors.verticalCenter: parent.verticalCenter
              text: subtitle; color: ThemeBridge.textDim; font.pixelSize: 13
            }
            Item {
              id: star
              anchors.right: parent.right; anchors.rightMargin: 14; anchors.verticalCenter: parent.verticalCenter
              width: 24; height: 24
              Icon { anchors.centerIn: parent; name: "star"; size: 18; lineWidth: 2; color: isFavorite ? "#ffd166" : ThemeBridge.textDim }
              MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: LibraryModel.toggleFavorite(index) }
            }
          }
        }

        Text {
          anchors.centerIn: parent
          visible: grid.count === 0
          text: LibraryModel.query.trim() !== "" ? "Nothing found"
                : LibraryModel.selectedTags.length > 0 ? "No items have all of these tags"
                : LibraryModel.viewType === "favorites" ? "No favorites yet"
                : LibraryModel.viewType === "recent" ? "Nothing opened yet"
                : "This folder is empty"
          color: ThemeBridge.textDim
        }
      }
    }
  }

  // The console-style screen of a game (double-click a game; apps in Applications start at once). Above everything.
  GameScreen { id: gameScreen }
}
