'use strict';

/**
 * Context Bot — renderer (React, no build step).
 *
 * Uses React.createElement directly so the app runs without a bundler or
 * JSX transform. All privileged operations go through the `window.contextBot`
 * API exposed by the preload script.
 */

const { useState, useEffect, useCallback, useMemo } = React;
const e = React.createElement;

/** Formats a snapshot's creation time, supporting both current (ISO
 *  `createdAt`) and legacy (`timestamp` string) snapshot formats. */
function formatCreatedAt(snapshot) {
    if (snapshot.createdAt) return new Date(snapshot.createdAt).toLocaleString();
    return snapshot.timestamp || '';
}

function formatMeta(snapshot) {
    const created = formatCreatedAt(snapshot);
    if (!snapshot.updatedAt) return created;
    return `${created} · updated ${new Date(snapshot.updatedAt).toLocaleString()}`;
}

function summarize(snapshot) {
    const tabs = snapshot.chromeTabs || [];
    const windowCount = (snapshot.osWindows || []).length;
    const browserWindows = new Set(
        tabs.map((tab) => (Number.isInteger(tab.windowId) ? tab.windowId : 'legacy')),
    ).size;

    const parts = [];
    if (tabs.length) {
        const across =
            browserWindows > 1 ? ` across ${browserWindows} browser windows` : '';
        parts.push(`${tabs.length} tab${tabs.length === 1 ? '' : 's'}${across}`);
    }
    if (windowCount) parts.push(`${windowCount} window${windowCount === 1 ? '' : 's'}`);
    return parts.length ? `${parts.join(', ')} saved.` : 'No window data saved.';
}

/** Builds the status line shown after a restore. */
function describeRestore(snapshot, result) {
    const parts = [];
    if (result.restored > 0) {
        parts.push(
            result.method === 'extension'
                ? `Restored ${result.restored} tabs in Chrome`
                : `Opened ${result.restored} tabs in the default browser`,
        );
    }
    if (result.apps && result.apps.length) {
        parts.push(`launched ${result.apps.join(', ')}`);
    }
    return parts.length
        ? `${parts.join(' and ')}.`
        : `"${snapshot.name}" had nothing to restore.`;
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

/** A single saved snapshot, with inline renaming. */
function SnapshotCard({ snapshot, onRestore, onUpdate, onDelete, onRename }) {
    const [isRenaming, setIsRenaming] = useState(false);
    const [draftName, setDraftName] = useState(snapshot.name);

    const commitRename = () => {
        const name = draftName.trim();
        if (name && name !== snapshot.name) onRename(snapshot, name);
        setIsRenaming(false);
    };

    const nameNode = isRenaming
        ? e('input', {
              className: 'rename-input',
              value: draftName,
              autoFocus: true,
              onChange: (event) => setDraftName(event.target.value),
              onBlur: commitRename,
              onKeyDown: (event) => {
                  if (event.key === 'Enter') commitRename();
                  if (event.key === 'Escape') {
                      setDraftName(snapshot.name);
                      setIsRenaming(false);
                  }
              },
          })
        : e(
              'div',
              {
                  className: 'snapshot-name',
                  title: 'Click to rename',
                  onClick: () => {
                      setDraftName(snapshot.name);
                      setIsRenaming(true);
                  },
              },
              snapshot.name,
          );

    return e('div', { className: 'snapshot-card' }, [
        e('div', { className: 'snapshot-header', key: 'head' }, [
            e('div', { key: 'meta', className: 'snapshot-meta' }, [
                e('div', { key: 'name' }, nameNode),
                e(
                    'div',
                    { className: 'snapshot-date', key: 'date' },
                    formatMeta(snapshot),
                ),
            ]),
            e('div', { key: 'actions', className: 'snapshot-actions' }, [
                e(
                    'button',
                    {
                        className: 'restore-btn',
                        onClick: () => onRestore(snapshot),
                        key: 'restore',
                    },
                    'Restore',
                ),
                e(
                    'button',
                    {
                        className: 'update-btn',
                        title: 'Replace this snapshot with your current workspace',
                        onClick: () => onUpdate(snapshot),
                        key: 'update',
                    },
                    'Update',
                ),
                e(
                    'button',
                    {
                        className: 'delete-btn',
                        onClick: () => onDelete(snapshot),
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
    ]);
}

function App() {
    const [scan, setScan] = useState({ osWindows: [], chromeTabs: [] });
    const [hasScanned, setHasScanned] = useState(false);
    const [snapshotName, setSnapshotName] = useState('');
    const [snapshots, setSnapshots] = useState([]);
    const [query, setQuery] = useState('');
    const [extensionConnected, setExtensionConnected] = useState(false);
    const [notice, setNotice] = useState('');

    useEffect(() => {
        // Load persisted snapshots and the current extension status on startup.
        window.contextBot.loadSnapshots().then(setSnapshots);
        window.contextBot.isExtensionConnected().then(setExtensionConnected);
        window.contextBot.onExtensionStatus(setExtensionConnected);
        // Snapshots can also change from the tray menu while the UI is open.
        window.contextBot.onSnapshotsChanged(setSnapshots);
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
        setNotice(describeRestore(snapshot, result));
    }, []);

    const handleUpdate = useCallback(async (snapshot) => {
        // Re-scan first so the refresh captures the workspace as it is now.
        const current = await window.contextBot.scanWindows();
        setScan(current);
        setHasScanned(true);
        const updated = await window.contextBot.updateSnapshot(
            snapshot.id,
            current.osWindows,
        );
        setSnapshots(updated);
        setNotice(`"${snapshot.name}" updated with your current workspace.`);
    }, []);

    const handleRename = useCallback(async (snapshot, name) => {
        const updated = await window.contextBot.renameSnapshot(snapshot.id, name);
        setSnapshots(updated);
        setNotice(`Renamed to "${name}".`);
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

    // Search matches snapshot names as well as the titles they contain.
    const visibleSnapshots = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return snapshots;
        return snapshots.filter((snapshot) => {
            const haystack = [
                snapshot.name,
                ...(snapshot.osWindows || []),
                ...(snapshot.chromeTabs || []).map((tab) => tab.title),
            ]
                .join(' ')
                .toLowerCase();
            return haystack.includes(needle);
        });
    }, [snapshots, query]);

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
                e('div', { className: 'snapshots-header', key: 'snapshots-title' }, [
                    e(
                        'h3',
                        { className: 'section-title', key: 'title' },
                        'Saved Snapshots',
                    ),
                    e('input', {
                        key: 'search',
                        className: 'search-input',
                        type: 'search',
                        placeholder: 'Search snapshots...',
                        value: query,
                        onChange: (event) => setQuery(event.target.value),
                    }),
                ]),
                visibleSnapshots.length === 0
                    ? e(
                          'div',
                          { className: 'empty-state', key: 'empty-search' },
                          `No snapshots match "${query}".`,
                      )
                    : visibleSnapshots.map((snapshot) =>
                          e(SnapshotCard, {
                              key: snapshot.id,
                              snapshot,
                              onRestore: handleRestore,
                              onUpdate: handleUpdate,
                              onRename: handleRename,
                              onDelete: handleDelete,
                          }),
                      ),
            ]),
    ]);
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(e(App));
