# Memento Agent

[![Release](https://github.com/Cailiang/memento-client/actions/workflows/release.yml/badge.svg)](https://github.com/Cailiang/memento-client/actions/workflows/release.yml)

Memento is a local desktop maintenance Agent. It combines deterministic device scanning and cleanup tools with a model chosen and configured by the user. The model can inspect structured scan results and prepare a concrete action plan; Memento executes only registered operations that the user explicitly confirms. Full scanning and cleanup currently target macOS; GitHub Actions also produces Windows and Linux packages for portability testing.

[简体中文](README_ZH.md)

## Product

The application is rebuilt around the approved interactive prototype at [`../prototypes/memento-agent/index.html`](../prototypes/memento-agent/index.html). Its five work areas are:

- **Agent:** ask for a goal in plain language, keep concurrent analyses visible as separate switchable tasks, continue with context-aware follow-ups, act from structured module results, review the plan, confirm, execute, and verify.
- **Computer health:** inspect safety-filtered cleanup findings, browse the complete main-data-volume hierarchy asynchronously, and review background services and terminal startup without opening redundant detail pages.
- **Applications:** browse user and read-only system apps in a real-logo grid, see usage and bundle metadata, ask Agent about one exact app, open it, ignore it, or move an uninstallable app to Trash after confirmation.
- **Task history:** search, reopen, or permanently delete local Agent runs and their tool-call records.
- **Settings:** manage multiple model providers, software updates, window behavior, ignored items, color theme, and language.

Storage, background-service, and application findings can be ignored. Ignored items are removed from scan results, registered operations, and the data exposed to Agent tools. Each relevant work page opens its own ignored category directly, while Settings retains the combined manager.

## Local Agent

Memento uses the open-source [Vercel AI SDK](https://github.com/vercel/ai) and its `ToolLoopAgent`. There is no Memento server, hosted login, AI Gateway, or application-owned API credential.

Users can save multiple providers and choose one default model:

- OpenAI-compatible endpoints
- OpenAI
- Anthropic
- Antigravity
- Google Gemini

Each configuration contains a name, API type, base URL, API key, and selected model. Once a URL and credential are available, Memento normalizes the API base and automatically fetches the model list. Image, audio, realtime, embedding, moderation, and other clearly incompatible entries are kept out of the Agent model picker. Existing encrypted credentials can be reused while editing. A separate connection test verifies model access and tool calling, not just plain text generation.

Official Google Gemini endpoints use the native `/v1beta` protocol and `x-goog-api-key` header. Antigravity is a dedicated provider type for Sub2API's `/antigravity/v1beta` route; it reuses the Vercel Google adapter but selects the gateway-compatible `VALIDATED` tool mode instead of forcing `ANY`. Existing Google configurations whose URL contains `/antigravity` migrate automatically. The connection probe still requires a real tool call and tool-result continuation. Gemini 3 probes request the supported `LOW` thinking level instead of the unsupported `MINIMAL` level.

Storage cleanup groups only known rebuildable cache paths for Claude, Codex, Antigravity, and Grok. It does not include their credentials, settings, conversations, sessions, workspaces, or projects. Large files at least seven days old and 500 MB in Downloads, Desktop, or Movies are review-only findings and can only be moved to Trash after the main process revalidates the exact file.

The Storage count describes actionable findings selected by deterministic safety rules, not every file on disk. **Disk browser** runs a separate cancellable `du` scan of the macOS main data volume and presents folders and files of at least 5 MB in a size-sorted column hierarchy. Progress reports elapsed time, current location, item counts, and inaccessible locations without estimating a percentage. Registered disk-browser entries can be revealed in Finder or moved to Trash after confirmation. A successful move removes that subtree immediately, adjusts visible ancestor capacity, and keeps unrelated IDs from the same scan valid so several items can be removed in sequence. Full disk scans run only when explicitly requested, not after every removal. Disk-browser paths do not become Agent cleanup actions.

On the first launch after this importer is introduced, Memento detects the local CC Switch database at `~/.cc-switch/cc-switch.db` or its configured custom directory. Usable Claude, Codex, and Gemini entries are imported once and mapped by API format. The completed attempt is recorded in SQLite, so a provider the user later deletes does not return at the next launch. Settings provides an explicit **Re-import CC Switch** action whenever the user wants to read it again. Credential-free placeholders are skipped. The CC Switch database is opened read-only; imported credentials stay in the main process and are re-encrypted in Memento's own provider store.

Memento checks the latest stable GitHub Release shortly after launch and every hour. A newer version triggers a native notification and a compact in-app notice that opens the trusted repository release page; Settings also provides a manual check. Local packages remain unsigned and are never installed without the user downloading and opening them.

Conversation IDs, focused entities, and pending plans are persisted locally. Follow-ups such as “this service” resolve to the latest exact focus instead of starting another unrelated inventory. Per-application analysis includes its exact Bundle ID, path, executable, background-only role, and registered URL schemes. The application language controls all Agent-visible text; switching language refreshes the scan snapshot before another run.

Agent prose is rendered with a constrained Markdown pipeline for readable headings, emphasis, lists, code, blockquotes, and tables. Raw HTML is disabled; structured result controls continue to come only from trusted React components and registered local operations.

## Execution Boundary

The model never receives a general shell tool and cannot execute cleanup directly.

1. A deterministic scanner registers action IDs for the current device snapshot.
2. Read-only Agent tools expose compact structured findings and those registered IDs.
3. The model selects result IDs through `present_results`; trusted React components render application, storage, service, and terminal controls without injecting model-generated HTML.
4. The model or user may add only observed, registered operation IDs to the plan.
5. The main process rejects invented, stale, empty, oversized, or unconfirmed plans.
6. The user selects steps and confirms in a destructive-action dialog.
7. Existing cleanup and terminal-fix registries execute the selected operations.
8. Memento scans again and stores the actual per-operation results.

## Local Data

Electron's built-in `node:sqlite` stores app settings, model providers, Agent conversations, focused entities, structured presentations, plans, and tool-call records in the application data directory. API keys are encrypted with AES-256-GCM. A random 32-byte master key is stored separately with `0600` permissions.

The key is decrypted only in the Electron main process when a provider request is created. Plaintext keys are not returned to the Renderer, written to SQLite, included in Agent context, or logged. This is intentionally lightweight local encryption and does not claim to protect against an attacker who can read the user's complete application data directory and process memory.

## Development

Requirements:

- macOS for full scanning, cleanup, and DMG verification
- Node.js 22.12 or later
- npm

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm test
npm run typecheck
npm run build
npm run scan:smoke
npm run electron:smoke
npm run dev:web -- --port 4174
npm run ui:smoke -- http://127.0.0.1:4174
npm run audit:runtime
```

The visual smoke test exercises all five pages at `1440x900`, `1024x768`, `820x1180`, and `390x844`, checks horizontal overflow, and covers the visible build version, compact page controls, isolated Agent tasks, Agent and execution progress, structured results, consecutive disk-browser removal, history search and deletion, application filtering and ignoring, English-only output, plans, confirmation, health tabs, and Antigravity provider editing. The Electron smoke test separately verifies the production preload, real application inventory, localized names, protected system apps, and real icons.

The current supported build chain is Vite 7, electron-vite 5, and electron-builder 26. `npm run audit:runtime` checks dependencies shipped with Memento, while `npm run audit` also reports development and packaging dependencies inherited from upstream tools.

## Packaging

Public packages are built by the repository's `Release` GitHub Actions workflow after a matching `v*` tag is pushed:

| Platform | Architectures | Packages |
| --- | --- | --- |
| macOS | Intel x64, Apple Silicon arm64 | DMG |
| Windows | x64, arm64 | NSIS EXE |
| Linux | x64, arm64 | AppImage, DEB |

The publishing job creates the bilingual GitHub Release, uploads all eight packages, and attaches `SHA256SUMS.txt`. A manual workflow dispatch builds the same matrix as temporary Actions artifacts without publishing a release. See [Release process](docs/RELEASING.md).

The required local traceability build remains the Intel macOS package:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac -- --x64
```

Every user-requested change must bump the patch version, update `CHANGELOG.md` and `RELEASE_NOTES.md`, run the full verification suite, build and verify an Intel x64 DMG, confirm the bundled version and architecture, calculate SHA-256, and commit the source. Packages are unsigned and unnotarized unless signing credentials are configured.

Implementation details are documented in [Local Agent development](docs/LOCAL_AGENT_DEVELOPMENT.md).
