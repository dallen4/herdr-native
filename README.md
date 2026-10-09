# devhub

An agentic console for coding agents running on
[herdr](https://github.com/herdrdev/herdr): workspaces, chat, live
terminals and change review in one native app. Claude Code first.

> **Status: early alpha.** Built and used daily on macOS (desktop app,
> bridge, and the iPhone web build). Linux and Windows aren't tested.
> Expect breaking changes.

```
devhub app (your laptop) ──WS over tailnet──▶ devhub-bridge (herdr server) ──▶ herdr + Claude Code
```

## Requirements

- On each **herdr server**: [herdr](https://github.com/herdrdev/herdr),
  [Bun](https://bun.sh), Node.js (for the terminal sidecar), pnpm, and
  [Claude Code](https://docs.claude.com/en/docs/claude-code).
- On the **client machine**: pnpm, and for the native app, Rust plus
  the Xcode Command Line Tools on macOS.
- [Tailscale](https://tailscale.com) on both, on the same tailnet.

## Run the bridge (on the herdr server)

```bash
pnpm install
pnpm bridge:start                      # listens on 127.0.0.1:7417
tailscale serve --bg --set-path /devhub http://127.0.0.1:7417
```

Optional: `pnpm cli:install` compiles the `devhub` CLI to a standalone
binary and copies it to `~/.local/bin`, so
agents (or you) can run `devhub open <url|file>` inside a herdr pane to
pop a page up next to that pane in the app.

Your own Tailscale login is let in automatically. For anything else set
`DEVHUB_BRIDGE_TOKEN` and enter the token when adding the machine.

## On your phone (no app install)

```bash
pnpm web:build      # on the server, then restart the bridge
```

Open `https://<server>.<tailnet>.ts.net/devhub` in Safari and choose
Share → **Add to Home Screen**. It connects to that server on its own.

## Run the app (on your machine)

Needs Rust and, on macOS, the Xcode Command Line Tools.

```bash
pnpm install
pnpm tauri dev
```

Add the machine with its bridge URL (e.g.
`https://studio.tail1234.ts.net/devhub`), or choose **Use demo data**.
`pnpm dev` runs the same UI in a browser on http://localhost:1420.

## Fonts (optional)

The UI is designed for Clash Display and General Sans, which can't be
redistributed here. Without them it falls back to system fonts. To use
them, download both free from [Fontshare](https://www.fontshare.com)
and put these files in `public/fonts/` (gitignored):

- `ClashDisplay-Semibold.woff2`, `ClashDisplay-Bold.woff2`
- `GeneralSans-Variable.woff2`

## Security

The bridge can type into your terminals, so treat access to it like a
shell on that machine. It lets in only:

- requests carrying `DEVHUB_BRIDGE_TOKEN` (if set),
- requests proxied by `tailscale serve` from the Tailscale login that
  owns the machine,
- direct loopback requests with no proxy headers and a `localhost` /
  `127.0.0.1` Host (so a web page can't get in by DNS rebinding).

Requests from browser origins other than the app's own are refused.

Keep it bound to `127.0.0.1` (the default) and expose it only through
`tailscale serve`. Don't put another reverse proxy or tunnel in front
of it: one that doesn't send `X-Forwarded-For` (nginx's default
`proxy_pass`, for one) looks like a local request and is let in.
On a machine other people can log in to, set
`DEVHUB_BRIDGE_LOOPBACK=0` so local requests need the token too.

Anyone who gets in can read files under your home directory through
`/raw`. Files opened in browser panes are served sandboxed, so a
page's scripts can't act as the app.

The activity panel shows your Claude plan usage. To get it, the bridge
reads Claude Code's OAuth token on that machine (macOS keychain or
`~/.claude/.credentials.json`) and calls Anthropic's usage endpoint,
read-only. That endpoint isn't a documented public API.

## Docs

See `CLAUDE.md` for architecture and `specs/` for plans.

## License

MIT, see [`LICENSE`](LICENSE). The devhub brand marks, the Claude mark,
and the bundled fonts aren't covered; see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
