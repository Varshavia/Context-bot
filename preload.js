'use strict';

/**
 * Preload script: runs in an isolated context and exposes only the specific,
 * whitelisted IPC calls the renderer needs via contextBridge. The renderer
 * never gets direct Node.js or Electron access.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('contextBot', {
    /** @returns {Promise<Array<object>>} All persisted snapshots. */
    loadSnapshots: () => ipcRenderer.invoke('snapshots:load'),

    /** @returns {Promise<{osWindows: string[], chromeTabs: Array<{title: string, url: string}>}>} */
    scanWindows: () => ipcRenderer.invoke('windows:scan'),

    /**
     * @param {string} name
     * @param {string[]} osWindows Window titles from the latest scan.
     * @returns {Promise<Array<object>>} The updated snapshot list.
     */
    saveSnapshot: (name, osWindows) =>
        ipcRenderer.invoke('snapshots:save', { name, osWindows }),

    /**
     * Re-captures an existing snapshot with the current workspace state.
     * @param {number} id
     * @param {string[]} osWindows Window titles from the latest scan.
     * @returns {Promise<Array<object>>} The updated snapshot list.
     */
    updateSnapshot: (id, osWindows) =>
        ipcRenderer.invoke('snapshots:update', { id, osWindows }),

    /** @returns {Promise<Array<object>>} The updated snapshot list. */
    renameSnapshot: (id, name) => ipcRenderer.invoke('snapshots:rename', { id, name }),

    /** @returns {Promise<{restored: number, method: string, apps: string[]}>} */
    restoreSnapshot: (id) => ipcRenderer.invoke('snapshots:restore', id),

    /** @returns {Promise<Array<object>>} The updated snapshot list. */
    deleteSnapshot: (id) => ipcRenderer.invoke('snapshots:delete', id),

    /** @returns {Promise<boolean>} Whether the Chrome extension is connected. */
    isExtensionConnected: () => ipcRenderer.invoke('extension:is-connected'),

    /** Subscribes to live extension connect/disconnect events. */
    onExtensionStatus: (callback) => {
        ipcRenderer.on('extension:status', (_event, connected) => callback(connected));
    },

    /** Subscribes to snapshot changes made outside the UI (e.g. the tray). */
    onSnapshotsChanged: (callback) => {
        ipcRenderer.on('snapshots:changed', (_event, snapshots) => callback(snapshots));
    },
});
