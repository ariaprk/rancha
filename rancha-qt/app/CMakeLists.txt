# The Qt Quick application. Needs Qt 6.8 or newer (modules: Quick and Quick Controls).
find_package(Qt6 6.8 REQUIRED COMPONENTS Quick QuickControls2)
qt_standard_project_setup(REQUIRES 6.8)

qt_add_executable(rancha
  main.cpp
  CoreInfo.h
  CoreInfo.cpp
  ThemeBridge.h
  ThemeBridge.cpp
  LibraryModel.h
  LibraryModel.cpp
)

qt_add_qml_module(rancha
  URI Rancha
  VERSION 1.0
  QML_FILES
    qml/Main.qml
    qml/CoverCard.qml
    qml/Chip.qml
    qml/Icon.qml
    qml/SectionIcon.qml
    qml/Sidebar.qml
    qml/TopBar.qml
    qml/LookPanel.qml
  RESOURCES
    assets/fonts/poppins-400.woff
    assets/fonts/poppins-500.woff
    assets/fonts/poppins-700.woff
    assets/icons/apps.png
    assets/icons/book.png
    assets/icons/game.png
    assets/icons/music.png
    assets/icons/play.png
    assets/icons/video-game.png
)

target_link_libraries(rancha PRIVATE Qt6::Quick Qt6::QuickControls2 rancha_core)

# On Windows this is a window program (no black console box); on macOS a plain program, not a bundle.
set_target_properties(rancha PROPERTIES WIN32_EXECUTABLE TRUE MACOSX_BUNDLE FALSE)
