# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - Unreleased

### Added

- Auto-update on Windows and Linux via electron-updater: packaged builds check GitHub Releases and notify when a new version is available.
- Empty-state screens that guide first-time users through the scan → snapshot → restore workflow.
- ESLint + Prettier configuration with lint and format checks wired into CI.
- CONTRIBUTING guide, issue templates and this changelog.

### Changed

- Removed emoji icons from the interface for a cleaner look.
- The default Electron menu (File/Edit/View with developer tools) is hidden on Windows/Linux; macOS keeps a minimal native menu so system shortcuts work.
- The window no longer flashes white on launch (dark background + deferred show).

### Fixed

- Linux window/taskbar icon is now set explicitly on the BrowserWindow.

## [1.1.0] - 2026-07-20

### Added

- Restore now opens saved tabs directly inside Chrome through the extension (with default-browser fallback when the extension is not connected).
- Live extension connection badge in the UI.
- MV3 service-worker keepalive, so the extension stays connected reliably.
- Cross-platform packaging: Windows (NSIS), macOS (dmg/zip) and Linux (AppImage/deb) targets, built and released automatically via GitHub Actions on version tags.
- macOS (AppleScript) and Linux (wmctrl) window scanning alongside the existing Windows (PowerShell) support.

### Changed

- Codebase fully translated to English and reorganized into focused modules (`src/extension-bridge.js`, `src/snapshot-store.js`, `src/window-scanner.js`).
- IPC migrated to the invoke/handle request-response pattern.
- React is bundled locally (no CDN dependency); the renderer runs under a strict Content-Security-Policy.
- Snapshot writes are atomic and asynchronous.

### Security

- Renderer sandboxed with context isolation; only http(s) URLs are ever restored.

## [1.0.0]

### Added

- Initial release: scan open windows and Chrome tabs, save them as named snapshots, restore and delete snapshots. Windows-focused, with a WebSocket-connected Chrome extension for tab tracking.
