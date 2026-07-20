'use strict';

/**
 * Context Bot — renderer (React, no build step).
 *
 * Uses React.createElement directly so the app runs without a bundler or
 * JSX transform. All privileged operations go through the `window.contextBot`
 * API exposed by the preload script.
 */

const { useState, useEffect, useCallback } = React;
const e = React.createElement;

/** Formats a snapshot's creation time, supporting both current (ISO
 *  `createdAt`) and legacy (`timestamp` string) snapshot formats. */
function formatCreatedAt(snapshot) {
    if (snapshot.createdAt) return new Date(snapshot.createdAt).toLocaleString();
    return snapshot.timestamp || '';
}

function summarize(snapshot) {
    const tabCount = (snapshot.chromeTabs || []).length;
    const windowCount = (snapshot.osWindows || []).length;
    const parts = [];
    if (tabCount) parts.push(`${tabCount} browser tab${tabCount === 1 ? '' : 's'}`);
    if (windowCount) parts.push(`${windowCount} window${windowCount === 1 ? '' : 's'}`);
    return parts.length ? `${parts.join(' and ')} saved.` : 'No window data saved.';
}

function StatusBadge({ connected }) {
    return e(
        'span',
        {
            className:
                'status-badge ' +
                (connected ? 'status-connected' : 'status-disconnected'),
            title: connected
                ? 'The Chrome extension is connected. Tabs will restore inside Chrome.'
                : 'Chrome extension not connected. Tabs will open in the default browser.',
        },
        connected ? 'Extension: connected' : 'Extension: not connected',
    );
}

function App() {
    const [scan, setScan] = useState({ osWindows: [], chromeTabs: [] });
    const [hasScanned, setHasScanned] = useState(false);
    const [snapshotName, setSnapshotName] = useState('');
    const [snapshots, setSnapshots] = useState([]);
    const [extensionConnected, setExtensionConnected] = useState(false);
    const [notice, setNotice] = useState('');

    useEffect(() => {
        // Load persisted snapshots and the current extension status on startup.
        window.contextBot.loadSnapshots().then(setSnapshots);
        window.contextBot.isExtensionConnected().then(setExtensionConnected);
        window.contextBot.onExtensionStatus(setExtensionConnected);
    }, []);

    const handleScan = useCallback(async () => {
        const results = await window.contextBot.scanWindows();
        setScan(results);
        setHasScanned(true);
        setNotice('');
    }, []);

    const handleSave = useCallback(async () => {
        const name = snapshotName.trim();
        if (!name) {
            setNotice('Please enter a snapshot name first.');
            return;
        }
        const updated = await window.contextBot.saveSnapshot(name, scan.osWindows);
        setSnapshots(updated);
        setSnapshotName('');
        setNotice(`Snapshot "${name}" saved.`);
    }, [snapshotName, scan.osWindows]);

    const handleRestore = useCallback(async (snapshot) => {
        const result = await window.contextBot.restoreSnapshot(snapshot.id);
        if (result.restored === 0) {
            setNotice(`"${snapshot.name}" has no restorable tabs.`);
        } else if (result.method === 'extension') {
            setNotice(`Restored ${result.restored} tabs in Chrome.`);
        } else {
            setNotice(`Opened ${result.restored} tabs in the default browser.`);
        }
    }, []);

    const handleDelete = useCallback(async (snapshot) => {
        if (!confirm(`Delete the "${snapshot.name}" context? This cannot be undone.`)) {
            return;
        }
        const updated = await window.contextBot.deleteSnapshot(snapshot.id);
        setSnapshots(updated);
    }, []);

    // Combined list shown to the user: OS windows + Chrome tabs.
    const detectedItems = [
        ...scan.osWindows,
        ...scan.chromeTabs.map((tab) => `[Chrome] ${tab.title}`),
    ];

    return e('div', null, [
        e('div', { className: 'header', key: 'header' }, [
            e('h1', { key: 'title' }, 'Context Bot'),
            e(StatusBadge, { connected: extensionConnected, key: 'badge' }),
        ]),

        // Toolbar: scan + save.
        e('div', { className: 'toolbar', key: 'toolbar' }, [
            e('button', { onClick: handleScan, key: 'scan' }, 'Scan Windows'),
            detectedItems.length > 0 &&
                e('div', { className: 'save-row', key: 'save-row' }, [
                    e('input', {
                        key: 'name-input',
                        placeholder: 'Snapshot name (e.g. "Algorithms homework")',
                        value: snapshotName,
                        onChange: (event) => setSnapshotName(event.target.value),
                        onKeyDown: (event) => {
                            if (event.key === 'Enter') handleSave();
                        },
                    }),
                    e(
                        'button',
                        { className: 'save-btn', onClick: handleSave, key: 'save' },
                        'Take Snapshot',
                    ),
                ]),
            notice && e('div', { className: 'notice', key: 'notice' }, notice),
        ]),

        // Empty states guide first-time users through the workflow.
        !hasScanned &&
            snapshots.length === 0 &&
            e(
                'div',
                { className: 'empty-state', key: 'empty-initial' },
                'Welcome! Click "Scan Windows" to detect your open windows and ' +
                    'Chrome tabs, then save them as a named snapshot you can ' +
                    'restore anytime.',
            ),

        hasScanned &&
            detectedItems.length === 0 &&
            e(
                'div',
                { className: 'empty-state', key: 'empty-scan' },
                'No windows or tabs detected. Make sure some applications are ' +
                    'open — and connect the Chrome extension to include browser tabs.',
            ),

        // Current scan results.
        detectedItems.length > 0 &&
            e('div', { key: 'detected' }, [
                e(
                    'h3',
                    { className: 'section-title', key: 'detected-title' },
                    'Detected Windows & Tabs',
                ),
                ...detectedItems.map((item, index) =>
                    e('div', { key: `item-${index}`, className: 'window-item' }, item),
                ),
            ]),

        // Saved snapshots.
        snapshots.length > 0 &&
            e('div', { key: 'snapshots' }, [
                e(
                    'h3',
                    { className: 'section-title', key: 'snapshots-title' },
                    'Saved Snapshots',
                ),
                ...snapshots.map((snapshot) =>
                    e('div', { key: snapshot.id, className: 'snapshot-card' }, [
                        e('div', { className: 'snapshot-header', key: 'head' }, [
                            e('div', { key: 'meta' }, [
                                e(
                                    'div',
                                    { className: 'snapshot-name', key: 'name' },
                                    snapshot.name,
                                ),
                                e(
                                    'div',
                                    { className: 'snapshot-date', key: 'date' },
                                    formatCreatedAt(snapshot),
                                ),
                            ]),
                            e('div', { key: 'actions' }, [
                                e(
                                    'button',
                                    {
                                        className: 'restore-btn',
                                        onClick: () => handleRestore(snapshot),
                                        key: 'restore',
                                    },
                                    'Restore',
                                ),
                                e(
                                    'button',
                                    {
                                        className: 'delete-btn',
                                        onClick: () => handleDelete(snapshot),
                                        key: 'delete',
                                    },
                                    'Delete',
                                ),
                            ]),
                        ]),
                        e(
                            'div',
                            { className: 'snapshot-summary', key: 'summary' },
                            summarize(snapshot),
                        ),
                    ]),
                ),
            ]),
    ]);
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(e(App));
