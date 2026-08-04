# Memento Agent

[![Release](https://github.com/Cailiang/memento-client/actions/workflows/release.yml/badge.svg)](https://github.com/Cailiang/memento-client/actions/workflows/release.yml)

Memento is a local desktop maintenance agent. It combines deterministic device inspection and cleanup tools with a model configured by the user. The model can explain findings and prepare an action plan, but Memento executes only registered operations that the user reviews and confirms.

[简体中文](README_ZH.md) | [Latest release](https://github.com/Cailiang/memento-client/releases/latest)

## Capabilities

- **Agent:** describe a maintenance goal in plain language, inspect structured results, review a proposed plan, and verify the outcome.
- **Overview:** inspect health, CPU, GPU, memory, battery, disk, network, and high-usage processes in one quiet live workspace.
- **Cleanup:** scan rebuildable data by system, application, browser, developer, log, and device categories; safe items are preselected while review items and outside-rule clues remain separate.
- **Applications:** inspect installed applications and metadata, open or ignore an app, and move supported apps to Trash after confirmation.
- **Disk analysis:** browse storage hierarchically and use validated opaque node operations to reveal a directory, ask AI for an explanation, or move it to Trash.
- **History:** audit every direct, Agent, disk-browser, terminal, and recovery operation in one local maintenance ledger; Agent conversations remain available on a separate tab.
- **Settings:** manage model providers, automatic background updates, window behavior, ignored items, theme, and language.

## Safety Model

Memento does not give the model a general shell or unrestricted filesystem access.

1. Deterministic scanners create a device snapshot and register the operations valid for that snapshot.
2. Read-only Agent tools expose compact findings and opaque operation IDs.
3. The model can select only observed IDs when preparing structured results or a plan.
4. The user chooses the plan items and confirms them in a destructive-action dialog.
5. The Electron main process revalidates every operation before execution and verifies the result afterward.

Every scan candidate carries explicit confidence, stable reason codes, and estimate quality. Weak ownership clues do not reduce system health, increase safely reclaimable space, or affect the sidebar count. The deterministic scan and direct cleanup workflow work without a model provider; AI is used only when the user asks for explanation or plan generation.

Ignored storage, service, and application items are removed from scan results, executable operations, and Agent context. API keys remain in the main process and are never returned to the Renderer or included in model prompts.

## Platform Support

| Platform | Status |
| --- | --- |
| macOS | Supported product: scanning, analysis, cleanup, signed packaging, and updates |
| Windows / Linux | Internal CI portability builds only; not published or supported as maintenance products |

## Quick Start

Requirements:

- macOS for device scanning and cleanup
- Node.js 22.13 or later
- npm

```bash
npm ci
npm run dev
```

The application opens on the local Overview. No model is required for live metrics, deterministic rule scanning, categorized selection, confirmed batch cleanup, or maintenance history. Configure a provider in **Settings** only when an item needs AI explanation or plan generation. Choose OpenAI, Anthropic, Google Gemini, DeepSeek, Grok/xAI, Antigravity, or a custom OpenAI-compatible endpoint; Memento supplies the protocol, official endpoint, and a tested recommended model for named providers.

On its first local-configuration scan, Memento reads API configurations from `~/.claude`, `~/.codex`, `~/.gemini`, and `~/.grok`. Before importing, it uses the provider's read-only model catalog to validate the credential, endpoint, and configured model. Malformed, incomplete, unauthorized, OAuth-only, unsupported session-token, and unavailable-model configurations are filtered out; a new scan also removes previously imported local configurations that no longer pass validation. CC Switch is never required or read automatically; **Import CC Switch** is a separate user-initiated optional action that applies the same validation and removes invalid or deleted earlier CC Switch imports when repeated.

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

Memento stores settings, providers, conversations, plans, tool calls, and the unified maintenance ledger in a local SQLite database under Electron's application data directory. Recovery references and private paths remain local and are not returned through history-list IPC. API keys are encrypted with AES-256-GCM using a separate local master key with restricted permissions.

This protects credentials from accidental exposure in the Renderer, database, prompts, and logs. It does not claim to protect against an attacker who can read the complete application data directory and process memory.

## Documentation

- [Local Agent architecture and development](docs/LOCAL_AGENT_DEVELOPMENT.md)
- [Release process](docs/RELEASING.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [Current release notes](RELEASE_NOTES.md)

## Distribution

The `Release` GitHub Actions workflow builds the following packages from a matching `v*` tag:

| Platform | Architectures | Packages |
| --- | --- | --- |
| macOS | Intel x64, Apple Silicon arm64 | DMG |

Memento checks for updates hourly. A new version downloads in the background, then an **Update** button appears beside the sidebar version; selecting it installs the downloaded package and restarts the app without a separate update popup.

Each GitHub Release contains two DMGs, two signed-app updater ZIPs, two blockmaps, `latest-mac.yml`, and `SHA256SUMS.txt` (eight assets total). The checksum manifest contains exactly the two DMGs. Windows and Linux builds remain temporary GitHub Actions artifacts for portability checks and are excluded from public Release collection. macOS packages are signed with the project's Developer ID Application certificate, notarized by Apple, and stapled before upload.

## License

[MIT](LICENSE)
