import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Rancha

// "Crop cover" / "Crop wallpaper": drag the picture to move it, use the slider or the mouse wheel to zoom. What is
// inside the frame becomes the cover (600 x 900) or the wallpaper (up to 1920 x 1080). Port of the Electron app's
// CropDialog.tsx; the arithmetic is the core's crop_math.h (LibraryModel.cropStep), the saving is LibraryModel.saveCrop.
Popup {
  id: root
  modal: true
  focus: true
  closePolicy: busy ? Popup.NoAutoClose : Popup.CloseOnEscape
  anchors.centerIn: Overlay.overlay
  width: shape === "wallpaper" ? 520 : 400
  padding: 20

  property string shape: "cover"   // cover | wallpaper
  property url source
  property real imageWidth: 1
  property real imageHeight: 1
  property var view: ({ scale: 1, offsetX: 0, offsetY: 0, zoom: 1, minZoom: 1, maxZoom: 4, frameWidth: 240, frameHeight: 360 })
  property bool busy: false
  property string error: ""
  signal done(string file, string url)

  // Opens the cropper for a picture: {ok, url, width, height} from LibraryModel.openPicture / pastePicture.
  function start(picture, cropShape) {
    shape = cropShape
    source = picture.url
    imageWidth = picture.width
    imageHeight = picture.height
    error = ""
    busy = false
    step("fill", 0, 0)
    open()
  }
  function step(op, a, b) { view = LibraryModel.cropStep(shape, imageWidth, imageHeight, view, op, a, b) }
  function save() {
    busy = true
    error = ""
    const result = LibraryModel.saveCrop(source, shape, view)
    busy = false
    if (!result.ok) { error = result.error; return }
    close()
    done(result.file, result.url)
  }

  background: Rectangle { radius: ThemeBridge.radius; color: ThemeBridge.surface; border.color: ThemeBridge.border }
  Overlay.modal: Rectangle { color: Qt.rgba(0, 0, 0, 0.45) }

  contentItem: ColumnLayout {
    spacing: 10
    Text {
      text: root.shape === "wallpaper" ? "Crop wallpaper" : "Crop cover"
      color: ThemeBridge.text
      font.family: ThemeBridge.fontBold
      font.weight: Font.Bold
      font.pixelSize: 18
    }

    Rectangle {  // the frame
      Layout.alignment: Qt.AlignHCenter
      implicitWidth: root.view.frameWidth
      implicitHeight: root.view.frameHeight
      color: "black"
      clip: true
      border.color: ThemeBridge.border
      Image {
        x: root.view.offsetX
        y: root.view.offsetY
        width: root.imageWidth * root.view.scale
        height: root.imageHeight * root.view.scale
        source: root.source
        smooth: true
        mipmap: true
        asynchronous: true
      }
      Canvas {  // the rule-of-thirds grid
        anchors.fill: parent
        opacity: 0.35
        onPaint: {
          const ctx = getContext("2d")
          ctx.clearRect(0, 0, width, height)
          ctx.strokeStyle = "white"
          ctx.lineWidth = 1
          for (let i = 1; i < 3; ++i) {
            ctx.beginPath(); ctx.moveTo(width * i / 3, 0); ctx.lineTo(width * i / 3, height); ctx.stroke()
            ctx.beginPath(); ctx.moveTo(0, height * i / 3); ctx.lineTo(width, height * i / 3); ctx.stroke()
          }
        }
      }
      MouseArea {
        anchors.fill: parent
        cursorShape: pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor
        property real lastX: 0
        property real lastY: 0
        onPressed: (mouse) => { lastX = mouse.x; lastY = mouse.y }
        onPositionChanged: (mouse) => {
          root.step("pan", mouse.x - lastX, mouse.y - lastY)
          lastX = mouse.x
          lastY = mouse.y
        }
        onWheel: (wheel) => root.step("wheel", Math.exp(wheel.angleDelta.y / 120 * 0.18), 0)
      }
    }

    RowLayout {
      Layout.fillWidth: true
      Text { text: "Zoom"; color: ThemeBridge.textDim; font.pixelSize: 12 }
      Slider {
        Layout.fillWidth: true
        from: root.view.minZoom
        to: root.view.maxZoom
        stepSize: 0.01
        value: root.view.zoom
        onMoved: root.step("zoom", value, 0)
      }
    }
    RowLayout {
      Layout.alignment: Qt.AlignHCenter
      Button { text: "Fill frame"; onClicked: root.step("fill", 0, 0) }
      Button { text: "Fit whole picture"; onClicked: root.step("fit", 0, 0) }
    }
    Text {
      Layout.fillWidth: true
      wrapMode: Text.WordWrap
      color: ThemeBridge.textDim
      font.pixelSize: 12
      text: "Drag the picture to move it, scroll or use the slider to zoom. What is inside the frame becomes "
            + (root.shape === "wallpaper" ? "the wallpaper." : "the cover. In the compact grid, covers show their middle part as a square.")
    }
    Text { visible: root.error !== ""; text: root.error; color: "#ff6b6b"; font.pixelSize: 13; wrapMode: Text.WordWrap; Layout.fillWidth: true }
    RowLayout {
      Layout.fillWidth: true
      Item { Layout.fillWidth: true }
      Button { text: "Cancel"; enabled: !root.busy; onClicked: root.close() }
      Button {
        text: root.busy ? "Saving…" : root.shape === "wallpaper" ? "Use this wallpaper" : "Use this cover"
        enabled: !root.busy
        highlighted: true
        onClicked: root.save()
      }
    }
  }
}
