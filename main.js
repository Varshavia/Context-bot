'use strict';

/**
 * Context Bot — Electron main process.
 *
 * Responsibilities:
 *   - Application lifecycle and window creation.
 *   - IPC endpoints consumed by the renderer (invoke/handle pattern).
 *   - Wiring between the snapshot store, the OS window scanner and the
 *     WebSocket bridge that talks to the Chrome extension.
 */

const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');

const { ExtensionBridge } = require('./src/extension-bridge');
const { SnapshotStore } = require('./src/snapshot-store');
const { getOsWindowTitles } = require('./src/window-scanner');

// Only http(s) URLs are ever reopened. This keeps restore from launching
// arbitrary protocol handlers (file:, chrome:, custom app schemes, ...).
const SAFE_URL_PATTERN = /^https?:\/\//i;

let mainWindow = null;
let store = null;

const bridge = new ExtensionBridge({
    onStatusChange: (connected) => {
        // Push connection changes to the renderer so the UI badge stays live.
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('extension:status', connected);
        }
    },
});

// A second instance would fail to bind the WebSocket port and would fight
// over the snapshot file — enforce a single instance instead.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        store = new SnapshotStore(path.join(app.getPath('userData'), 'snapshots.json'));
        setupApplicationMenu();
        bridge.start();
        registerIpcHandlers();
        createWindow();
        initAutoUpdater();

        app.on('activate', () => {
            // macOS: re-create the window when the dock icon is clicked.
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        // Windows/macOS take the app icon from the installer bundle; Linux
        // needs it set explicitly for the window/taskbar icon.
        icon: path.join(__dirname, 'assets', 'icon.png'),
        // Match the UI theme and defer showing until the first paint so the
        // window never flashes white on launch.
        backgroundColor: '#121212',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function setupApplicationMenu() {
    if (process.platform === 'darwin') {
        // Keep a minimal native menu on macOS so standard shortcuts
        // (copy/paste, hide, quit) keep working.
        Menu.setApplicationMenu(
            Menu.buildFromTemplate([
                { role: 'appMenu' },
                { role: 'editMenu' },
                { role: 'windowMenu' },
            ]),
        );
    } else {
        // Hide the default File/Edit/View developer menu on Windows/Linux.
        Menu.setApplicationMenu(null);
    }
}

function initAutoUpdater() {
    // Auto-update only makes sense for packaged builds, and unsigned macOS
    // builds cannot apply updates (Squirrel.Mac requires a valid code
    // signature), so it is limited to Windows and Linux for now.
    if (!app.isPackaged || process.platform === 'darwin') return;

    let autoUpdater;
    try {
        ({ autoUpdater } = require('electron-updater'));
    } catch (err) {
        console.warn('[updater] electron-updater not available:', err.message);
        return;
    }

    autoUpdater.on('error', (err) => {
        // Update failures must never break the app — log and move on.
        console.error('[updater] Update check failed:', err.message);
    });
    autoUpdater.checkForUpdatesAndNotify();
}

function registerIpcHandlers() {
    /** Returns all persisted snapshots. */
    ipcMain.handle('snapshots:load', () => store.load());

    /**
     * Scans OS windows and combines them with the live Chrome tab list.
     * Returns { osWindows: string[], chromeTabs: [{title, url}] }.
     */
    ipcMain.handle('windows:scan', async () => {
        const osWindows = await getOsWindowTitles();
        return { osWindows, chromeTabs: bridge.getTabs() };
    });

    /**
     * Saves a new snapshot. Chrome tabs (with URLs) are captured from the
     * bridge at save time; OS window titles come from the renderer's last
     * scan so the list the user saw is exactly what gets saved.
     */
    ipcMain.handle('snapshots:save', (_event, { name, osWindows = [] } = {}) =>
        store.add({ name, osWindows, chromeTabs: bridge.getTabs() }),
    );

    /** Deletes a snapshot and returns the updated list. */
    ipcMain.handle('snapshots:delete', (_event, id) => store.remove(id));

    /**
     * Restores a snapshot's browser tabs.
     * Preferred path: ask the connected extension to open the tabs inside
     * Chrome. Fallback: open each URL with the default browser.
     * Returns { restored: number, method: 'extension' | 'shell' | 'none' }.
     */
    ipcMain.handle('snapshots:restore', async (_event, id) => {
        const snapshot = await store.get(id);
        if (!snapshot) {
            return { restored: 0, method: 'none' };
        }

        const urls = (snapshot.chromeTabs || [])
            .map((tab) => tab.url)
            .filter((url) => SAFE_URL_PATTERN.test(url));

        if (urls.length === 0) {
            return { restored: 0, method: 'none' };
        }

        console.log(
            `[main] Restoring context "${snapshot.name}" (${urls.length} tabs)`,
        );

        if (bridge.requestOpenTabs(urls)) {
            return { restored: urls.length, method: 'extension' };
        }

        await Promise.all(urls.map((url) => shell.openExternal(url)));
        return { restored: urls.length, method: 'shell' };
    });

    /** Lets the renderer render the correct badge on first paint. */
    ipcMain.handle('extension:is-connected', () => bridge.isConnected());
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    bridge.stop();
});
