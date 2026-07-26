# Memento Release Workflow

For every user-requested code or UI change in this repository:

1. Bump the patch version in `package.json` and `package-lock.json`.
2. Update both `CHANGELOG.md` and `RELEASE_NOTES.md` for that version.
3. Run tests, type checking, the production build, the scan smoke test, and `git diff --check`.
4. Build a local Intel x64 macOS DMG with code-signing identity auto-discovery disabled.
5. Verify the DMG with `hdiutil`, confirm the bundled app version and `x86_64` executable architecture, and calculate its SHA-256.
6. Commit the source changes so the installer can be traced to a commit.
7. Give the user the installer path and SHA-256 without waiting for a reminder.

Local packages are unsigned and unnotarized unless working signing credentials are available.
