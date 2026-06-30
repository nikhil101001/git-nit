# Releasing git-nit

How a versioned, signed, auto-updatable build is produced. Packaging is
[electron-builder](https://www.electron.build/) (`electron-builder.yml`); the CI
pipeline is `.github/workflows/release.yml`; in-app updates use `electron-updater`
against GitHub Releases.

## TL;DR

```sh
# bump version, then tag — CI does the rest
npm version 1.0.0            # or edit package.json "version"
git push && git push --tags  # pushing a v* tag triggers .github/workflows/release.yml
```

The tag build runs on macOS + Windows + Linux runners: `typecheck` → `test` →
`pnpm release` (build + sign + notarize + **publish to GitHub Releases**). The
published `latest*.yml` + installers are the auto-update feed.

## Local builds

```sh
pnpm pack:dir   # unpacked app under release/ (fast smoke; macOS arm64 needs ad-hoc signing to launch)
pnpm dist       # real installers (dmg/zip · nsis · AppImage/deb), unsigned, no publish
```

`release/` is git-ignored. On Apple Silicon an unsigned app must be at least
ad-hoc signed to run: `codesign --force --deep -s - release/mac-arm64/git-nit.app`.

## Required CI secrets (to activate signing — M5.2)

Set these in the repo's **Settings → Secrets and variables → Actions**. Without
them the build still runs but produces **unsigned** artifacts (Windows shows a
SmartScreen warning; macOS won't pass Gatekeeper / notarization is skipped).

| Secret | What |
|---|---|
| `MAC_CSC_LINK` | base64 of the **Developer ID Application** `.p12` |
| `MAC_CSC_KEY_PASSWORD` | password for that `.p12` |
| `APPLE_ID` | Apple ID for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password for that Apple ID |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `WIN_CSC_LINK` | base64 of the Windows Authenticode `.pfx` |
| `WIN_CSC_KEY_PASSWORD` | password for that `.pfx` |

`GH_TOKEN` is the workflow's built-in `GITHUB_TOKEN` (publishes the Release).

## Release checklist

1. **Icon** — add `build/icon.icns` (mac) / `build/icon.png` (≥512²) / `build/icon.ico`
   (win). *Currently the default Electron icon is used (a TODO for a branded v1).*
2. Set the signing secrets above (one-time).
3. Bump `version` in `package.json`.
4. Tag `vX.Y.Z` and push the tag → CI builds, signs, notarizes, publishes.
5. Verify on each OS: macOS `spctl --assess --type execute git-nit.app` passes and
   the notarization ticket is stapled; Windows installer shows a known publisher.
6. Smoke the auto-update: install the previous version, then confirm it offers and
   installs the new Release (the in-app **Update banner** → "Restart to update").

## Notes

- Auto-update runs **only in packaged builds** (no-op in dev). It installs only from
  the signed Release artifacts — never enable auto-update on an unsigned feed.
- `git` is a runtime prerequisite (v1 requires it on `PATH`; a min-version check
  warns if missing/old). Bundling a `git` sidecar is a deferred decision.
- No telemetry: uncaught errors go to a local rotating log in the app's userData
  (`Reveal error logs` in the ⌘K palette) — nothing is sent remotely.
