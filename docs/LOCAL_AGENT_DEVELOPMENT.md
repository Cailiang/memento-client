# Memento Local Agent Development

This document describes the implementation that ships in Memento Agent. It is an architecture reference, not a future design proposal.

## 1. Product Baseline

The approved prototype is stored at `../prototypes/memento-agent/index.html` in the local workspace, next to this repository. It is the source of truth for layout, copy, density, responsive behavior, and interaction. Production changes begin in the prototype when they alter that contract. The prototype is not part of the public client repository, so project documentation must remain understandable without that file.

The old Renderer, hosted AI analysis, Memento Server, OAuth flow, AI Gateway protocol, and Gateway examples are not compatibility surfaces. The rebuild reuses only deterministic local capabilities that remain useful: scanning, storage cleanup, Homebrew cleanup, background-service handling, app inventory, terminal fixes, path validation, and operation registries.

## 2. Runtime Architecture

```text
React Renderer
  Agent / Health / Applications / History / Settings
               |
               | typed, narrow IPC
               v
Electron Main Process
  LocalAgentRuntime ---- Vercel AI SDK ToolLoopAgent
          |                         |
          |                         `---- user-configured model endpoint
          |
          +---- AgentStore ---- node:sqlite + AES-256-GCM
          |
          `---- current scan snapshot
                 +---- registered cleanup actions
                 +---- registered terminal fixes
                 `---- registered reveal/app targets
```

The Renderer has no database handle, API key, filesystem target, or arbitrary command capability. The preload exposes only typed operations from `MementoApi`. The main process owns provider creation, decryption, scanning, operation validation, execution, and persistence.

The Electron version pinned in `package.json` supplies Node 24 and the built-in `node:sqlite` module. No native database dependency or post-install rebuild is required.

## 3. SQLite and Secrets

`AgentStore` opens `<userData>/memento.sqlite`, enables WAL and foreign keys, and applies migrations through `PRAGMA user_version`.

The current database schema version is 3. Its core tables are:

| Table | Purpose |
| --- | --- |
| `ai_providers` | Provider type, URL, model, encrypted API key, default and connection state |
| `app_settings` | Language, theme, login behavior, menu-bar behavior, and ignored items |
| `agent_runs` | Conversation ID, language, prompt, provider snapshot, status, response, focused entities, structured presentation, plan, results, and error |
| `tool_calls` | Structured input and output for each Agent tool call |

A legacy `app-settings.json` file is read once when the SQLite settings row does not exist. Values pass through `normalizeAppSettings` before insertion. Schema migration 3 separates Antigravity from the generic Google provider type and migrates matching saved endpoints.

API keys use this format:

1. Generate `<userData>/agent-master.key` with 32 random bytes and mode `0600`.
2. Generate a fresh 12-byte IV for every save.
3. Encrypt with AES-256-GCM.
4. Store IV, authentication tag, and ciphertext in separate BLOB columns.
5. Return only `keyPresent` and a four-character `keyHint` to the Renderer.

Changing only a provider's display name preserves its tested connection state. Changing type, URL, model, or key returns it to `untested`.

## 4. Provider Registry

`provider-factory.ts` maps saved types to official AI SDK providers:

| Stored type | Factory |
| --- | --- |
| `openai-compatible` | `createOpenAICompatible` |
| `openai` | `createOpenAI` |
| `anthropic` | `createAnthropic` |
| `antigravity` | `createGoogleGenerativeAI` with Sub2API compatibility |
| `google` | `createGoogleGenerativeAI` |

Provider input is normalized and validated in the main process. URLs accept only HTTP or HTTPS. Root URLs receive the provider's conventional API prefix, so an OpenAI-compatible `https://code.tczor.cn` becomes `https://code.tczor.cn/v1`; pasted `/models`, `/responses`, `/chat/completions`, or `/messages` endpoints are reduced to their reusable API base.

`local-ai-config-import.ts` discovers configured API access in `~/.claude/settings.json`, `~/.codex/auth.json` plus `config.toml`, `~/.gemini/.env`, and `~/.grok/config.toml`. It accepts only configurations that resolve to a non-empty credential, HTTP(S) endpoint, and model. ChatGPT/Gemini OAuth state and Grok browser-session tokens are deliberately ignored because the provider adapters cannot safely treat them as API keys. Malformed and incomplete sources count as rejected and never cross IPC. `AgentStore` records `local_ai_config_import_v1` after the first automatic attempt so subsequent launches do not recreate configurations the user deleted.

CC Switch is optional and is read only after the user selects its Settings action. `cc-switch-import.ts` checks the Tauri store for an `app_config_dir_override`, then falls back to `~/.cc-switch/cc-switch.db`. It opens the database read-only and reads only usable Claude, Codex, and Gemini rows. Both importers produce deterministic IDs and use the same endpoint/model/key synchronization, making imports idempotent and preventing duplicates of matching manual providers. Imported plaintext remains in the main process and is immediately validated and encrypted with AES-256-GCM.

The Renderer presents named providers instead of an API-protocol selector. Official protocols, endpoints, and Memento-tested recommended models come from the built-in catalog; model selection, manual model IDs, and custom endpoints use progressive disclosure under Advanced settings. Recommendations may change with a Memento release, but an existing saved model is never replaced automatically.

After a URL and credential are available, the Renderer debounces a typed model-discovery IPC call. The main process reuses an existing encrypted key when the field is blank, requests the provider's `/models` endpoint with the correct authentication scheme, and de-duplicates IDs. Capability metadata is preferred when an endpoint supplies it; otherwise known image, audio, realtime, embedding, moderation, and internal-only model families are excluded by conservative ID rules. Discovery augments the Advanced model list without choosing the endpoint's first model. The response includes the resolved base URL and excluded count so the UI can explain why a mixed catalog contains fewer Agent-selectable models. Requests time out after 15 seconds. Failed HTTP responses retain the request URL without credential query parameters and a bounded server message; all errors are sanitized before crossing IPC and rendered in a wrapping, selectable alert instead of the compact status chip.

Official `generativelanguage.googleapis.com` endpoints use native Gemini `/v1beta` routes and `x-goog-api-key` authentication. The dedicated `antigravity` type normalizes a host root to `/antigravity/v1beta`, uses the same header and Gemini model catalog shape, and remains implemented by `createGoogleGenerativeAI`; no separate Antigravity SDK is required. Database migration 3 converts saved `google` rows containing an `/antigravity` path, and the CC Switch importer applies the same classification. Model-discovery URLs never contain credentials.

The connection test creates a two-step `ToolLoopAgent` run with a strict `connection_probe` tool. Standard providers require the first tool call; Antigravity uses `auto`, and the strict declaration makes the Google adapter serialize the Sub2API-compatible Gemini 3 `VALIDATED` mode instead of permissive `AUTO` or forced `ANY`. The instruction still directs the model to call the probe, the callback must actually execute, and the follow-up step disables tools while verifying `functionResponse` continuation. Gemini 3 models use standardized `reasoning: low`, which maps to `thinkingLevel: LOW`; `MINIMAL` is intentionally avoided because Gemini 3.1 Pro variants reject it. The probe allows 2,048 output tokens, 60 seconds overall, and 45 seconds per provider request. A text-only first response remains a failed test.

## 4.1 Update Checks

`electron-updater` checks the stable GitHub release channel after startup and every hour. It downloads a newer native package in the background, while `update-checker.ts` keeps the typed `idle`, `checking`, `available`, `downloading`, `downloaded`, `installing`, `up-to-date`, `error`, and `unsupported` Renderer states deterministic. The sidebar exposes progress beside the version number and enables its compact Update button only after the package is ready. Clicking it invokes a dedicated IPC handler that calls `quitAndInstall`; there is no native notification, floating notice, or external Release-page handoff. Settings retains a manual retry and an accessible live status. Development builds and unsupported Linux package formats do not attempt an update.

## 4.2 Release Automation

`.github/workflows/release.yml` is the only supported path for publishing GitHub Release binaries. It uses the latest Node.js 22.x release, verifies that built-in SQLite is available, validates that a pushed tag exactly matches package metadata, runs unit tests and type checking, then builds six native runner targets: macOS x64 and arm64, Windows x64 and arm64, and Linux x64 and arm64. The resulting two DMGs, two NSIS executables, two AppImages, and two DEBs remain the eight user-facing installers. The workflow also publishes macOS ZIPs and blockmaps, Windows blockmaps, and four architecture-aware update manifests. `collect-release-artifacts.ts` parses and merges the two macOS and Windows manifests, validates all 19 assets, and keeps `SHA256SUMS.txt` restricted to exactly the eight installers.

Tag-triggered runs create or safely update the bilingual GitHub Release from `RELEASE_NOTES.md`. Manual dispatches run the same validation and build matrix but intentionally stop at temporary Actions artifacts. macOS builds import the project Developer ID certificate into an isolated temporary keychain, sign and notarize the app, produce both DMG and ZIP targets, then separately sign, notarize, staple, and verify the final DMG. The signed app inside the ZIP is the payload used by Squirrel.Mac. The end-to-end operator checklist is in [Release process](RELEASING.md).

## 5. Agent Run

`LocalAgentRuntime.start` requires a completed scan and the default Provider. It stores the run before making a model request and tracks cancellation with an `AbortController`. A new task creates a conversation ID; follow-up runs reuse it. The Renderer workspace is keyed by conversation ID and selects the latest run for each conversation, so another turn updates the existing tab instead of adding a tab for every run.

Before each request, the runtime loads up to eight recent turns from the same conversation and builds a bounded context containing each user request, short outcome, focused entities, pending plan IDs, and status. Direct entity names in the current request are resolved against the current scan. When a follow-up uses a reference such as “这个服务,” “this app,” or “it,” the latest non-empty focus is authoritative; inspection output is narrowed to that entity so unrelated findings cannot displace it. Focused service and storage inspection also carries exact-token correlated terminal findings. Safe literal `export *_HOME=/absolute/path` entries whose targets no longer exist become hash-bound `comment-lines` fixes; correlated fixable findings are appended to the same structured result as optional operations even if the model omits them from `present_results`.

State progression:

```text
preparing -> analyzing -> plan-ready -> awaiting-confirmation
          -> completed
          -> failed / cancelled
awaiting-confirmation -> executing -> verifying -> completed
```

The model can call these tools:

- `inspect_device`
- `inspect_storage`
- `inspect_background_services`
- `inspect_applications`
- `inspect_terminal`
- `present_results`
- `prepare_action_plan`

Inspection output includes stable finding IDs and is compact enough for model context. When one storage item is focused, `local-evidence.ts` derives identity tokens from that exact scan item and correlates them across storage, services, applications, allowlisted filesystem entry names, package receipts, shallow target children, and shell configuration references. Shell values that look like keys, tokens, secrets, passwords, or credentials are replaced with `[REDACTED]` before tool logging or provider requests. Evidence is labeled `confirmed-local`, `strong-signature`, or `unconfirmed`; no product ownership table is maintained. `present_results` accepts only stable IDs and resolves them against the current scan into a persisted `AgentPresentation`. The model supplies plain summary and section-title text; Memento supplies all item data and interactive operations. Arbitrary HTML is never accepted or rendered.

Every tool input and output is stored in `tool_calls`. API keys, raw file contents, and unrestricted filesystem access remain excluded. Runs are limited to twelve steps, 1,400 output tokens, and a two-minute timeout.

Application inspection covers `/Applications`, `~/Applications`, and `/System/Applications`. User and shared applications receive registered Trash operations; system applications remain read-only. The scanner resolves Simplified Chinese names from localized and development-region `InfoPlist.strings`, and exposes Bundle ID, executable, `LSBackgroundOnly`, and registered URL schemes so a per-app Agent request can distinguish ordinary apps, drivers, security helpers, and URL handlers from verified local metadata. Spotlight remains the source of last-used dates; a missing value is shown as no usage record and is never classified as unused.

The application language is authoritative rather than the language of the latest user prompt. English mode requires all user-visible Agent text in English even if the user writes Chinese. Main-process statuses, fallback responses, plan copy, validation errors, and provider-test results use the same setting. Changing language revokes the old scan snapshot and immediately performs a localized scan.

## 6. Plan and Execution Security

`availablePlanItems` derives the only IDs a model may propose from the current scan's registered candidate operations, manageable app uninstall operations, and deterministic terminal fixes. Unknown operation IDs are rejected when a plan is prepared.

The Renderer may also add an operation from a structured result directly to the current plan. The `memento:agent:plans:add` handler resolves that ID through `availablePlanItems` for the current in-memory scan before persisting it. This is a UI shortcut into the same confirmation path, not a new execution path.

Before execution, `selectExecutablePlanItems` validates that:

- the run exists and is still `awaiting-confirmation`;
- the submitted Run ID matches;
- the item array is non-empty and contains at most 100 short string IDs;
- every ID belongs to the persisted plan;
- no successfully completed operation is submitted again;
- duplicate submitted IDs do not cause duplicate execution.

The existing action and terminal-fix registries then validate the IDs again against the current in-memory scan. Stale actions fail instead of falling back to model-provided paths or commands. Destructive filesystem and service changes retain their existing target allowlists and privilege boundaries.

Application uninstall first uses Electron's native macOS Trash API. If that API reports an unrelated privacy error and leaves the bundle in place, Memento falls back to a same-volume move into the current user's `~/.Trash`. The fallback revalidates that the target is a real, non-nested `.app` under `/Applications` or `~/Applications`, allocates a non-conflicting destination, and verifies both sides of the move. Only `EACCES` or `EPERM` enters the existing administrator authorization boundary; other filesystem failures remain visible and do not mark the action complete.

After Agent-plan execution, service actions, or terminal fixes, Memento performs a fresh scan. Registered actions and terminal fixes whose complete local capability payload remains unchanged inherit their prior opaque IDs; changed or missing targets receive no such reconciliation. Direct Storage cleanup is narrower: once the main process has validated and completed the registered action, the Renderer reconciles its operation ID and removes the exact originating candidate by stable candidate ID during an approximately three-second Run, Update, Done sequence; it does not block on a full scan. Per-operation results accumulate on the run, successful steps become non-selectable, and partial failure is reported as partial failure. Cancelling an active request aborts the provider call, while cancelling a waiting plan persists `cancelled` and clears the executable plan.

Storage scanning has three cleanup boundaries:

- Known rebuildable cache folders for Claude, Codex, Antigravity, Grok, Xcode, package managers, and iOS simulators use exact main-process allowlists. AI credentials, settings, conversations, sessions, workspaces, and projects are not included.
- `home-hidden-cleanup.ts` inspects direct hidden Home directories, one directory level below `.config`, `.cache`, and `.local/share`, and first-level directories below `~/Library/Application Support` after application inventory completes. It protects shell, credential, package-manager, Apple platform, shared-data, and container roots; filters directories matching installed applications or command entries from `PATH`, Homebrew, and common user bin directories; excludes directories modified within 30 days; and caps the size-sorted result at 80 review-only candidates. A missing identity match is evidence, not proof of orphan ownership. `trash-home-artifact` rechecks the registered real parent, directory type, and modification time before using native Trash; it never permanently deletes settings or data.
- Large direct directory children of `~/Library/Logs` are review-required permanent cleanup targets; their resolved paths are checked again before deletion.

Automatic Storage findings are directory-only. Personal files under Downloads, Desktop, and Movies and individual files such as Docker virtual disks are available through the separately initiated Disk browser. A disk-browser directory can be sent to Agent through an opaque registered node ID. The main process resolves that ID, creates a focused review candidate, and exposes a `trash-disk-usage` action only when the existing disk safety validator accepts the directory. Execution validates the same node and real path again, uses native Trash, invalidates only the removed subtree, and notifies the Renderer without starting another full disk scan.

Task History bulk deletion selects only currently filtered, non-running records. The main IPC resolves every run before mutation, rejects the whole request if any selected task is active or stale, and deletes runs plus cascading tool calls inside one SQLite transaction.

## 7. Ignored Items

Storage entries use their validated location as the ignored identity; background services use their service name; applications prefer Bundle ID and fall back to their validated path. The main process applies ignored items after every scan and removes matching entries from:

- visible scan candidates;
- registered cleanup actions;
- registered reveal targets;
- Agent inspection context.

Application ignore also removes the inventory row and any application finding that references its uninstall operation. Protected system apps have no uninstall operation but can still be hidden and restored.

The Renderer also removes a newly ignored row immediately. Restoring detection updates SQLite and triggers a fresh scan.

## 8. Renderer Contract

The production Renderer consists of one shell and five prototype-aligned pages under `src/renderer/src/agent-ui/`.

Concurrent Agent starts are kept in a Renderer workspace list even when they use isolated conversation IDs. The compact task switcher displays each run's persisted state and changes the active conversation without cancelling or replacing other runs. Completion events update background tasks in place; recently completed workspace tasks remain available within the eight-item local workspace window unless their history record is deleted.

- Dialogs trap focus, close with Escape when idle, restore previous focus, and block backdrop closing during execution.
- Async buttons disable repeated submission and show a spinner.
- Dynamic scan and Agent states use live regions.
- Agent waits use a phase-aware estimated progress surface. Confirmed execution paints its 8% initial state before IPC starts; execution events advance the first phase and actual scan progress drives verification from 44% through 96%. It reaches 100% only on completion or failure.
- Layouts cover full sidebar, compact sidebar, bottom navigation, tablet, and phone widths.
- `prefers-reduced-motion` reduces all non-essential transitions.
- Application icons are requested lazily and only for target paths registered by the current scan.
- Conversation turns remain visible together, while SQLite keeps their compact focus and pending-plan context available to subsequent runs.
- Task history has local live search across prompts, provider/model names, status, response, and error text. Deletion is confirmed in the Renderer and handled in the main process. Deleting `agent_runs` cascades to `tool_calls`; active runs are rejected, and completed system changes are not undone.
- Storage keeps cleanup findings and capacity browsing as separate surfaces. Findings remain bounded by deterministic cleanup allowlists. `disk-usage-scanner.ts` launches `/usr/bin/du -akx` against `/System/Volumes/Data` when available, streams real scan counters over a dedicated IPC event, supports cancellation, and retains entries of at least 5 MB. The resulting tree sorts siblings by size, caps a single folder at 200 visible children with an aggregate remainder, and registers opaque reveal/Trash IDs. Trash targets are revalidated with real paths and protected-root rules in the main process. Native Trash failures fall back to a collision-safe move and request administrator authorization only for filesystem permission errors. After success, `disk-usage-tree.ts` removes the subtree and adjusts visible ancestor sizes; the main process unregisters only that target and its descendants, leaving siblings available for consecutive removal. No automatic full scan follows Trash. Disk-browser paths never enter the Agent cleanup action registry.
- Structured application results use a logo grid with last-used time and size; storage, service, and terminal results use compact rows. Their buttons reference only registered application or operation IDs.
- Model prose is parsed by `react-markdown` with GFM and soft-line-break support. Common model bullet characters are normalized into semantic lists, raw HTML remains disabled, and links are rendered as inert labels. The Renderer never uses `dangerouslySetInnerHTML` or model-generated HTML.
- Health rows expose analysis as AI analysis, summarize the count of registered operations, and wait for the user to choose an operation from the trusted structured result before anything enters the confirmation plan.
- Health-score review names and opens the module with the largest actionable finding count. Storage opens Cleanup findings, Services opens All, and ties prefer the broad Storage view. Runtime anomalies use separate `high-cpu` and `high-memory` classifications instead of one ambiguous resource bucket.
- Storage, service, and application pages open their own ignored-item tab directly; Settings retains the combined manager.
- Preload initialization must not touch the DOM before `DOMContentLoaded`; losing the preload API silently activates browser demo data instead of real device data.

Web development mode uses deterministic demo scan data and an in-memory demo Provider so every page and dialog can be visually tested without touching the computer.

## 9. Adding a Capability

A new Agent capability must follow this order:

1. Add deterministic scanning and an explicit registered operation in the main process.
2. Define path, service, privilege, timeout, cancellation, and verification boundaries.
3. Add focused unit tests for valid and invalid targets.
4. Expose only compact structured data through a named Agent inspection tool.
5. Map the registered operation to an `AgentPlanItem`.
6. Keep execution behind the shared confirmation and plan-validation path.
7. Re-scan and report the actual result.
8. Update the prototype before changing a visible interaction.

Do not add `run_shell`, model-generated filesystem paths, model-generated service names, or a path that executes from free-form model text.

## 10. Verification and Release

Development requires Node.js 22.13 or newer so `node:sqlite` is available without an experimental flag. `package.json` and `package-lock.json` are the source of truth for the supported Electron, Vite, electron-vite, electron-builder, React plugin, and Vitest versions.

Run:

```bash
npm test
npm run typecheck
npm run build
npm run scan:smoke
npm run electron:smoke
npm run audit:runtime
git diff --check
```

With the web development server on port `4174`, run `npm run ui:smoke -- http://127.0.0.1:4174`. It captures all pages at four viewports and exercises structured Agent results, correlated terminal operations, disk-directory Ask AI, filtered history bulk deletion, application-result grids, English-only Agent output, plan confirmation, health tabs, application filtering, and provider editing. The Electron smoke test launches the production output and requires the preload API, real application inventory, and at least one real application icon; this prevents browser demo data from masking a main/preload regression.

Use `npm run audit:runtime` as the release boundary because it audits dependencies shipped inside the application. Use `npm run audit` to inspect the complete development tree. Record actionable findings in the release work instead of preserving a version-specific audit snapshot in this architecture document.

Every user-requested code or UI change requires a patch-version bump, changelog and release-note update, Developer ID-signed Intel x64 DMG build, mounted-image and bundle-signature verification, bundled version and `x86_64` architecture check, SHA-256 calculation, and a source commit. Public packages additionally require successful Apple notarization, ticket stapling, and Gatekeeper assessment. The complete checklist is maintained in `AGENTS.md` and [Release process](RELEASING.md).
