'use strict';

/**
 * ExtensionBridge
 * ---------------
 * Manages the WebSocket server that the Chrome extension connects to.
 *
 * Protocol (JSON messages):
 *   Extension -> App : { type: 'tabs', payload: [{ title, url }, ...] }
 *   Extension -> App : { type: 'ping' }                       (MV3 keepalive)
 *   App -> Extension : { type: 'open-tabs', payload: { urls: [...] } }
 *
 * A plain JSON array is also accepted as a tab list for backwards
 * compatibility with older versions of the extension.
 */

const { WebSocketServer } = require('ws');

const DEFAULT_PORT = 8080;

class ExtensionBridge {
    /**
     * @param {object} [options]
     * @param {number} [options.port] TCP port for the WebSocket server.
     * @param {(connected: boolean) => void} [options.onStatusChange]
     *        Called whenever the extension connects or disconnects.
     */
    constructor({ port = DEFAULT_PORT, onStatusChange } = {}) {
        this.port = port;
        this.onStatusChange = onStatusChange || (() => {});
        this.server = null;
        this.clients = new Set();
        this.tabs = []; // Latest tab list reported by the extension.
    }

    /** Starts the WebSocket server. Safe to call once at app startup. */
    start() {
        if (this.server) return;

        this.server = new WebSocketServer({ port: this.port });

        this.server.on('listening', () => {
            console.log(`[bridge] WebSocket server listening on port ${this.port}`);
        });

        this.server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(
                    `[bridge] Port ${this.port} is already in use. ` +
                    'Is another instance of Context Bot running?'
                );
            } else {
                console.error('[bridge] WebSocket server error:', err);
            }
        });

        this.server.on('connection', (socket) => {
            console.log('[bridge] Browser extension connected');
            this.clients.add(socket);
            this.onStatusChange(true);

            socket.on('message', (raw) => this.handleMessage(raw));

            socket.on('close', () => {
                this.clients.delete(socket);
                if (this.clients.size === 0) {
                    this.tabs = [];
                    this.onStatusChange(false);
                    console.log('[bridge] Browser extension disconnected');
                }
            });

            socket.on('error', (err) => {
                console.error('[bridge] Socket error:', err.message);
            });
        });
    }

    /** @param {import('ws').RawData} raw */
    handleMessage(raw) {
        let message;
        try {
            message = JSON.parse(raw.toString());
        } catch (err) {
            console.error('[bridge] Received malformed message:', err.message);
            return;
        }

        // Legacy extensions send the tab array directly.
        if (Array.isArray(message)) {
            this.tabs = this.sanitizeTabs(message);
            return;
        }

        switch (message.type) {
            case 'tabs':
                this.tabs = this.sanitizeTabs(message.payload);
                break;
            case 'ping':
                break; // Keepalive only — nothing to do.
            default:
                console.warn('[bridge] Unknown message type:', message.type);
        }
    }

    /** Keeps only well-formed { title, url } entries. */
    sanitizeTabs(payload) {
        if (!Array.isArray(payload)) return [];
        return payload
            .filter((tab) => tab && typeof tab.url === 'string')
            .map((tab) => ({
                title: typeof tab.title === 'string' ? tab.title : tab.url,
                url: tab.url,
            }));
    }

    /** @returns {boolean} Whether at least one extension client is connected. */
    isConnected() {
        return this.clients.size > 0;
    }

    /** @returns {Array<{title: string, url: string}>} Latest reported tabs. */
    getTabs() {
        return [...this.tabs];
    }

    /**
     * Asks the connected extension to open the given URLs as browser tabs.
     * @param {string[]} urls
     * @returns {boolean} true if the request was sent to at least one client.
     */
    requestOpenTabs(urls) {
        if (!this.isConnected()) return false;

        const message = JSON.stringify({ type: 'open-tabs', payload: { urls } });
        let sent = false;
        for (const client of this.clients) {
            if (client.readyState === client.OPEN) {
                client.send(message);
                sent = true;
            }
        }
        return sent;
    }

    /** Shuts the server down. Called on app quit. */
    stop() {
        for (const client of this.clients) client.terminate();
        this.clients.clear();
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}

module.exports = { ExtensionBridge, DEFAULT_PORT };
