'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        ignores: ['node_modules/**', 'dist/**', 'public/vendor/**'],
    },
    js.configs.recommended,
    {
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
        },
    },
    // Main process and shared modules run under Node.js (CommonJS).
    {
        files: ['main.js', 'preload.js', 'src/**/*.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: globals.node,
        },
    },
    // Renderer runs in Chromium with React loaded as a global (UMD).
    {
        files: ['public/renderer.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                React: 'readonly',
                ReactDOM: 'readonly',
                contextBot: 'readonly',
            },
        },
    },
    // Extension service worker runs in Chrome with the extension API.
    {
        files: ['extension/background.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                ...globals.serviceworker,
                chrome: 'readonly',
            },
        },
    },
];
