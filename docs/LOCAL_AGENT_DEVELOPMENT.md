# Memento Local Agent Development

This document describes the implementation that ships in Memento Agent. It is an architecture reference, not a future design proposal.

## 1. Product Baseline

The approved prototype at [`../../prototypes/memento-agent/index.html`](../../prototypes/memento-agent/index.html) is the source of truth for layout, copy, density, responsive behavior, and interaction. Production changes begin in the prototype when they alter that contract.

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

Electron `43.2.0` supplies Node `24` and the built-in `node:sqlite` module. No native database dependency or post-install rebuild is required.

## 3. SQLite and Secrets

`AgentStore` opens `<userData>/memento.sqlite`, enables WAL and foreign keys, and applies migrations through `PRAGMA user_version`.

Schema version 2 contains:

| Table | Purpose |
| --- | --- |
| `ai_providers` | Provider type, URL, model, encrypted API key, default and connection state |
| `app_settings` | Language, theme, login behavior, menu-bar behavior, and ignored items |
| `agent_runs` | Conversation ID, language, prompt, provider snapshot, status, response, focused entities, structured presentation, plan, results, and error |
| `tool_calls` | Structured input and output for each Agent tool call |

A legacy `app-settings.json` file is read once when the SQLite settings row does not exist. Values pass through `normalizeAppSettings` before insertion.

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
| `google` | `createGoogleGenerativeAI` |

Provider input is normalized and validated in the main process. URLs accept only HTTP or HTTPS. Root URLs receive the provider's conventional API prefix, so an OpenAI-compatible `https://code.tczor.cn` becomes `https://code.tczor.cn/v1`; pasted `/models`, `/responses`, `/chat/completions`, or `/messages` endpoints are reduced to their reusable API base.

On the first import attempt, `cc-switch-import.ts` checks CC Switch's Tauri store for an `app_config_dir_override`, then falls back to `~/.cc-switch/cc-switch.db`. It opens that SQLite database read-only and reads only Claude, Codex, and Gemini rows. Claude and Gemini JSON environment shapes are parsed directly; Codex's embedded TOML is parsed with `smol-toml`. CC Switch `apiFormat` and Codex `wire_api` select the matching Memento provider type. Rows without a usable credential are skipped. Deterministic source IDs and an endpoint/model/key comparison make synchronization idempotent and prevent a matching manual provider from being duplicated. Imported plaintext never crosses IPC; `AgentStore` immediately applies its normal validation and AES-256-GCM encryption.

`AgentStore` records `cc_switch_auto_import_v1` in the existing SQLite settings table after the first automatic attempt, including when CC Switch is not installed. Subsequent launches do not read CC Switch again, so deleted imported providers stay deleted. The Settings action calls a separate IPC path for an explicit manual import and reports the detected and added-or-updated counts without clearing the one-time marker.

After a URL and credential are available, the Renderer debounces a typed model-discovery IPC call. The main process reuses an existing encrypted key when the field is blank, requests the provider's `/models` endpoint with the correct authentication scheme, and de-duplicates IDs. Capability metadata is preferred when an endpoint supplies it; otherwise known image, audio, realtime, embedding, moderation, and internal-only model families are excluded by conservative ID rules. The response includes the resolved base URL and excluded count so the UI can explain why a mixed catalog contains fewer Agent-selectable models. Requests time out after 15 seconds. Failed HTTP responses retain the request URL without credential query parameters and a bounded server message; all errors are sanitized before crossing IPC and rendered in a wrapping, selectable alert instead of the compact status chip.

The connection test creates a two-step `ToolLoopAgent` run with a `connection_probe` tool. The first step requires the tool; the follow-up step disables tool calls and verifies that the provider accepts the tool result and returns a normal response. The probe allows 60 seconds overall and 45 seconds per provider request because reasoning and coding models can exceed 20 seconds for the complete round trip. Success therefore means the endpoint, key, model, response protocol, tool call, and tool-result continuation all worked. A text-only first response is a failed test.

## 4.1 Update Checks

`update-checker.ts` requests the latest stable release from the GitHub Releases API after startup and every hour. It uses numeric version comparison, rejects draft, prerelease, malformed, and non-repository release URLs, times out after ten seconds, and never downloads or installs a package. The main process emits typed update state to the Renderer and shows one native notification per newly observed version. Settings exposes a manual check; the in-app notice opens only a URL under the repository's trusted release path.

## 5. Agent Run

`LocalAgentRuntime.start` requires a completed scan and the default Provider. It stores the run before making a model request and tracks cancellation with an `AbortController`. A new task creates a conversation ID; follow-up runs reuse it.

Before each request, the runtime loads up to eight recent turns from the same conversation and builds a bounded context containing each user request, short outcome, focused entities, pending plan IDs, and status. Direct entity names in the current request are resolved against the current scan. When a follow-up uses a reference such as “这个服务,” “this app,” or “it,” the latest non-empty focus is authoritative; inspection output is narrowed to that entity so unrelated findings cannot displace it.

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

Inspection output includes stable finding IDs and is compact enough for model context. `present_results` accepts only those stable IDs and resolves them against the current scan into a persisted `AgentPresentation`. The model supplies plain summary and section-title text; Memento supplies all item data and interactive operations. Arbitrary HTML is never accepted or rendered.

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
- duplicate submitted IDs do not cause duplicate execution.

The existing action and terminal-fix registries then validate the IDs again against the current in-memory scan. Stale actions fail instead of falling back to model-provided paths or commands. Destructive filesystem and service changes retain their existing target allowlists and privilege boundaries.

Application uninstall first uses Electron's native macOS Trash API. If that API reports an unrelated privacy error and leaves the bundle in place, Memento falls back to a same-volume move into the current user's `~/.Trash`. The fallback revalidates that the target is a real, non-nested `.app` under `/Applications` or `~/Applications`, allocates a non-conflicting destination, and verifies both sides of the move. Only `EACCES` or `EPERM` enters the existing administrator authorization boundary; other filesystem failures remain visible and do not mark the action complete.

After execution, Memento performs a fresh scan. Per-operation success or failure is stored on the run; partial failure is reported as partial failure. Cancelling an active request aborts the provider call, while cancelling a waiting plan persists `cancelled` and clears the executable plan.

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

- Dialogs trap focus, close with Escape when idle, restore previous focus, and block backdrop closing during execution.
- Async buttons disable repeated submission and show a spinner.
- Dynamic scan and Agent states use live regions.
- Agent waits use a phase-aware estimated progress surface. It starts below 25%, advances asymptotically to a status-specific cap, reports elapsed time, and reaches completion only when the actual result replaces it.
- Layouts cover full sidebar, compact sidebar, bottom navigation, tablet, and phone widths.
- `prefers-reduced-motion` reduces all non-essential transitions.
- Application icons are requested lazily and only for target paths registered by the current scan.
- Conversation turns remain visible together, while SQLite keeps their compact focus and pending-plan context available to subsequent runs.
- Task-history deletion is confirmed in the Renderer and handled in the main process. Deleting `agent_runs` cascades to `tool_calls`; active runs are rejected, and completed system changes are not undone.
- Structured application results use a logo grid with last-used time and size; storage, service, and terminal results use compact rows. Their buttons reference only registered application or operation IDs.
- Model prose is parsed by `react-markdown` with GFM and soft-line-break support. Common model bullet characters are normalized into semantic lists, raw HTML remains disabled, and links are rendered as inert labels. The Renderer never uses `dangerouslySetInnerHTML` or model-generated HTML.
- Health rows expose analysis as AI analysis, summarize the count of registered operations, and wait for the user to choose an operation from the trusted structured result before anything enters the confirmation plan.
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

Development requires Node.js 22.12 or newer. The supported frontend and packaging chain is Vite 7.3.6, electron-vite 5.0.0, electron-builder 26.15.3, `@vitejs/plugin-react` 5.2.0, and Vitest 3.2.7. Vite 8 is intentionally deferred until electron-vite declares stable support for it.

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

With the web development server on port `4174`, run `npm run ui:smoke -- http://127.0.0.1:4174`. It captures all pages at four viewports and exercises structured Agent results, application-result grids, English-only Agent output, plan confirmation, health tabs, application filtering, and provider editing. The Electron smoke test launches the production output and requires the preload API, real application inventory, and at least one real application icon; this prevents browser demo data from masking a main/preload regression.

Use `npm run audit:runtime` as the release boundary because it audits dependencies shipped inside the application. Use `npm run audit` to inspect the complete development tree. At 0.6.32 the runtime audit has zero findings; the full audit has 16 high-severity findings inherited from the latest stable electron-builder's ASAR, universal-binary, Windows-installer, and legacy file-matching dependencies. The previous chain had 33 findings including 2 critical findings. npm's proposed downgrade to electron-builder 25 restores those critical findings, and broad overrides cross incompatible CommonJS/ESM and package APIs, so the remaining upstream build-only advisories are tracked rather than forcibly replaced.

Every change then requires a patch-version bump, changelog and release-note update, unsigned Intel x64 DMG build, mounted-image verification, bundled version and `x86_64` architecture check, SHA-256 calculation, and a source commit. This rule is also recorded in `AGENTS.md` so it survives future development sessions.
