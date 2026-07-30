# Memento Release Process

Memento releases are built and published by GitHub Actions. Developer machines do not upload platform packages directly to GitHub Releases.

## Published Targets

| Platform | Architecture | Package |
| --- | --- | --- |
| macOS | Intel x64 | DMG |
| macOS | Apple Silicon arm64 | DMG |
| Windows | x64 | NSIS EXE |
| Windows | arm64 | NSIS EXE |
| Linux | x64 | AppImage and DEB |
| Linux | arm64 | AppImage and DEB |

The packages are unsigned and unnotarized until repository signing credentials are configured. Full scanning and cleanup remain macOS-specific even though the desktop shell is packaged for every target above.

## Release Contract

1. Finish the source change on a development branch.
2. Bump the patch version in `package.json` and `package-lock.json`.
3. Update `CHANGELOG.md`, `RELEASE_NOTES.md`, and affected project documentation.
4. Run the repository verification contract and build the local Intel x64 DMG.
5. Commit the source, merge it into `main`, and push `main`.
6. Create and push the matching tag, for example `v0.6.43` for package version `0.6.43`.
7. Monitor the `Release` workflow until every validation, platform build, and publishing job succeeds.
8. Confirm that the GitHub Release contains eight platform packages plus `SHA256SUMS.txt`.

The workflow rejects a pushed tag when it does not exactly match `package.json`. A manual `workflow_dispatch` runs validation and all platform builds, uploads temporary Actions artifacts for 14 days, and intentionally does not create a GitHub Release.

## Triggering A Release

```bash
git switch main
git pull --ff-only origin main
git tag -a v0.6.43 -m "Memento 0.6.43"
git push origin v0.6.43
```

GitHub Actions uses the latest Node.js 22.x patch release, verifies built-in SQLite support, runs the full unit test suite and type checking once, then builds each target on its native runner. The publishing job collects the packages, generates `SHA256SUMS.txt`, creates or updates the bilingual GitHub Release from `RELEASE_NOTES.md`, and uploads every artifact with overwrite-safe retry behavior.

Do not reuse or move an existing release tag. Fix the source, increment the version, and publish a new tag instead.
