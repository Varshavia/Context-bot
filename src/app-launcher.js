'use strict';

/**
 * app-launcher
 * ------------
 * Relaunches desktop applications that were open when a snapshot was taken.
 *
 * Snapshots only store window *titles*, which vary by platform and by what the
 * app is doing ("index.js - Visual Studio Code" vs. plain "Code"). Rather than
 * guessing executables from arbitrary titles — which would mean running
 * user-controlled strings as shell commands — titles are matched against a
 * curated catalog of well-known applications, and only catalog entries are
 * ever launched.
 */

const { exec } = require('child_process');

/**
 * Known applications.
 *   keywords : lowercase substrings matched against the saved window title
 *   darwin   : application name for `open -a`
 *   win32    : executable/AppUserModelID for `start`
 *   linux    : binary name on PATH
 */
const APP_CATALOG = [
    {
        id: 'vscode',
        label: 'Visual Studio Code',
        keywords: ['visual studio code', 'vscode'],
        darwin: 'Visual Studio Code',
        win32: 'code',
        linux: 'code',
    },
    {
        id: 'terminal',
        label: 'Terminal',
        keywords: ['terminal'],
        darwin: 'Terminal',
        win32: 'wt',
        linux: 'x-terminal-emulator',
    },
    {
        id: 'iterm',
        label: 'iTerm',
        keywords: ['iterm'],
        darwin: 'iTerm',
        win32: null,
        linux: null,
    },
    {
        id: 'intellij',
        label: 'IntelliJ IDEA',
        keywords: ['intellij'],
        darwin: 'IntelliJ IDEA',
        win32: 'idea64',
        linux: 'idea',
    },
    {
        id: 'sublime',
        label: 'Sublime Text',
        keywords: ['sublime text'],
        darwin: 'Sublime Text',
        win32: 'sublime_text',
        linux: 'subl',
    },
    {
        id: 'slack',
        label: 'Slack',
        keywords: ['slack'],
        darwin: 'Slack',
        win32: 'slack',
        linux: 'slack',
    },
    {
        id: 'discord',
        label: 'Discord',
        keywords: ['discord'],
        darwin: 'Discord',
        win32: 'discord',
        linux: 'discord',
    },
    {
        id: 'notion',
        label: 'Notion',
        keywords: ['notion'],
        darwin: 'Notion',
        win32: 'notion',
        linux: 'notion',
    },
    {
        id: 'obsidian',
        label: 'Obsidian',
        keywords: ['obsidian'],
        darwin: 'Obsidian',
        win32: 'obsidian',
        linux: 'obsidian',
    },
    {
        id: 'spotify',
        label: 'Spotify',
        keywords: ['spotify'],
        darwin: 'Spotify',
        win32: 'spotify',
        linux: 'spotify',
    },
    {
        id: 'figma',
        label: 'Figma',
        keywords: ['figma'],
        darwin: 'Figma',
        win32: 'figma',
        linux: null,
    },
    {
        id: 'postman',
        label: 'Postman',
        keywords: ['postman'],
        darwin: 'Postman',
        win32: 'postman',
        linux: 'postman',
    },
];

/**
 * Maps saved window titles to unique, launchable catalog entries.
 * @param {string[]} windowTitles
 * @returns {Array<{id: string, label: string}>}
 */
function matchApps(windowTitles) {
    const matched = new Map();

    for (const title of windowTitles || []) {
        if (typeof title !== 'string') continue;
        const haystack = title.toLowerCase();

        for (const app of APP_CATALOG) {
            if (matched.has(app.id)) continue;
            if (!app[process.platform]) continue; // Not launchable here.
            if (app.keywords.some((keyword) => haystack.includes(keyword))) {
                matched.set(app.id, app);
            }
        }
    }

    return [...matched.values()];
}

/** Builds the platform-specific launch command for a catalog entry. */
function buildCommand(app) {
    const target = app[process.platform];
    if (!target) return null;

    switch (process.platform) {
        case 'darwin':
            return `open -a ${JSON.stringify(target)}`;
        case 'win32':
            // `start` needs an explicit (empty) window title argument first.
            return `start "" ${JSON.stringify(target)}`;
        case 'linux':
            return `${target} &`;
        default:
            return null;
    }
}

/**
 * Relaunches every known application found in the saved window titles.
 * Failures are logged and skipped — a missing app must never break a restore.
 * @param {string[]} windowTitles
 * @returns {Promise<string[]>} Labels of the applications that were launched.
 */
async function relaunchApps(windowTitles) {
    const apps = matchApps(windowTitles);
    const launched = [];

    await Promise.all(
        apps.map(
            (app) =>
                new Promise((resolve) => {
                    const command = buildCommand(app);
                    if (!command) return resolve();

                    exec(command, { timeout: 10_000 }, (err) => {
                        if (err) {
                            console.warn(
                                `[launcher] Could not start ${app.label}:`,
                                err.message,
                            );
                        } else {
                            launched.push(app.label);
                        }
                        resolve();
                    });
                }),
        ),
    );

    return launched;
}

module.exports = { relaunchApps, matchApps, APP_CATALOG };
