# Memento Agent Development Contract

Memento Agent is a from-scratch product rebuild. Reuse deterministic scanner and cleanup internals when they remain useful, but do not restore the old Renderer, hosted AI analysis, Memento Server, OAuth, or AI Gateway architecture.

For every user-requested code or UI change in this repository, complete every item below before sending the final response. Do not defer packaging or wait for the user to remind you:

1. Keep UI structure, copy, and interaction consistent across the production Renderer, current project documentation, and automated UI coverage in this repository. Update them together when visible behavior changes.
2. Bump the patch version in `package.json` and `package-lock.json`.
3. Update both `CHANGELOG.md` and `RELEASE_NOTES.md` for that version.
4. Run tests, type checking, the production build, the scan smoke test, the real Electron smoke test, the four-viewport UI smoke test, and `git diff --check`.
5. Build a local Intel x64 macOS DMG with the exact project-owned Developer ID identity qualifier.
6. Verify the DMG with `hdiutil`, confirm the bundled app version, `x86_64` executable architecture, and strict Developer ID bundle signature, and calculate its SHA-256.
7. Commit the source changes so the installer can be traced to a commit.
8. Give the user the installer path and SHA-256 without waiting for a reminder.

When the user requests a public release, merge the verified source into `main`, push `main`, create the matching `v<package-version>` tag, and monitor `.github/workflows/release.yml` through successful publication. Confirm all expected platform assets and `SHA256SUMS.txt` in the GitHub Release before reporting completion.

Local macOS packages are Developer ID signed when the project identity is available. Public workflow packages must also be notarized and stapled before upload.
