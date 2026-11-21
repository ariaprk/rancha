# Setting up on Windows 11 (one time)

You only do steps 1–3 once. Step 4 onward is how you run the app every time.

## 1. Install Node.js
Node.js is the engine that runs the project's tools.
1. Go to https://nodejs.org and download the **LTS** version (Windows installer, .msi).
2. Run the installer and keep all the defaults.
3. Restart your PC or at least close any open terminal windows.

## 2. Install Git (your "time machine" for the code)
1. Go to https://git-scm.com/download/win and run the installer with the defaults.

## 3. Install VS Code (optional, but recommended for reading the code)
1. Go to https://code.visualstudio.com and install it with the defaults.

## 4. Put the project folder somewhere simple
Copy the `library-app` folder to a simple place, for example `C:\Projects\library-app`.
Avoid folders inside OneDrive or with very long paths.

## 5. Open a terminal inside the folder
Open the folder in File Explorer, click the address bar, type `powershell` and press Enter.
Check the tools work (each should print a version number):

    node -v
    npm.cmd -v
    git --version

## 6. Install the project's dependencies (first time only, needs internet)

    npm.cmd install

This downloads the building blocks (Electron, React, ...) into a `node_modules` folder.
It can take a few minutes. Warnings are normal; red "error" lines are not.

## 7. Check the code for mistakes (optional)

    npm.cmd run typecheck

No output means no problems.

## 8. Run the app

    npm.cmd run dev

A window titled "Library" should open with a dark background, the word **Library** in
blue, and a line of version numbers. If you edit `src/renderer/src/styles.css` (for
example change `--accent`) and save, the window updates by itself.
Close the window, or press Ctrl+C in the terminal, to stop.

## 9. Make your first save point with Git

    git init
    git add .
    git commit -m "Milestone 1: empty window"

## If something goes wrong
Copy the full error text from the terminal and send it to me. Do not worry about
understanding it.
