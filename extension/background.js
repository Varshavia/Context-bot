'use strict';

/**
 * Context Bot Bridge — MV3 service worker.
 *
 * Maintains a WebSocket connection to the Context Bot desktop app and:
 *   - reports the current tab list whenever tabs change,
 *   - opens tabs when the app sends an 'open-tabs' restore command,
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
        const urls = (message.payload.urls || []).filter((url) =>
            SAFE_URL_PATTERN.test(url),
        );
        console.log(`[bridge] Restoring ${urls.length} tabs`);
        for (const url of urls) {
            chrome.tabs.create({ url, active: false });
        }
    }
}

/** Reports the full tab list (titles + URLs) to the desktop app. */
async function sendTabs() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try {
        const tabs = await chrome.tabs.query({});
        const payload = tabs.map((tab) => ({ title: tab.title, url: tab.url }));
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
