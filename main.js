'use strict';

/**
 * Context Bot — Electron main process.
 *
 * Responsibilities:
 *   - Application lifecycle, window creation and the system tray.
 *   - IPC endpoints consumed by the renderer (invoke/handle pattern).
 *   - Wiring between the snapshot store, the OS window scanner, the app
 *     launcher and the WebSocket bridge that talks to the Chrome extension.
 */

const {
    app,
    BrowserWindow,
    Menu,
    Tray,
    nativeImage,
    ipcMain,
    shell,
} = require('electron');
const path = require('path');

const { ExtensionBridge } = require('./src/extension-bridge');
const { SnapshotStore } = require('./src/snapshot-store');
const { getOsWindowTitles } = require('./src/window-scanner');
const { relaunchApps } = require('./src/app-launcher');

// Only http(s) URLs are ever reopened. This keeps restore from launching
// arbitrary protocol handlers (file:, chrome:, custom app schemes, ...).
const SAFE_URL_PATTERN = /^https?:\/\//i;

// How many snapshots the tray's restore submenu lists.
const TRAY_SNAPSHOT_LIMIT = 8;

const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

let mainWindow = null;
let tray = null;
let store = null;
// Distinguishes "user closed the window" (hide to tray) from a real quit.
let isQuitting = false;

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
    app.on('second-instance', showMainWindow);

    app.whenReady().then(async () => {
        store = new SnapshotStore(path.join(app.getPath('userData'), 'snapshots.json'));
        setupApplicationMenu();
        bridge.start();
        registerIpcHandlers();
        createWindow();
        await setupTray();
        initAutoUpdater();

        app.on('activate', () => {
            // macOS: re-create or reveal the window when the dock icon is clicked.
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
            else showMainWindow();
        });
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        // Windows/macOS take the app icon from the installer bundle; Linux
        // needs it set explicitly for the window/taskbar icon.
        icon: ICON_PATH,
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

    // Closing the window keeps the app alive in the tray; quitting happens
    // explicitly through the tray menu (or Cmd+Q on macOS).
    mainWindow.on('close', (event) => {
        if (!isQuitting && tray) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
        return;
    }
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
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

/* ------------------------------------------------------------------ *
 * System tray
 * ------------------------------------------------------------------ */

async function setupTray() {
    const icon = nativeImage
        .createFromPath(ICON_PATH)
        .resize({ width: 16, height: 16 });

    if (icon.isEmpty()) {
        console.warn('[tray] Icon could not be loaded; tray disabled.');
        return;
    }

    tray = new Tray(icon);
    tray.setToolTip('Context Bot');
    tray.on('click', showMainWindow);
    await refreshTrayMenu();
}

/** Rebuilds the tray menu so its restore list reflects the current snapshots. */
async function refreshTrayMenu() {
    if (!tray) return;

    const snapshots = await store.load();
    const recent = [...snapshots].reverse().slice(0, TRAY_SNAPSHOT_LIMIT);

    const restoreItems = recent.length
        ? recent.map((snapshot) => ({
              label: snapshot.name,
              click: () => restoreSnapshot(snapshot.id),
          }))
        : [{ label: 'No snapshots yet', enabled: false }];

    tray.setContextMenu(
        Menu.buildFromTemplate([
            { label: 'Open Context Bot', click: showMainWindow },
            { type: 'separator' },
            { label: 'Quick Snapshot', click: takeQuickSnapshot },
            { label: 'Restore', submenu: restoreItems },
            { type: 'separator' },
            {
                label: 'Quit',
                click: () => {
                    isQuitting = true;
                    app.quit();
                },
            },
        ]),
    );
}

/** Saves a timestamped snapshot straight from the tray, without the UI. */
async function takeQuickSnapshot() {
    const osWindows = await getOsWindowTitles();
    const name = `Quick snapshot — ${new Date().toLocaleString()}`;

    const snapshots = await store.add({
        name,
        osWindows,
        chromeTabs: bridge.getTabs(),
    });

    notifyRenderer(snapshots);
    await refreshTrayMenu();
}

/** Pushes a fresh snapshot list to the renderer after a tray-driven change. */
function notifyRenderer(snapshots) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('snapshots:changed', snapshots);
    }
}

/* ------------------------------------------------------------------ *
 * Restore
 * ------------------------------------------------------------------ */

/**
 * Groups a snapshot's tabs by the browser window they came from, so the
 * extension can recreate the original window layout.
 * @returns {string[][]} Groups of safe URLs, one per original window.
 */
function groupTabsByWindow(chromeTabs = []) {
    const groups = new Map();

    for (const tab of chromeTabs) {
        if (!SAFE_URL_PATTERN.test(tab.url || '')) continue;
        // Tabs saved before window tracking existed share a single group.
        const key = Number.isInteger(tab.windowId) ? tab.windowId : 'legacy';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(tab.url);
    }

    return [...groups.values()];
}

/**
 * Restores a snapshot: browser tabs first (via the extension when connected,
 * otherwise the default browser), then any known desktop applications.
 * @returns {Promise<{restored: number, method: string, apps: string[]}>}
 */
async function restoreSnapshot(id) {
    const snapshot = await store.get(id);
    if (!snapshot) {
        return { restored: 0, method: 'none', apps: [] };
    }

    const windows = groupTabsByWindow(snapshot.chromeTabs);
    const urls = windows.flat();

    let method = 'none';
    if (urls.length > 0) {
        if (bridge.requestOpenTabs(windows)) {
            method = 'extension';
        } else {
            await Promise.all(urls.map((url) => shell.openExternal(url)));
            method = 'shell';
        }
    }

    const apps = await relaunchApps(snapshot.osWindows);

    console.log(
        `[main] Restored "${snapshot.name}": ${urls.length} tabs (${method}), ` +
            `${apps.length} apps`,
    );

    return { restored: urls.length, method, apps };
}

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */

function registerIpcHandlers() {
    /** Returns all persisted snapshots. */
    ipcMain.handle('snapshots:load', () => store.load());

    /**
     * Scans OS windows and combines them with the live Chrome tab list.
     * Returns { osWindows: string[], chromeTabs: [{title, url, windowId}] }.
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
    ipcMain.handle('snapshots:save', async (_event, { name, osWindows = [] } = {}) => {
        const snapshots = await store.add({
            name,
            osWindows,
            chromeTabs: bridge.getTabs(),
        });
        await refreshTrayMenu();
        return snapshots;
    });

    /** Re-captures an existing snapshot with the current workspace state. */
    ipcMain.handle('snapshots:update', async (_event, { id, osWindows = [] } = {}) => {
        const snapshots = await store.update(id, {
            osWindows,
            chromeTabs: bridge.getTabs(),
        });
        await refreshTrayMenu();
        return snapshots;
    });

    /** Renames a snapshot. */
    ipcMain.handle('snapshots:rename', async (_event, { id, name } = {}) => {
        const snapshots = await store.rename(id, name);
        await refreshTrayMenu();
        return snapshots;
    });

    /** Deletes a snapshot and returns the updated list. */
    ipcMain.handle('snapshots:delete', async (_event, id) => {
        const snapshots = await store.remove(id);
        await refreshTrayMenu();
        return snapshots;
    });

    /** Restores a snapshot's tabs and known applications. */
    ipcMain.handle('snapshots:restore', (_event, id) => restoreSnapshot(id));

    /** Lets the renderer render the correct badge on first paint. */
    ipcMain.handle('extension:is-connected', () => bridge.isConnected());
}

/* ------------------------------------------------------------------ *
 * Updates and lifecycle
 * ------------------------------------------------------------------ */

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

app.on('before-quit', () => {
    isQuitting = true;
});

app.on('window-all-closed', () => {
    // With a tray icon the app intentionally keeps running in the background.
    if (process.platform !== 'darwin' && !tray) app.quit();
});

app.on('will-quit', () => {
    bridge.stop();
});
