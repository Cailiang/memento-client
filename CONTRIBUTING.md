# Contributing to Memento

Memento accepts focused fixes to its deterministic macOS scanner, operation safety boundaries, local Agent experience, documentation, and tests. Read [SECURITY.md](SECURITY.md) before reporting a vulnerability and use the false-positive issue template for incorrect findings.

## Development

Requirements are macOS, Node.js 22.13 or later, and npm.

```bash
npm ci
npm run dev
```

Before opening a pull request, run:

```bash
npm test
npm run typecheck
npm run build
npm run scan:smoke
npm run electron:smoke
```

Run the four-viewport Renderer smoke test as documented in [docs/RELEASING.md](docs/RELEASING.md), and run `git diff --check`.

## Finding and Operation Rules

Every new finding must define confidence, stable reason codes, estimate quality, risk, evidence, and its effect on health. Weak ownership guesses are review clues: they must not reduce health, increase safely reclaimable space, or be selected automatically.

Every new operation must be derived from the current scan, use an opaque registered ID, revalidate its target immediately before execution, report a stable error code, verify the result, and write to the maintenance ledger. User data requires an explicit review boundary and must never be treated as rebuildable cache content.

Tests must use temporary directories and must not inspect or mutate the developer's real Home directory.

## Pull Requests

Keep changes scoped, explain the safety boundary, list user-visible behavior, and include regression coverage. Do not copy code, path lists, comments, or test data from GPL projects. Documentation and UI copy must be updated with behavior changes.
