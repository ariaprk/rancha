import QtQuick
import QtQuick.Controls
import QtQuick.Effects
import QtQuick.Shapes
import Rancha

// The console-style game screen (the Electron app's GameScreen.tsx and its .game-screen styles): the whole window
// becomes the game's wallpaper with its name, one big Play button and a small playtime box. Double-clicking a game
// (not an app in the Applications section) opens it. Pressing Play:
//   1. everything except the wallpaper fades away,
//   2. the wallpaper is shown alone for 2 seconds (Esc cancels meanwhile),
//   3. only then is the game started,
//   4. the wallpaper stays until Esc, Enter, Space or a click brings the screen back.
// The app cannot see inside a game, so it does not try to guess when the game has ended.
// The item's own wallpaper is shown sharp; without one the cover is blurred; without a cover a gradient of the
// item's hue is shown. The playtime itself is not counted yet ("— h"), as in the Electron app.
// Only transform and opacity are animated, and the blurred picture is blurred once and then only scaled.
Item {
  id: root
  anchors.fill: parent
  z: 1100  // above the library, its drop area and the drag ghost; the toast (an overlay) stays on top
  visible: itemId !== ''
  Accessible.role: Accessible.Dialog
  Accessible.name: item.name || ''

  readonly property int launchDelayMs: 2000  // the wallpaper alone for this long BEFORE the game is started
  readonly property int leaveMs: 260
  readonly property bool still: ThemeBridge.medMs === 0  // Motion: Off

  property string itemId: ''
  property var item: ({})
  property string lastPlayed: ''
  property bool shown: false     // drives the entrance and exit animations
  property string phase: 'idle'  // idle | launching | playing
  property string problem: ''
  property bool busy: false
  property bool leaving: false
  property bool started: false   // has the game been started yet?
  property int run: 0            // numbers each Play, so a cancelled one can tell it was cancelled
  readonly property bool launching: phase !== 'idle'
  readonly property bool ownWallpaper: (item.wallpaperUrl || '') !== ''
  readonly property string wallpaper: ownWallpaper ? item.wallpaperUrl : (item.coverUrl || '')
  readonly property int hue: item.hue || 0

  signal closed

  function ms(value) { return still ? 0 : value }

  function openFor(id) {
    const found = LibraryModel.itemById(id)
    if (!found.id) return
    item = found
    lastPlayed = LibraryModel.lastPlayedText(id)
    phase = 'idle'
    problem = ''
    busy = false
    leaving = false
    started = false
    shown = false
    itemId = id
    playButton.forceActiveFocus()
    Qt.callLater(() => { if (root.itemId === id && !root.leaving) root.shown = true })  // hidden first, so the entrance runs
  }
  function close() {
    if (busy || leaving || itemId === '') return
    leaving = true
    shown = false
    leaveTimer.start()
  }
  function play() {
    if (busy || leaving || itemId === '') return
    busy = true
    problem = ''
    run += 1
    started = false
    phase = 'launching'
    launchTimer.mine = run
    launchTimer.restart()
  }
  function cancelLaunch() {  // changed your mind during the two seconds
    run += 1
    launchTimer.stop()
    busy = false
    phase = 'idle'
  }
  function showScreenAgain() {
    phase = 'idle'
    playButton.forceActiveFocus()
  }

  Timer {
    id: launchTimer
    property int mine: 0
    interval: root.launchDelayMs
    onTriggered: {
      if (root.run !== mine || root.itemId === '') return  // cancelled or closed meanwhile
      root.started = true
      const message = LibraryModel.launch(root.itemId)
      root.busy = false
      root.item = LibraryModel.itemById(root.itemId)
      root.lastPlayed = LibraryModel.lastPlayedText(root.itemId)
      if (message !== '') {
        root.phase = 'idle'
        root.problem = message
        playButton.forceActiveFocus()
        return
      }
      root.phase = 'playing'  // started: the wallpaper stays until the player asks for the screen back
    }
  }
  Timer {
    id: leaveTimer
    interval: Math.max(1, root.ms(root.leaveMs))
    onTriggered: {
      root.itemId = ''
      root.leaving = false
      root.phase = 'idle'
      root.closed()
    }
  }

  // The keys belong to this screen while it is open (Main.qml switches the library's shortcuts off meanwhile).
  Shortcut {
    sequence: 'Esc'
    enabled: root.visible && !root.leaving
    autoRepeat: false
    onActivated: {
      if (root.phase === 'launching') { if (!root.started) root.cancelLaunch() }
      else if (root.phase === 'playing') root.showScreenAgain()
      else root.close()
    }
  }
  Shortcut {
    sequences: ['Return', 'Enter', 'Space']
    enabled: root.visible && !root.leaving
    autoRepeat: false
    onActivated: {
      if (root.phase === 'playing') root.showScreenAgain()
      else if (root.phase === 'idle') root.play()
    }
  }

  // the focus outline of the two buttons (3 px accent, 3 px away from the button)
  component FocusRing: Rectangle {
    anchors.fill: parent
    anchors.margins: -6
    radius: height / 2
    color: 'transparent'
    border.width: 3
    border.color: ThemeBridge.accentColor
  }

  Rectangle {
    id: screen
    anchors.fill: parent
    color: '#07080b'
    clip: true
    opacity: root.shown ? 1 : 0
    Behavior on opacity { NumberAnimation { duration: root.ms(260); easing.type: Easing.OutCubic } }

    // Takes every click and the wheel, so nothing reaches the library underneath. The pointer hides while the
    // wallpaper is shown alone; a click then brings the screen back.
    MouseArea {
      anchors.fill: parent
      acceptedButtons: Qt.AllButtons
      hoverEnabled: true
      cursorShape: root.launching ? Qt.BlankCursor : Qt.ArrowCursor
      onClicked: if (root.phase === 'playing') root.showScreenAgain()
      onWheel: (wheel) => { wheel.accepted = true }
    }

    // ---- the wallpaper: slowly zooms from 116 % to 104 % when the screen opens
    Item {
      id: zoom
      anchors.fill: parent
      scale: root.shown ? 1.04 : 1.16
      Behavior on scale { NumberAnimation { duration: root.ms(1100); easing.type: Easing.OutQuart } }

      Shape {  // linear-gradient(135deg, hsl(h 55% 22%), hsl(h+40 50% 10%))
        anchors.fill: parent
        ShapePath {
          strokeWidth: -1
          fillGradient: LinearGradient {
            x1: 0; y1: 0; x2: zoom.width; y2: zoom.height
            GradientStop { position: 0; color: Qt.hsla(root.hue / 360, 0.55, 0.22, 1) }
            GradientStop { position: 1; color: Qt.hsla(((root.hue + 40) % 360) / 360, 0.50, 0.10, 1) }
          }
          startX: 0; startY: 0
          PathLine { x: zoom.width; y: 0 }
          PathLine { x: zoom.width; y: zoom.height }
          PathLine { x: 0; y: zoom.height }
          PathLine { x: 0; y: 0 }
        }
      }
      Shape {  // radial-gradient(120% 90% at 30% 20%, hsl(h 60% 34%), transparent 60%): a circle squeezed into the ellipse
        id: glow
        readonly property real rx: zoom.width * 1.2
        readonly property real squeeze: Math.max(0.01, (zoom.height * 0.9) / Math.max(1, rx))
        width: zoom.width
        height: zoom.height / squeeze
        transform: Scale { yScale: glow.squeeze }
        ShapePath {
          strokeWidth: -1
          fillGradient: RadialGradient {
            centerX: glow.width * 0.3; centerY: glow.height * 0.2; centerRadius: glow.rx
            focalX: glow.width * 0.3; focalY: glow.height * 0.2; focalRadius: 0
            GradientStop { position: 0; color: Qt.hsla(root.hue / 360, 0.60, 0.34, 1) }
            GradientStop { position: 0.6; color: Qt.hsla(root.hue / 360, 0.60, 0.34, 0) }
          }
          startX: 0; startY: 0
          PathLine { x: glow.width; y: 0 }
          PathLine { x: glow.width; y: glow.height }
          PathLine { x: 0; y: glow.height }
          PathLine { x: 0; y: 0 }
        }
      }
      Image {  // the item's own wallpaper, sharp (also the source of the blurred cover below)
        id: picture
        anchors.fill: parent
        source: root.wallpaper
        visible: root.ownWallpaper && status === Image.Ready
        fillMode: Image.PreserveAspectCrop
        asynchronous: true
        smooth: true
        mipmap: true
      }
      MultiEffect {  // no wallpaper of its own: the cover, blur(26px) saturate(1.25) brightness(.85), 20 % larger
        anchors.fill: parent
        source: picture
        visible: !root.ownWallpaper && root.wallpaper !== '' && picture.status === Image.Ready
        scale: 1.2  // hides the soft edges the blur makes
        blurEnabled: true
        blur: 1.0
        blurMax: 64
        saturation: 0.25
        brightness: -0.15
      }
    }

    Rectangle {  // .gs-shade: darker at the bottom (under the text) and a little at the top
      anchors.fill: parent
      opacity: root.launching ? 0 : 1  // while launching: only the wallpaper, nothing on top of it
      Behavior on opacity { NumberAnimation { duration: root.ms(400) } }
      gradient: Gradient {
        GradientStop { position: 0.0; color: Qt.rgba(0, 0, 0, 0.40) }
        GradientStop { position: 0.22; color: Qt.rgba(0, 0, 0, 0) }
        GradientStop { position: 0.38; color: Qt.rgba(0, 0, 0, 0) }
        GradientStop { position: 0.62; color: Qt.rgba(0, 0, 0, 0.25) }
        GradientStop { position: 1.0; color: Qt.rgba(0, 0, 0, 0.78) }
      }
    }

    DragArea { anchors.left: parent.left; anchors.right: parent.right; anchors.top: parent.top; height: 48 }  // move the window

    // ---- the buttons and text; they rise into place one after another (0, 90 and 170 ms later)
    Item {
      id: ui
      anchors.fill: parent
      anchors.margins: Math.max(22, Math.min(56, root.width * 0.04))
      opacity: root.launching ? 0 : 1
      enabled: !root.launching
      Behavior on opacity { NumberAnimation { duration: root.ms(320) } }

      Button {
        id: backButton
        anchors.left: parent.left
        anchors.top: parent.top
        leftPadding: 10
        rightPadding: 16
        topPadding: 8
        bottomPadding: 8
        hoverEnabled: true
        onClicked: root.close()
        opacity: root.shown ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: root.ms(520); easing.type: Easing.OutCubic } }
        transform: Translate {
          y: root.shown ? 0 : 24
          Behavior on y { NumberAnimation { duration: root.ms(640); easing.type: Easing.OutQuart } }
        }
        contentItem: Row {
          spacing: 6
          Icon { anchors.verticalCenter: parent.verticalCenter; name: 'chevL'; size: 18; lineWidth: 2; color: 'white' }
          Text { anchors.verticalCenter: parent.verticalCenter; text: 'Library'; color: 'white'; font.pixelSize: 14 }
        }
        background: Rectangle {
          radius: height / 2
          color: Qt.rgba(1, 1, 1, backButton.hovered ? 0.22 : 0.12)
        }
        FocusRing { visible: backButton.visualFocus }
        HoverHandler { cursorShape: Qt.PointingHandCursor }
      }

      WindowControls {  // the window has no frame of its own, so the screen carries its own buttons (as in Electron)
        anchors.right: parent.right
        anchors.top: parent.top
        opacity: root.shown ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: root.ms(520); easing.type: Easing.OutCubic } }
      }

      Column {
        id: mainBlock
        anchors.left: parent.left
        anchors.bottom: parent.bottom
        width: Math.min(900, ui.width * 0.92)
        spacing: 22

        Text {
          id: title
          width: parent.width
          text: root.item.name || ''
          color: 'white'
          wrapMode: Text.WrapAtWordBoundaryOrAnywhere
          font.family: ThemeBridge.fontBold
          font.weight: Font.Bold
          font.pixelSize: Math.max(36, Math.min(72, root.width * 0.052))
          font.letterSpacing: -0.02 * font.pixelSize
          lineHeight: 1.04
          opacity: root.shown ? 1 : 0
          Behavior on opacity {
            SequentialAnimation {
              PauseAnimation { duration: root.ms(90) }
              NumberAnimation { duration: root.ms(520); easing.type: Easing.OutCubic }
            }
          }
          transform: Translate {
            y: root.shown ? 0 : 24
            Behavior on y {
              SequentialAnimation {
                PauseAnimation { duration: root.ms(90) }
                NumberAnimation { duration: root.ms(640); easing.type: Easing.OutQuart }
              }
            }
          }
          layer.enabled: true
          layer.effect: MultiEffect {  // text-shadow: 0 4px 28px rgba(0,0,0,.55)
            shadowEnabled: true
            shadowVerticalOffset: 4
            shadowBlur: 1.0
            blurMax: 28
            shadowColor: Qt.rgba(0, 0, 0, 0.55)
          }
        }

        Row {
          id: actions
          spacing: 22
          opacity: root.shown ? 1 : 0
          Behavior on opacity {
            SequentialAnimation {
              PauseAnimation { duration: root.ms(170) }
              NumberAnimation { duration: root.ms(520); easing.type: Easing.OutCubic }
            }
          }
          transform: Translate {
            y: root.shown ? 0 : 24
            Behavior on y {
              SequentialAnimation {
                PauseAnimation { duration: root.ms(170) }
                NumberAnimation { duration: root.ms(640); easing.type: Easing.OutQuart }
              }
            }
          }

          Button {
            id: playButton
            anchors.verticalCenter: parent.verticalCenter
            leftPadding: 32
            rightPadding: 44
            topPadding: 16
            bottomPadding: 16
            hoverEnabled: true
            onClicked: root.play()
            scale: pressed ? 0.98 : hovered ? 1.045 : 1
            Behavior on scale { NumberAnimation { duration: root.ms(160); easing.type: Easing.OutCubic } }
            contentItem: Row {
              spacing: 12
              Item {  // the filled Play triangle
                anchors.verticalCenter: parent.verticalCenter
                width: 26
                height: 26
                Shape {
                  width: 24
                  height: 24
                  scale: 26 / 24
                  transformOrigin: Item.TopLeft
                  preferredRendererType: Shape.CurveRenderer
                  ShapePath {
                    fillColor: '#0b0c10'
                    strokeWidth: -1
                    PathSvg { path: 'M8 5l11 7-11 7z' }
                  }
                }
              }
              Text {
                anchors.verticalCenter: parent.verticalCenter
                text: 'Play'
                color: '#0b0c10'
                font.family: ThemeBridge.fontBold
                font.weight: Font.Bold
                font.pixelSize: 22
                font.letterSpacing: 0.44
              }
            }
            background: Rectangle {
              radius: height / 2
              color: 'white'
              layer.enabled: true
              layer.effect: MultiEffect {  // box-shadow: 0 10px 34px rgba(0,0,0,.45)
                shadowEnabled: true
                shadowVerticalOffset: 10
                shadowBlur: 1.0
                blurMax: 34
                shadowColor: Qt.rgba(0, 0, 0, 0.45)
              }
            }
            FocusRing { visible: playButton.visualFocus }
            HoverHandler { cursorShape: Qt.PointingHandCursor }
          }

          Rectangle {  // the playtime box: not counted yet, plus "Played 3 days ago"
            anchors.verticalCenter: parent.verticalCenter
            width: Math.max(128, playtimeColumn.implicitWidth + 36)
            height: playtimeColumn.implicitHeight + 20
            radius: 14
            color: Qt.rgba(1, 1, 1, 0.1)
            Column {
              id: playtimeColumn
              x: 18
              y: 10
              spacing: 2
              Text { text: 'PLAYTIME'; color: Qt.rgba(1, 1, 1, 0.62); font.pixelSize: 11; font.letterSpacing: 1.3 }
              Text { text: '— h'; color: 'white'; font.pixelSize: 22; font.weight: Font.DemiBold }
              Text { text: root.lastPlayed; color: Qt.rgba(1, 1, 1, 0.62); font.pixelSize: 12 }
            }
          }
        }

        Rectangle {  // why it could not be started
          visible: root.problem !== ''
          width: Math.min(640, parent.width)
          height: problemText.implicitHeight + 20
          radius: 12
          color: Qt.rgba(200 / 255, 40 / 255, 50 / 255, 0.55)
          Accessible.role: Accessible.AlertMessage
          Accessible.name: root.problem
          Text {
            id: problemText
            x: 16
            y: 10
            width: parent.width - 32
            text: root.problem
            color: 'white'
            font.pixelSize: 14
            wrapMode: Text.Wrap
          }
        }
      }
    }
  }
}
