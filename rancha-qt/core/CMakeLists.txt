# The core: everything that does not need Qt (data, scanning, sorting, queues...). Plain C++20, tested without a window.
add_library(rancha_core STATIC
  src/natural_compare.cpp
  src/color.cpp
  src/theme.cpp
  src/cover.cpp
  src/library_view.cpp
  src/sample_library.cpp
  src/stress_library.cpp
  src/database.cpp
  src/data_paths.cpp
  src/settings.cpp
  src/item_repository.cpp
)
target_include_directories(rancha_core PUBLIC include)
target_compile_features(rancha_core PUBLIC cxx_std_20)
if(MSVC)
  target_compile_options(rancha_core PRIVATE /W4 /utf-8)
else()
  target_compile_options(rancha_core PRIVATE -Wall -Wextra -Wpedantic)
endif()

# SQLite (public domain). Linux uses the system library when it is installed (Arch: package "sqlite").
# Otherwise (Windows, or RANCHA_BUNDLED_SQLITE=ON) the amalgamation in third_party/sqlite is compiled in.
option(RANCHA_BUNDLED_SQLITE "Always build the SQLite copy in third_party/sqlite" OFF)
if(NOT RANCHA_BUNDLED_SQLITE)
  find_package(SQLite3 QUIET)
endif()
if(SQLite3_FOUND)
  message(STATUS "Rancha: system SQLite ${SQLite3_VERSION}")
  # CMake 4.1+ names the target SQLite3::SQLite3 (the old name is deprecated); older CMake only has SQLite::SQLite3.
  if(TARGET SQLite3::SQLite3)
    target_link_libraries(rancha_core PUBLIC SQLite3::SQLite3)
  else()
    target_link_libraries(rancha_core PUBLIC SQLite::SQLite3)
  endif()
else()
  message(STATUS "Rancha: bundled SQLite (third_party/sqlite)")
  enable_language(C)  # the project is C++ only; sqlite3.c is C
  set(RANCHA_SQLITE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../third_party/sqlite)
  add_library(rancha_sqlite STATIC ${RANCHA_SQLITE_DIR}/sqlite3.c)
  target_include_directories(rancha_sqlite PUBLIC ${RANCHA_SQLITE_DIR})
  # Same behaviour as the system library and node:sqlite: default options, threads on.
  # (SQLite warns that SQLITE_OMIT_* options may not work with the amalgamation, so none are used.)
  target_compile_definitions(rancha_sqlite PRIVATE SQLITE_THREADSAFE=1)
  find_package(Threads REQUIRED)
  target_link_libraries(rancha_sqlite PUBLIC Threads::Threads ${CMAKE_DL_LIBS})
  target_link_libraries(rancha_core PUBLIC rancha_sqlite)
endif()

# nlohmann/json 3.12.0 (MIT), one header, used for settings.json and the "meta" column.
target_include_directories(rancha_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/../third_party/nlohmann/include)

# Windows: SHGetKnownFolderPath (shell32) and CoTaskMemFree (ole32) for the data folder.
if(WIN32)
  target_link_libraries(rancha_core PRIVATE shell32 ole32)
endif()
