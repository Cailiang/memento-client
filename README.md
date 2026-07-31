# Memento Agent

[![Release](https://github.com/Cailiang/memento-client/actions/workflows/release.yml/badge.svg)](https://github.com/Cailiang/memento-client/actions/workflows/release.yml)

Memento is a local desktop maintenance agent. It combines deterministic device inspection and cleanup tools with a model configured by the user. The model can explain findings and prepare an action plan, but Memento executes only registered operations that the user reviews and confirms.

[简体中文](README_ZH.md) | [Latest release](https://github.com/Cailiang/memento-client/releases/latest)

## Capabilities

- **Agent:** describe a maintenance goal in plain language, inspect structured results, review a proposed plan, and verify the outcome.
- **Computer health:** review storage findings, browse disk usage, inspect background services, and diagnose terminal startup issues.
- **Applications:** inspect installed applications and metadata, open or ignore an app, and move supported apps to Trash after confirmation.
- **Task history:** reopen, search, and delete locally stored Agent runs and tool-call records.
- **Settings:** manage model providers, updates, window behavior, ignored items, theme, and language.

## Safety Model

Memento does not give the model a general shell or unrestricted filesystem access.

1. Deterministic scanners create a device snapshot and register the operations valid for that snapshot.
2. Read-only Agent tools expose compact findings and opaque operation IDs.
3. The model can select only observed IDs when preparing structured results or a plan.
4. The user chooses the plan items and confirms them in a destructive-action dialog.
5. The Electron main process revalidates every operation before execution and verifies the result afterward.

Ignored storage, service, and application items are removed from scan results, executable operations, and Agent context. API keys remain in the main process and are never returned to the Renderer or included in model prompts.

## Platform Support

| Platform | Status |
| --- | --- |
| macOS | Full scanning, analysis, cleanup, and packaging |
| Windows | Desktop package for portability validation; macOS maintenance capabilities are unavailable |
| Linux | Desktop package for portability validation; macOS maintenance capabilities are unavailable |

## Quick Start

Requirements:

- macOS for device scanning and cleanup
- Node.js 22.13 or later
- npm

```bash
npm ci
npm run dev
```

Configure a model provider in **Settings** after the application starts. Supported provider types are OpenAI-compatible, OpenAI, Anthropic, Antigravity, and Google Gemini. Memento can also import supported Claude, Codex, and Gemini configurations from a local CC Switch installation.

## Verification

```bash
npm test
npm run typecheck
npm run build
npm run scan:smoke
npm run electron:smoke
npm run audit:runtime
```

Start the web development server in one terminal:

```bash
npm run dev:web -- --port 4174
```

Then run the browser UI smoke test in a second terminal:

```bash
npm run ui:smoke -- http://127.0.0.1:4174
```

`npm run audit:runtime` checks dependencies shipped with the application. Use `npm run audit` when development and packaging dependencies should also be included.

## Local Data

Memento stores settings, providers, conversations, plans, and tool-call records in a local SQLite database under Electron's application data directory. API keys are encrypted with AES-256-GCM using a separate local master key with restricted permissions.

This protects credentials from accidental exposure in the Renderer, database, prompts, and logs. It does not claim to protect against an attacker who can read the complete application data directory and process memory.

## Documentation

- [Local Agent architecture and development](docs/LOCAL_AGENT_DEVELOPMENT.md)
- [Release process](docs/RELEASING.md)
- [Changelog](CHANGELOG.md)
- [Current release notes](RELEASE_NOTES.md)

## Distribution

The `Release` GitHub Actions workflow builds the following packages from a matching `v*` tag:

| Platform | Architectures | Packages |
| --- | --- | --- |
| macOS | Intel x64, Apple Silicon arm64 | DMG |
| Windows | x64, arm64 | NSIS EXE |
| Linux | x64, arm64 | AppImage, DEB |

Each GitHub Release contains eight platform packages and `SHA256SUMS.txt`. macOS packages are fully ad-hoc signed so Apple Silicon can validate the app bundle, but they are not Developer ID signed or notarized until project-owned Apple credentials are configured. Gatekeeper may still require **Control-click > Open** or approval under **System Settings > Privacy & Security** before the first launch.

## License

[MIT](LICENSE)
