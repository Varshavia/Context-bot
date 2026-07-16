# Context Bot 🤖

**Context Bot** is an open-source "context management" tool designed for computer engineers and developers. It saves your active workspace windows and Chrome tabs as a "Snapshot" and restores them with a single click whenever you want.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![Built With](https://img.shields.io/badge/built%20with-Electron%20%2B%20React-61DAFB)

## 🌟 Features

* **Smart Scanning:** Automatically detects open system windows and Google Chrome tabs (GitHub, StackOverflow, etc.).
* **Snapshot Recording:** Save your current workspace state by naming it (e.g., "Algorithm Homework", "Project X").
* **One-Click Restore:** Automatically re-opens your saved tabs with their specific URLs, even if the browser was closed.
* **Persistent Memory:** Your data remains saved even after the application is closed.
* **Management:** Easily delete old or unnecessary records.

## 🚀 Installation (For End Users)

If you just want to use the program without dealing with the code:

1.  Go to the **[Releases]** section on the right side of this page.
2.  Download the latest release file: `Context Bot Setup 1.0.0.exe`.
3.  Run the file to install the application.

> **Important Note:** You must manually install the browser extension to track Chrome tabs (See below).

## 🛠 Developer Setup (Running from Source)

If you want to contribute to the project or inspect the code:

1.  Clone the repository:
    ```bash
    git clone [https://github.com/YOUR_USERNAME/Context-bot.git](https://github.com/YOUR_USERNAME/Context-bot.git)
    cd Context-bot
    ```

2.  Install the necessary packages:
    ```bash
    npm install
    ```

3.  Start the application:
    ```bash
    npm start
    ```

## 🧩 Chrome Extension Setup (Required)

You need to load the `extension` folder into Chrome for the app to read browser tabs:

1.  Open Google Chrome and type `chrome://extensions/` in the address bar.
2.  Toggle on **Developer Mode** in the top right corner.
3.  Click the **Load unpacked** button.
4.  Select the `extension` folder located inside the project directory.
5.  Once the extension is loaded and the app is running, the connection will be established automatically.

## 🏗 Technologies Used

* **Electron.js:** For the desktop application.
* **React:** For the user interface.
* **WebSocket (ws):** For communication with the Chrome extension.
* **PowerShell:** For Windows window management.

## ⚠️ Compatibility

Full performance (and the most testing) is on **Windows**. Basic OS window scanning is also implemented for **macOS** (via `osascript`/AppleScript) and **Linux** (via `wmctrl` — install it with e.g. `sudo apt install wmctrl` if it's missing). Chrome tab tracking works the same on all platforms. Mac/Linux support is newer and less battle-tested than Windows, so feedback/issues are welcome.

