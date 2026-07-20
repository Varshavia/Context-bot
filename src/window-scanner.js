'use strict';

/**
 * window-scanner
 * --------------
 * Lists the titles of visible OS-level windows, using the native tooling
 * available on each platform:
 *
 *   - Windows : PowerShell (Get-Process MainWindowTitle)
 *   - macOS   : AppleScript via osascript (visible process names)
 *   - Linux   : wmctrl (degrades gracefully when not installed)
 */

const { exec } = require('child_process');

const EXEC_OPTIONS = { maxBuffer: 1024 * 1024, timeout: 10_000 };

// Windows belonging to these apps are excluded from scan results: the app's
// own window is noise, and Chrome windows are already covered tab-by-tab
// through the browser extension.
const IGNORED_TITLE_PATTERNS = ['Google Chrome', 'Context Bot'];

/**
 * Runs a shell command and resolves with its stdout, or '' on failure.
 * Scanning is best-effort: a failure should never crash the app.
 */
function run(command) {
    return new Promise((resolve) => {
        exec(command, EXEC_OPTIONS, (err, stdout) => {
            resolve(err || !stdout ? '' : stdout);
        });
    });
}

async function scanWindowsPlatform() {
    const cmd =
        'powershell "Get-Process | Where-Object {$_.MainWindowTitle} | ' +
        'Select-Object -ExpandProperty MainWindowTitle"';
    const stdout = await run(cmd);
    return stdout
        .split('\r\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

async function scanMacOsPlatform() {
    const cmd =
        `osascript -e 'tell application "System Events" to ` +
        `get name of every process whose visible is true'`;
    const stdout = await run(cmd);
    // AppleScript returns a comma-separated list, e.g. "Finder, Safari, Terminal".
    return stdout
        .split(',')
        .map((line) => line.trim())
        .filter(Boolean);
}

async function scanLinuxPlatform() {
    // Requires wmctrl (e.g. `sudo apt install wmctrl`). If it is missing we
    // degrade gracefully to an empty list instead of crashing.
    const stdout = await run('wmctrl -l');
    if (!stdout) {
        console.warn(
            "[scanner] 'wmctrl' not found or failed. " +
                'Install it for Linux window scanning: sudo apt install wmctrl',
        );
        return [];
    }
    // wmctrl -l columns: <window id> <desktop> <client machine> <title...>
    return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(/\s+/).slice(3).join(' ').trim())
        .filter(Boolean);
}

/**
 * Scans visible OS windows on the current platform.
 * @returns {Promise<string[]>} Deduplicated, filtered window titles.
 */
async function getOsWindowTitles() {
    let titles = [];

    switch (process.platform) {
        case 'win32':
            titles = await scanWindowsPlatform();
            break;
        case 'darwin':
            titles = await scanMacOsPlatform();
            break;
        case 'linux':
            titles = await scanLinuxPlatform();
            break;
        default:
            // Unknown platform: no OS-level window scanning available.
            return [];
    }

    const filtered = titles.filter(
        (title) =>
            title.length > 2 &&
            !IGNORED_TITLE_PATTERNS.some((pattern) => title.includes(pattern)),
    );
    return [...new Set(filtered)];
}

module.exports = { getOsWindowTitles };
