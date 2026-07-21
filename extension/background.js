'use strict';

/**
 * Context Bot Bridge — MV3 service worker.
 *
 * Maintains a WebSocket connection to the Context Bot desktop app and:
 *   - reports the current tab list (with window grouping) whenever tabs change,
 *   - opens tabs when the app sends an 'open-tabs' restore command, recreating
 *     the original browser window layout when the app provides one,
 *   - sends periodic pings, which doubles as the MV3 keepalive (an active
 *     WebSocket with regular traffic keeps the service worker alive).
 */

const SERVER_URL = 'ws://localhost:8080';
const RECONNECT_DELAY_MS = 3000;
const KEEPALIVE_INTERVAL_MS = 20000;

// Only http(s) URLs are ever opened from restore commands.
const SAFE_URL_PATTERN = /^https?:\/\//i;

let socket = null;
let keepAliveTimer = null;
let reconnectTimer = null;

function connect() {
    // Clean up any previous connection attempt.
    if (socket) {
        socket.onclose = null; // Prevent the old handler from scheduling reconnects.
        socket.close();
        socket = null;
    }

    try {
        socket = new WebSocket(SERVER_URL);
    } catch {
        scheduleReconnect();
        return;
    }

    socket.onopen = () => {
        console.log('[bridge] Connected to Context Bot');
        sendTabs();
        startKeepAlive();
    };

    socket.onmessage = (event) => handleServerMessage(event.data);

    socket.onclose = () => {
        console.log('[bridge] Connection closed, retrying in 3 seconds...');
        stopKeepAlive();
        scheduleReconnect();
    };

    socket.onerror = () => {
        // Swallow the error event (Chrome logs a warning otherwise) and let
        // onclose drive the reconnect.
        if (socket) socket.close();
    };
}

function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
}

function startKeepAlive() {
    stopKeepAlive();
    keepAliveTimer = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
        }
    }, KEEPALIVE_INTERVAL_MS);
}

function stopKeepAlive() {
    if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
    }
}

/** Handles commands sent by the desktop app. */
function handleServerMessage(raw) {
    let message;
    try {
        message = JSON.parse(raw);
    } catch (err) {
        console.error('[bridge] Malformed message from app:', err);
        return;
    }

    if (message.type === 'open-tabs' && message.payload) {
        restoreTabs(message.payload);
    }
}

/**
 * Restores tabs. When the app sends a `windows` array (a list of URL groups)
 * each group is opened as its own browser window, reproducing the layout the
 * snapshot was taken with. Otherwise every URL is opened in the current window.
 */
function restoreTabs(payload) {
    const groups = Array.isArray(payload.windows)
        ? payload.windows
              .map((group) => (group || []).filter(isSafeUrl))
              .filter((group) => group.length > 0)
        : [];

    if (groups.length > 0) {
        const total = groups.reduce((sum, group) => sum + group.length, 0);
        console.log(`[bridge] Restoring ${total} tabs across ${groups.length} windows`);
        for (const urls of groups) {
            // chrome.windows.create accepts an array of URLs for the new window.
            chrome.windows.create({ url: urls });
        }
        return;
    }

    const urls = (payload.urls || []).filter(isSafeUrl);
    console.log(`[bridge] Restoring ${urls.length} tabs`);
    for (const url of urls) {
        chrome.tabs.create({ url, active: false });
    }
}

function isSafeUrl(url) {
    return typeof url === 'string' && SAFE_URL_PATTERN.test(url);
}

/**
 * Reports the full tab list to the desktop app. `windowId` is included so
 * snapshots can remember which tabs belonged to the same browser window.
 */
async function sendTabs() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try {
        const tabs = await chrome.tabs.query({});
        const payload = tabs.map((tab) => ({
            title: tab.title,
            url: tab.url,
            windowId: tab.windowId,
        }));
        socket.send(JSON.stringify({ type: 'tabs', payload }));
    } catch (err) {
        console.error('[bridge] Failed to read tabs:', err);
    }
}

// Tab lifecycle listeners — keep the app's tab list current.
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.status === 'complete') sendTabs();
});
chrome.tabs.onRemoved.addListener(() => sendTabs());
chrome.tabs.onMoved.addListener(() => sendTabs());

// Reconnect when the browser starts or the extension is (re)installed.
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);

connect();
