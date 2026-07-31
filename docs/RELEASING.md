# Memento Release Process

GitHub Actions is the only supported path for publishing Memento packages. Developer machines produce the required traceability build but do not upload platform packages directly to GitHub Releases.

## Published Targets

| Platform | Architecture | Package |
| --- | --- | --- |
| macOS | Intel x64 | DMG |
| macOS | Apple Silicon arm64 | DMG |
| Windows | x64 | NSIS EXE |
| Windows | arm64 | NSIS EXE |
| Linux | x64 | AppImage and DEB |
| Linux | arm64 | AppImage and DEB |

Full scanning and cleanup remain macOS-specific. Public macOS packages are signed with the project Developer ID Application identity, notarized by Apple, and stapled before upload.

## Change Checklist

For every user-requested code or UI change:

1. Bump the patch version in `package.json` and `package-lock.json`.
2. Update `CHANGELOG.md`, `RELEASE_NOTES.md`, and affected project documentation.
3. Run the complete verification suite below.
4. Build and verify the local Intel x64 DMG.
5. Commit the source so the package can be traced to an exact revision.

Documentation-only maintenance does not create a new application package unless it is part of a release or changes user-visible release material.

## Local Verification

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run scan:smoke
npm run electron:smoke
npm run audit:runtime
git diff --check
```

Start the web development server in one terminal:

```bash
npm run dev:web -- --port 4174
```

Keep it running while the UI smoke test executes in another terminal:

```bash
npm run ui:smoke -- http://127.0.0.1:4174
```

Build the required local package with the exact project identity qualifier:

```bash
CSC_NAME='Beijing Digital Union Network Technology Co., Ltd. (6EDPX6CD7U)' npm run dist:mac -- --x64
```

Before committing, verify all of the following:

- `hdiutil verify` accepts `release/Memento-<version>-x64.dmg`.
- The mounted `Memento.app` reports the same version as `package.json`.
- `file Memento.app/Contents/MacOS/Memento` reports an `x86_64` executable.
- `codesign --verify --deep --strict` accepts the mounted application bundle.
- `codesign --display --verbose=4` reports the expected Developer ID authority and Team ID `6EDPX6CD7U`.
- A SHA-256 checksum is recorded for the DMG.
- The source commit contains the matching version and release notes.

## Public Release

1. Merge the verified source into `main` and push `main`.
2. Read the version from `package.json` and create the matching annotated tag.
3. Push the tag and monitor the `Release` workflow through publication.
4. Confirm that the GitHub Release contains eight platform packages plus `SHA256SUMS.txt`.
5. Confirm that `SHA256SUMS.txt` has exactly eight package entries and does not include itself.
6. Confirm that both macOS DMGs pass Gatekeeper and contain valid stapled notarization tickets.

```bash
git switch main
git pull --ff-only origin main
version="$(node -p "require('./package.json').version")"
git tag -a "v${version}" -m "Memento ${version}"
git push origin "v${version}"
```

The workflow rejects a pushed tag that does not exactly match `package.json`. A manual `workflow_dispatch` runs validation and the same native build matrix, retains temporary Actions artifacts for 14 days, and intentionally does not create a public release.

Do not reuse or move an existing release tag. Fix the source, increment the version, and publish a new tag.
