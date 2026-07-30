# Memento Agent Development Contract

The `agent` branch is a from-scratch product rebuild. Reuse deterministic scanner and cleanup internals when they remain useful, but do not restore the old Renderer, hosted AI analysis, Memento Server, OAuth, or AI Gateway architecture.

For every user-requested code or UI change in this repository, complete every item below before sending the final response. Do not defer packaging or wait for the user to remind you:

1. Treat `../prototypes/memento-agent/index.html` as the approved source of truth for Memento Agent UI structure, copy, and interaction. Keep the production implementation strictly aligned with it unless the user approves a prototype change first.
2. Bump the patch version in `package.json` and `package-lock.json`.
3. Update both `CHANGELOG.md` and `RELEASE_NOTES.md` for that version.
4. Run tests, type checking, the production build, the scan smoke test, the real Electron smoke test, the four-viewport UI smoke test, and `git diff --check`.
5. Build a local Intel x64 macOS DMG with code-signing identity auto-discovery disabled.
6. Verify the DMG with `hdiutil`, confirm the bundled app version and `x86_64` executable architecture, and calculate its SHA-256.
7. Commit the source changes so the installer can be traced to a commit.
8. Give the user the installer path and SHA-256 without waiting for a reminder.

When the user requests a public release, merge the verified source into `main`, push `main`, create the matching `v<package-version>` tag, and monitor `.github/workflows/release.yml` through successful publication. Confirm all expected platform assets and `SHA256SUMS.txt` in the GitHub Release before reporting completion.

Local packages are unsigned and unnotarized unless working signing credentials are available.
