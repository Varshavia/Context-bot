'use strict';

/**
 * SnapshotStore
 * -------------
 * Persists workspace snapshots as JSON on disk. All reads/writes are async,
 * and writes are atomic (write to a temp file, then rename) so a crash
 * mid-write can never corrupt the snapshot file.
 *
 * Snapshot shape:
 *   {
 *     id:        number   // Date.now() at creation time
 *     name:      string
 *     osWindows: string[] // window titles captured at save time
 *     chromeTabs:[{ title: string, url: string, windowId: number | null }]
 *     createdAt: string   // ISO 8601
 *     updatedAt?: string  // ISO 8601, set when the snapshot is re-captured
 *   }
 */

const fs = require('fs/promises');
const path = require('path');

const MAX_NAME_LENGTH = 100;

class SnapshotStore {
    /** @param {string} filePath Absolute path of the JSON storage file. */
    constructor(filePath) {
        this.filePath = filePath;
        // Serializes writes so concurrent IPC calls cannot interleave.
        this.writeQueue = Promise.resolve();
    }

    /** @returns {Promise<Array<object>>} All snapshots, oldest first. */
    async load() {
        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            const data = JSON.parse(raw);
            return Array.isArray(data) ? data : [];
        } catch (err) {
            if (err.code !== 'ENOENT') {
                console.error('[store] Failed to read snapshot file:', err.message);
            }
            return [];
        }
    }

    /**
     * Creates and persists a new snapshot.
     * @param {{ name: string, osWindows?: string[], chromeTabs?: object[] }} input
     * @returns {Promise<Array<object>>} The updated snapshot list.
     */
    async add({ name, osWindows = [], chromeTabs = [] }) {
        const trimmed = String(name || '')
            .trim()
            .slice(0, MAX_NAME_LENGTH);
        if (!trimmed) {
            throw new Error('Snapshot name must not be empty.');
        }

        const snapshot = {
            id: Date.now(),
            name: trimmed,
            osWindows,
            chromeTabs,
            createdAt: new Date().toISOString(),
        };

        const snapshots = await this.load();
        snapshots.push(snapshot);
        await this.persist(snapshots);
        return snapshots;
    }

    /**
     * Re-captures an existing snapshot with the current workspace state,
     * keeping its id and name.
     * @param {number} id
     * @param {{ osWindows?: string[], chromeTabs?: object[] }} state
     * @returns {Promise<Array<object>>} The updated snapshot list.
     */
    async update(id, { osWindows = [], chromeTabs = [] }) {
        const snapshots = await this.load();
        const target = snapshots.find((snapshot) => snapshot.id === id);
        if (!target) {
            throw new Error(`Snapshot ${id} not found.`);
        }

        target.osWindows = osWindows;
        target.chromeTabs = chromeTabs;
        target.updatedAt = new Date().toISOString();

        await this.persist(snapshots);
        return snapshots;
    }

    /**
     * Renames an existing snapshot.
     * @param {number} id
     * @param {string} name
     * @returns {Promise<Array<object>>} The updated snapshot list.
     */
    async rename(id, name) {
        const trimmed = String(name || '')
            .trim()
            .slice(0, MAX_NAME_LENGTH);
        if (!trimmed) {
            throw new Error('Snapshot name must not be empty.');
        }

        const snapshots = await this.load();
        const target = snapshots.find((snapshot) => snapshot.id === id);
        if (!target) {
            throw new Error(`Snapshot ${id} not found.`);
        }

        target.name = trimmed;
        await this.persist(snapshots);
        return snapshots;
    }

    /**
     * Deletes a snapshot by id.
     * @param {number} id
     * @returns {Promise<Array<object>>} The updated snapshot list.
     */
    async remove(id) {
        const snapshots = await this.load();
        const remaining = snapshots.filter((snapshot) => snapshot.id !== id);
        if (remaining.length !== snapshots.length) {
            await this.persist(remaining);
        }
        return remaining;
    }

    /**
     * Finds a snapshot by id.
     * @param {number} id
     * @returns {Promise<object | undefined>}
     */
    async get(id) {
        const snapshots = await this.load();
        return snapshots.find((snapshot) => snapshot.id === id);
    }

    /** Atomically writes the snapshot list to disk. */
    persist(snapshots) {
        this.writeQueue = this.writeQueue.then(async () => {
            const tmpPath = `${this.filePath}.tmp`;
            await fs.mkdir(path.dirname(this.filePath), { recursive: true });
            await fs.writeFile(tmpPath, JSON.stringify(snapshots, null, 2), 'utf8');
            await fs.rename(tmpPath, this.filePath);
        });
        return this.writeQueue;
    }
}

module.exports = { SnapshotStore };
