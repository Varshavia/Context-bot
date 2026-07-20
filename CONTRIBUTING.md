# Contributing to Context Bot

Thanks for your interest in contributing! This document explains how to set up the project and what we expect from contributions.

## Getting Started

1. Fork the repository and clone your fork:
   ```bash
   git clone https://github.com/<your-username>/Context-bot.git
   cd Context-bot
   npm install
   ```

2. Run the app in development:
   ```bash
   npm start
   ```

3. To test Chrome tab tracking, load the `extension` folder as an unpacked extension (see the README for step-by-step instructions).

## Code Style

The project uses ESLint and Prettier. Before opening a pull request, make sure both pass:

```bash
npm run lint
npm run format:check
```

You can auto-format everything with `npm run format`. CI runs the same checks on every push and pull request, so a PR that fails them will not be merged.

Some conventions to keep in mind: the codebase is plain CommonJS with no build step, the renderer uses `React.createElement` directly (no JSX), and all user-facing text, comments and identifiers are written in English.

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) style used throughout the history:

```
feat(extension): implement tab restore command
fix(ci): sync package-lock version
refactor(ui): externalize renderer styles
```

Use `feat`, `fix`, `refactor`, `chore`, `docs`, `style` or `ci` as the type, with an optional scope in parentheses. Write the summary in the imperative mood and keep it under about 70 characters; use the body to explain *why* when the change is not obvious.

## Pull Requests

Keep pull requests focused on a single change. Describe what the PR does and how you tested it (including your OS, since window scanning is platform-specific). If the change affects the UI, a screenshot helps a lot.

## Reporting Issues

Use the issue templates when reporting bugs or requesting features. For bugs, always include your operating system and whether the Chrome extension was connected — most behavior differs along those two axes.
