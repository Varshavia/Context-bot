# Context Bot

**Context Bot** is an open-source context management tool for developers. It saves your active workspace windows and Chrome tabs as a snapshot and restores them with a single click whenever you want.

![Version](https://img.shields.io/badge/version-1.3.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Built With](https://img.shields.io/badge/built%20with-Electron%20%2B%20React-61DAFB)
![CI](https://github.com/Varshavia/Context-bot/actions/workflows/ci.yml/badge.svg)

<!-- Add a screenshot of the main window here:
## Screenshot

![Context Bot main window](docs/screenshot.png)
-->

## Features

* **Smart Scanning:** Automatically detects open system windows and Google Chrome tabs (GitHub, StackOverflow, etc.).
* **Snapshot Recording:** Save your current workspace state by naming it (e.g., "Algorithm Homework", "Project X").
* **One-Click Restore:** Re-opens your saved tabs directly inside Chrome via the extension, recreating the original browser window layout. If the extension is not connected, tabs open in your default browser as a fallback.
* **App Relaunch:** Known desktop applications that were open when you took the snapshot (VS Code, Terminal, Slack, Obsidian and more) are started again on restore.
* **System Tray:** Take a quick snapshot or restore a recent one straight from the tray, without opening the window.
* **Update, Rename, Search:** Refresh a snapshot with your current workspace, rename it inline, and filter your snapshots by name or by the titles they contain.
* **Live Connection Status:** The app shows whether the Chrome extension is currently connected.
* **Persistent Memory:** Snapshots are stored on disk (with atomic writes) and survive app restarts.
* **Auto-Update:** On Windows and Linux, the app checks GitHub Releases and notifies you when a new version is available.

## Installation (For End Users)

Download the latest installer for your operating system from the **[Releases](../../releases)** page:

| Platform | File |
|----------|------|
| Windows  | `Context Bot Setup <version>.exe` |
| macOS    | `Context Bot-<version>.dmg` |
| Linux    | `Context Bot-<version>.AppImage` or `.deb` |

Platform notes:

* **Windows:** Run the `.exe` installer.
* **macOS:** Open the `.dmg` and drag the app into Applications. The build is not code-signed, so on first launch right-click the app and choose *Open* to bypass Gatekeeper.
* **Linux:** For the AppImage, make it executable first: `chmod +x "Context Bot-<version>.AppImage"`. Window scanning additionally requires `wmctrl` (e.g. `sudo apt install wmctrl`).

> **Note:** To track and restore Chrome tabs you must also install the browser extension (see below).

## Developer Setup (Running from Source)

1. Clone the repository:
   ```bash
   git clone https://github.com/Varshavia/Context-bot.git
   cd Context-bot
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

To build installers locally, run `npm run dist:win`, `npm run dist:mac` or `npm run dist:linux` on the matching operating system. Tagged pushes (`v*`) also trigger a GitHub Actions workflow that builds installers for all three platforms and attaches them to a GitHub Release.

Before committing, run `npm run lint` and `npm run format:check` (or `npm run format` to auto-fix). See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contribution guide and [CHANGELOG.md](CHANGELOG.md) for release history.

## Chrome Extension Setup (Required)

You need to load the `extension` folder into Chrome so the app can read browser tabs:

1. Open Google Chrome and type `chrome://extensions/` in the address bar.
2. Toggle on **Developer Mode** in the top right corner.
3. Click the **Load unpacked** button.
4. Select the `extension` folder located inside the project directory.
5. Once the extension is loaded and the app is running, the connection is established automatically.

## Technologies Used

* **Electron.js:** For the desktop application.
* **React (UMD, no build step):** For the user interface — bundled locally under `public/vendor`, no CDN required.
* **WebSocket (ws):** For communication with the Chrome extension.
* **PowerShell / AppleScript / wmctrl:** For OS window scanning on Windows / macOS / Linux.

## Project Structure

```
main.js                  Electron main process: lifecycle + IPC wiring
preload.js               contextBridge API exposed to the renderer
src/extension-bridge.js  WebSocket server for the Chrome extension
src/snapshot-store.js    Snapshot persistence (async, atomic writes)
src/window-scanner.js    Cross-platform OS window scanning
src/app-launcher.js      Relaunches known desktop apps on restore
public/                  Renderer (index.html, renderer.js, styles.css, vendor React)
extension/               Chrome MV3 extension (tab reporting + restore)
assets/                  Build resources (app icon for macOS/Linux)
```

## WebSocket Protocol

The app and the extension exchange JSON messages over `ws://localhost:8080`:

* Extension → App: `{ "type": "tabs", "payload": [{ "title", "url", "windowId" }] }` — sent whenever tabs change. `windowId` lets snapshots remember which tabs shared a browser window.
* Extension → App: `{ "type": "ping" }` — keepalive (also keeps the MV3 service worker alive).
* App → Extension: `{ "type": "open-tabs", "payload": { "windows": [[url, ...]], "urls": [...] } }` — restore command. Each `windows` group is opened as its own browser window; the flat `urls` list is a fallback for older extension versions. Only `http(s)` URLs are ever restored.

## Compatibility

Context Bot runs on **Windows**, **macOS** and **Linux**. Window scanning uses PowerShell on Windows, AppleScript (`osascript`) on macOS and `wmctrl` on Linux (install it with e.g. `sudo apt install wmctrl` if it is missing). Chrome tab tracking and restore work the same on all platforms. Windows has received the most testing; feedback and issues for macOS/Linux are welcome.
