cmake_minimum_required(VERSION 3.21)
project(RanchaQt VERSION 0.0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# The Qt window is optional so the Qt-free core and its tests can be built and run on any machine with a C++ compiler.
option(RANCHA_BUILD_APP "Build the Qt Quick application (needs Qt 6.8 or newer)" ON)
option(RANCHA_BUILD_TESTS "Build the core tests" ON)

add_subdirectory(core)

if(RANCHA_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()

if(RANCHA_BUILD_APP)
  add_subdirectory(app)
endif()
