// Preload script: runs in an isolated context with access to Node APIs,
// and exposes only the specific IPC calls the renderer actually needs via
// contextBridge. This replaces the previous nodeIntegration:true /
// contextIsolation:false setup, which gave the renderer (and any script
// that ever ends up running in it) full Node.js access — an unnecessary
// security risk for a desktop app that only needs a handful of IPC calls.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('contextBot', {
    loadSnapshots: () => ipcRenderer.send('load-snapshots'),
    scanWindows: () => ipcRenderer.send('scan-windows'),
    saveSnapshot: (name) => ipcRenderer.send('save-snapshot', { name }),
    restoreSnapshot: (id) => ipcRenderer.send('restore-snapshot', id),
    deleteSnapshot: (id) => ipcRenderer.send('delete-snapshot', id),

    onScanResults: (callback) => {
        ipcRenderer.on('scan-results', (_event, results) => callback(results));
    },
    onSnapshotSaved: (callback) => {
        ipcRenderer.on('snapshot-saved', (_event, snapshots) => callback(snapshots));
    },
});
