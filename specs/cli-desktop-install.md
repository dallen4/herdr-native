# CLI Installs and Updates the Desktop App

Mirrors deadrop's `deadrop desktop install` pattern
(`deadrop/specs/desktop-cli-install.md`, `deadrop/cli/lib/update/desktop.ts`),
adapted to devhub and carrying over what deadrop learned after that spec
landed.

## Goal

One `devhub` binary that you can drop on any machine:

- **On the laptop:** `devhub desktop install` installs or updates the
  devhub app (idempotent: a fresh install or an update, whichever applies).
- **Everywhere:** `devhub update` updates the CLI itself, then offers to
  update the desktop app, but only if it's already installed.
- **On the herdr server:** the existing `devhub open` / `devhub ls` keep
  working unchanged.

Plus the two standalone scripts deadrop has, `install.sh` (CLI) and
`install-desktop.sh` (app), for first installs before the CLI exists.

## Current state

- The CLI is `bridge/src/cli.ts`, compiled with `bun build --compile` to
  `bridge/dist/devhub`. `pnpm cli:install` copies it to `~/.local/bin`.
  It has `open`, `ls` and `help`.
- No versioning, release workflows, tags, or GitHub Releases exist yet.
  `package.json`, `tauri.conf.json` and `Cargo.toml` all say `0.1.0` and
  nothing keeps them in sync.
- The desktop app is built only by hand (`pnpm tauri build`). It bundles
  as `devhub.app` (`productName: "devhub"`), unsigned.
- **The repository is public**, so release listings and asset downloads
  work unauthenticated. A token only lifts GitHub's anonymous rate limit.

## Lessons carried over from deadrop

1. **Namespaced tags from day one.** deadrop's CLI and desktop release
   trains shared one Releases list, and `GET /releases/latest` silently
   picked whichever was cut last, breaking `install.sh` and self-update.
   devhub uses distinct prefixes, `devhub-cli@X.Y.Z` and
   `devhub-desktop@X.Y.Z`, and **never** calls `/releases/latest`: it
   lists releases and takes the first tag with the exact prefix.
2. **Resolve asset names from the release, never from the tag.** Tauri
   names bundles from `tauri.conf.json`, which can disagree with the tag.
3. **Sync versions mechanically.** deadrop's `desktop-…@0.2.2` shipped
   assets named `0.1.0`. devhub gets a `scripts/sync-version.ts` (from
   deadrop's `desktop/scripts/sync-version.js`) that writes the app
   version from `package.json` into `tauri.conf.json`, `Cargo.toml` and
   `Cargo.lock`, with `--check` as a CI drift guard.
4. **A checksum for every asset**, generated in the publish workflow, and
   verified before anything touches `/Applications` or replaces a binary.

## Scope

- **In scope:**
  - Moving the CLI into its own workspace package.
  - Versioning with namespaced tags.
  - CLI and desktop publish workflows, with checksums.
  - Optional GitHub authentication (rate limits).
  - `devhub desktop install [--force]` and `devhub update [--skip-desktop]`.
  - `devhub version`.
  - `install.sh` and `install-desktop.sh`, macOS first.
- **Out of scope:**
  - Code signing and notarization (an existing, accepted gap).
  - Linux and Windows desktop installs. The interfaces stay OS-agnostic so
    deadrop's AppImage and NSIS handling can be lifted later.
  - `devhub desktop uninstall`; the `desktop` command group leaves room for it.
  - `devhub bridge install` (launchd service plus `tailscale serve`), which
    gets a separate spec. It's the natural next CLI command.

## Design

### 1. CLI becomes its own package: `cli/` (`devhub-cli`)

The CLI is about to grow (desktop install, self-update, and later bridge
install), and it only depends on `shared/`, not on bridge internals. Move
`bridge/src/cli.ts` to `cli/src/` as a pnpm workspace package
`devhub-cli`:

```
cli/
  package.json         name: devhub-cli, version: 0.1.0, private
  src/index.ts         command dispatch (open, ls, desktop, update, version)
  src/commands/        open.ts, ls.ts, desktop-install.ts, update.ts
  src/lib/releases.ts  list releases, pick by tag prefix, resolve assets
  src/lib/download.ts  authenticated download + sha256 verify
  src/lib/desktop.ts   installed version, install-or-update (macOS)
  src/lib/self.ts      replace the running binary atomically
```

- **Build:** `bun build --compile --minify --define DEVHUB_CLI_VERSION=…`,
  so the binary knows its own version (`devhub version`).
- `pnpm cli:build` and `pnpm cli:install` keep their meaning and point at
  the new package.

### 2. Versioning and tags

- **Changesets**, as in deadrop: a `release.yml` workflow opens or merges
  "version packages" PRs. Two versioned packages:
  - `devhub-cli` (`cli/package.json`) → tag **`devhub-cli@X.Y.Z`**
  - the app, with the root package renamed `devhub-desktop` → tag
    **`devhub-desktop@X.Y.Z`**
- Changesets' `privatePackages: { version: true, tag: true }` creates the
  tags without publishing anything to npm.
- **`scripts/sync-version.ts`** runs as part of `changeset:version` and
  copies the app version into `tauri.conf.json`, `Cargo.toml` and
  `Cargo.lock`. CI runs it with `--check`.
- The bridge (`@devhub/bridge`) stays unversioned for now. It runs from
  the git checkout.

### 3. Publish workflows

- **`cli_publish_workflow.yml`**, on `devhub-cli@*` tags: one Ubuntu runner
  cross-compiles with Bun's targets: `bun-darwin-arm64`,
  `bun-darwin-x64`, `bun-linux-x64` and `bun-linux-arm64`. Assets are
  named `devhub-<os>-<arch>`, each with a `.sha256`, uploaded to the
  tag's GitHub Release.
- **`desktop_publish_workflow.yml`**, on `devhub-desktop@*` tags: deadrop's
  workflow, trimmed to the macOS universal job for now. It runs
  `tauri-apps/tauri-action@v1` with
  `--target universal-apple-darwin`, then `shasum -a 256` on the `.dmg`
  and `gh release upload` of the `.sha256`. It runs `sync-version --check`
  first, so a mismatch fails before building.

### 4. Authentication (optional)

GitHub calls (listing releases, downloading assets) work anonymously. If
a token is available it's sent, to avoid the anonymous rate limit:

1. `DEVHUB_GITHUB_TOKEN`, or `GITHUB_TOKEN` if set.
2. Otherwise `gh auth token`, if the GitHub CLI is installed and signed
   in.
3. Otherwise no token. A 403 rate-limit response gets a clear message
   suggesting one of the above.

Assets download through the API (`GET /repos/{repo}/releases/assets/{id}`
with `Accept: application/octet-stream`), so the same path works with or
without a token. The token is only ever sent to `api.github.com` and
GitHub's redirect target, never logged.

The scripts in §7 use the same order (env token, then `gh auth token`).

### 5. `devhub desktop install [--force]` (macOS)

Idempotent. Steps:

1. **Platform guard:** not macOS → "the desktop app installs on macOS for
   now", exit 1, before any network call.
2. `latestRelease('devhub-desktop@')`. If none → "no published desktop
   release found", exit 1.
3. Find the asset ending in `.dmg` and its `<name>.sha256` sibling.
4. **Installed version:**
   `plutil -extract CFBundleShortVersionString raw /Applications/devhub.app/Contents/Info.plist`.
   A missing app or a malformed plist counts as "not installed".
5. Same version and no `--force` → "already on the latest version (vX)",
   exit 0, no download.
6. **App running?** (`pgrep -x devhub`) → ask to quit it first. Confirmed:
   `osascript -e 'quit app "devhub"'`, wait up to 10 s. Declined, or a
   non-interactive shell → stop with a message. Replacing a running
   bundle can corrupt the update; deadrop doesn't handle this case.
7. Download the `.dmg` and `.sha256` to a temp dir and **verify**; on a
   mismatch, abort before touching `/Applications`.
8. `hdiutil attach -nobrowse -quiet`, `rm -rf /Applications/devhub.app`,
   `ditto <volume>/devhub.app /Applications/devhub.app`, then
   `hdiutil detach`. Detach and temp-dir cleanup run in `finally`, so a
   failure still unmounts.
9. Report "Installed" or "Updated vX → vY". Downloads made with
   `fetch`/`curl` carry no quarantine attribute, so Gatekeeper usually
   won't prompt. If it does, the message explains right-click → Open
   (unsigned build).

### 6. `devhub update [--skip-desktop]`

1. **The CLI updates itself first:** `latestRelease('devhub-cli@')`,
   compared with the compiled-in version. If newer, download
   `devhub-<os>-<arch>` plus its `.sha256` and verify. Then write it next
   to `process.execPath`, `chmod 755`, and `rename()` it over the running
   binary. That's atomic on the same filesystem, and the running process
   keeps its old inode.
2. **Then the desktop check**, macOS only and skipped with
   `--skip-desktop`:
   - not installed → silent
   - installed and current → silent
   - newer available → prompt "A newer desktop version is available
     (vX → vY). Update now? (Y/n)"; confirmed → §5 steps 6–9.
3. Desktop failures are warnings, not errors, because the CLI update
   already succeeded. A declined prompt still exits 0.

### 7. Scripts (first install)

- **`install.sh`:**
  - Resolves a token (§4).
  - Lists releases and takes the first `devhub-cli@` tag.
  - Picks `devhub-$(uname -s)-$(uname -m)` (mapping `x86_64` to `x64` and
    `aarch64` to `arm64`).
  - Verifies the checksum and installs to `~/.local/bin/devhub`.
  - Offers the PATH export, as in deadrop.
- **`install-desktop.sh`:** the bash twin of §5, matching deadrop's
  precedent of an independent bash implementation. Same platform guard,
  prefix lookup, checksum, running-app check, and
  `hdiutil`/`ditto`/`detach`, with a `trap` for cleanup.

Because the repo is public, both scripts work via `curl | sh` from a raw
URL, as in deadrop, as well as from a checkout.

## Error handling

| Situation                       | `desktop install` / scripts    | `update` (desktop part) |
| ------------------------------- | ------------------------------ | ----------------------- |
| Anonymous rate limit hit        | Suggest a token, exit 1        | Warn, skip              |
| No matching release             | "None published yet", exit 1   | Skip silently           |
| Checksum mismatch               | Abort before touching anything | Warn                    |
| `hdiutil attach` fails          | Abort, clean up temp dir       | Warn                    |
| `/Applications` not writable    | Surface `ditto`'s error        | Warn                    |
| App running, user declines quit | Stop with message, exit 1      | Warn, skip              |
| Malformed `Info.plist`          | Treat as not installed         | Treat as not installed  |

## Verification

1. **`sync-version`:** bumping `package.json` updates all three files, and
   `--check` fails on drift.
2. **CLI publish:** a `devhub-cli@0.1.0` tag produces 4 binaries plus 4
   checksums, each running `devhub version` on its platform. Only the
   macOS arm64 binary can be checked by hand on our machines.
3. **Desktop publish:** a `devhub-desktop@0.1.0` tag produces the `.dmg`
   plus its `.sha256`, named with `0.1.0`.
4. **`devhub desktop install` on the laptop:**
   - fresh install
   - a re-run that prints "already on the latest"
   - an update in place from an older version
   - `--force`
   - with the app running: the quit prompt, both answers
5. **`devhub update`:** CLI self-replacement (old process exits cleanly,
   new `devhub version` reports the new version); the desktop prompt
   accepted and declined; `--skip-desktop`; desktop not installed (no
   output).
6. **Auth:** with no token and no `gh`, installs work anonymously; with
   `gh auth token`, the token is sent; it never appears in output.
7. **Platform guard:** `devhub desktop install` on the Linux build fails
   before any network call.

## Open decisions

1. **Changesets vs plain tags:** changesets mirrors deadrop and handles
   the version bumps and tags. Pushing `devhub-cli@X` tags by hand would
   work for now but is easier to get wrong.
2. **Root package rename** (`devhub` → `devhub-desktop`) to get the right
   tag name from changesets. The alternative is a custom tag format, but
   changesets doesn't support per-package tag formats cleanly.

## Build order

1. Move the CLI to `cli/`, with `devhub version` and the compiled-in
   version.
2. `sync-version.ts`, plus changesets with the two private packages and
   namespaced tags.
3. The publish workflows, with checksums. Cut `devhub-cli@0.1.0` and
   `devhub-desktop@0.1.0`.
4. `cli/src/lib` (releases, download with auth, desktop, self-update), then
   `devhub desktop install`.
5. `devhub update` (self-update plus the desktop prompt).
6. `install.sh` and `install-desktop.sh`.
