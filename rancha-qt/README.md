# Rancha (Qt)

A native rewrite of Rancha in **C++20 and Qt 6 (Qt Quick / QML)**. It lives next to the Electron app (which keeps working
as it is) and will, step by step, get the same features: library, launcher, readers, music, Big Picture, and a video player
with libmpv inside the window. Windows and Linux are built together from the start.

Status and decisions: `docs/STATUS.md`. Plan and order of the milestones: `docs/MILESTONES.md`.

## Layout

- `core/` - everything that does not need Qt (data, scanning, sorting, queues). Plain C++20, tested without a window.
- `app/` - the Qt Quick application (window, QML, bridges to the core).
- `tests/` - the core tests (no outside test library; run by `ctest`).

## Build (needs Qt 6.8 or newer, CMake 3.21 or newer, a C++20 compiler)

### Core and tests only (no Qt needed)
    cmake --preset core-only
    cmake --build build/core-only
    ctest --test-dir build/core-only --output-on-failure

### Windows (PowerShell)
1. Install **Visual Studio 2022 Build Tools** with the workload "Desktop development with C++" (it includes MSVC and CMake).
2. Install **Qt 6.8 or newer** for "MSVC 2022 64-bit": either the official Qt Online Installer (free Qt account) or
   `pip install aqtinstall` then `aqt install-qt windows desktop 6.8 win64_msvc2022_64 -O C:\Qt`.
3. Tell CMake where Qt is (change the path to what is really in `C:\Qt`; check with `dir C:\Qt`):

       $env:QT_ROOT_DIR = "C:\Qt\6.8.3\msvc2022_64"
       $env:PATH = "$env:QT_ROOT_DIR\bin;$env:PATH"

4. From the `rancha-qt` folder:

       cmake --preset windows
       cmake --build build/windows --config Release
       ctest --test-dir build/windows -C Release --output-on-failure
       .\build\windows\app\Release\rancha.exe

### Linux
- Arch: `sudo pacman -S base-devel cmake ninja qt6-base qt6-declarative`
- Fedora: `sudo dnf install cmake ninja-build gcc-c++ qt6-qtbase-devel qt6-qtdeclarative-devel`
- Debian/Ubuntu: their Qt may be older than 6.8; use `aqtinstall` as above (`aqt install-qt linux desktop 6.8 linux_gcc_64`)
  and set `QT_ROOT_DIR` to the folder it creates.

Then, from the `rancha-qt` folder:

    cmake --preset linux
    cmake --build build/linux
    ctest --test-dir build/linux --output-on-failure
    ./build/linux/app/rancha
