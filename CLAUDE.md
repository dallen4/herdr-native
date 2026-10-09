# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**devhub** is an agentic hub: a Tauri v2 desktop app (Rust shell + React 19 / Vite webview) that will grow in three directions:

1. **Agent runtime coordination**: discovering, launching, and tracking local and remote agent processes and sessions.
2. **Orchestration** (later): running multi-agent workflows on top of that coordination layer.
3. **Custom, evolving experiences via [AG-UI](https://docs.ag-ui.com)**: agents stream AG-UI events (lifecycle, text messages, tool calls, state snapshots and deltas) to the webview, which renders and adapts UI from them. The UI is driven by the agent protocol, so don't hardcode it per agent.

**Roadmap:** **M1** is a native console with herdr-web-ui parity for workspaces, chat, and terminals (scope and build order: `specs/m1-herdr-parity.md`). **M2** is generative UI. Build M1 so chat renders from AG-UI from day one.

The product is a **working console**: chat, terminal, and generative UI side by side. The end goal is for Claude, including Claude Code sessions in herdr, to **build interactive experiences inside the app on demand**. AG-UI is the standard runtime protocol for that. It isn't itself a generative UI spec; it carries one (ours, or A2UI / MCP-UI). A generated experience is a live AG-UI participant, not static output:
- It binds to state snapshots and deltas.
- User actions in it flow back as tool results or new runs.
- It can be pinned as a persistent view that keeps its agent thread, so Claude can keep evolving it.

Planned mechanics:
- A devhub MCP server gives Claude Code UI tools (`show_ui`, `ask_user`, …). The tool call stays open until the user interacts, and the user's input becomes the tool result.
- Claude Code hooks (`PreToolUse`, `Stop`, …) provide approvals and run boundaries.
- UI comes from a devhub component catalog first, with sandboxed iframe code as the escape hatch.

**First layer: [herdr](https://github.com/herdrdev/herdr), on remote machines.** devhub doesn't spawn or own agent processes. herdr does, and devhub is a client on top of it. **devhub is remote-first:** the app runs on the user's client machine and connects to herdr servers over the user's private **Tailscale** tailnet. (The repo's dev machine is itself a herdr server, which is why Claude Code sessions here run inside a herdr pane with `HERDR_ENV`, `HERDR_PANE_ID`, and `HERDR_SOCKET_PATH` set. Don't let that leak into the design as "herdr is local".) The only agent for now is **Claude Code**.

**Current state:** M1 (herdr-web-ui parity) is implemented end to end: the bridge (`bridge/`), the shared wire contract (`shared/`), and the console (`src/`). It's verified against an isolated herdr session and in a browser; the Rust side has never been compiled on the dev machine (see "Rust toolchain" below). Status per slice is in `specs/m1-herdr-parity.md`.

## Repo layout

pnpm workspaces. The Tauri app stays at the repo root; `bridge/` and `shared/` are workspace packages.

- `src/`, `src-tauri/`: the devhub app (React webview + Rust shell).
- `bridge/` (`@devhub/bridge`): devhub-bridge, run with Bun on each herdr server.
- `shared/` (`@devhub/shared`): what both sides import, as TS source (no build step): `hub.ts` (hub/pane/prompt types), `protocol.ts` (WS frames + typed ops), `agui.ts` (the AG-UI message reducer), `herdr/` (generated herdr types + raw schema).

## Commands

The package manager is **pnpm** (`tauri.conf.json` runs `pnpm dev` / `pnpm build` as its before-commands). Run `pnpm install` first.

```bash
pnpm dev            # vite only (frontend in a browser, no Rust): fast UI iteration on :1420
pnpm tauri dev      # the native window (starts vite via beforeDevCommand)
pnpm build          # tsc && vite build → dist/  (typecheck gates the build)
pnpm tauri build    # bundle the native app; add `--features devtools` for an inspector in release
pnpm typecheck      # app + bridge + shared
pnpm test           # vitest (src/**/*.test.ts, pure logic only)
pnpm vitest run src/lib/session/turns.test.ts   # a single app test file
pnpm test:bridge    # bun test (bridge/src/**/*.test.ts)
pnpm format         # prettier --write . (workspace style: 70 cols, single quotes)
cargo check --manifest-path src-tauri/Cargo.toml   # Rust-only check

pnpm bridge         # run devhub-bridge with --watch (bun bridge/src/index.ts)
pnpm api:sync       # regenerate herdr types from `herdr api schema --json`
pnpm api:check      # exit 1 if that schema differs from the committed one
```

**Bridge env:** `DEVHUB_BRIDGE_PORT` (7417), `DEVHUB_BRIDGE_HOST` (127.0.0.1), `DEVHUB_BRIDGE_BASE_PATH` (for `tailscale serve --set-path`), `DEVHUB_BRIDGE_TOKEN`, `DEVHUB_BRIDGE_OWNER` (Tailscale login; auto-detected), `DEVHUB_BRIDGE_LOOPBACK` (`0` = loopback needs the token too), `HERDR_SOCKET_PATH`, `DEVHUB_HERDR_BIN`.

**Testing against herdr without touching the user's session:** run an isolated headless herdr (`herdr --session devhub-test server`, with every `HERDR_*` variable unset, because this repo's own shells run inside herdr panes), point a bridge at it (`HERDR_SOCKET_PATH=~/.config/herdr/sessions/devhub-test/herdr.sock DEVHUB_BRIDGE_PORT=7419 bun bridge/src/index.ts`), and only create, attach to, or type into panes in that session. Reading the real session (snapshots, transcripts) is fine; acting on it is not.

**Rust toolchain:** `cargo` lives in `~/.cargo/bin`, which may not be on the PATH in agent shells (`export PATH="$HOME/.cargo/bin:$PATH"`). Building Rust on macOS also needs the Xcode Command Line Tools (`xcode-select --install`). The herdr server Mac doesn't have them, so Rust can't be compiled or checked there. Build the native app on a client machine that has them.

Vite must stay on port **1420** with `strictPort` (Tauri's `devUrl` expects it). HMR uses 1421 when `TAURI_DEV_HOST` is set.

## Architecture

### Rust shell (`src-tauri/`)
- `main.rs` only calls `devhub_lib::run()`. Builder setup, plugins, and commands live in `lib.rs`, with one module per concern (`app_info.rs`, `keychain.rs`). Register new commands in `generate_handler![...]`.
- **Every command returns `error::Result<T>`** (`src/error.rs`: a `thiserror` enum serialized as `{ code, message }`), so a failed `invoke` rejects with a matchable shape. Don't return `Option`/unit to swallow failures. Typed TS wrappers live in `src/lib/native.ts` and `src/lib/credentials.ts`.
- **Keychain:** `secret_get` / `secret_set` / `secret_delete` (service `devhub`, account `bridge-token:<machineId>`), using the `keyring` crate with deadrop's feature set. Bridge tokens never go to webview storage inside Tauri.
- **Browser panes** (`browser.rs`): child webviews need tauri's `unstable` feature. The webview creates, positions, shows, hides and closes them through the JS `Webview` API (`src/lib/native-browser.ts`); Rust only does what JS can't: `browser_navigate`, `browser_history` (back/forward/reload via `eval`), and `browser_url`. They draw above the DOM, so `BrowserView` hides its webview whenever an overlay is open or the pane unmounts.
- **Plugins:** opener, notification (WKWebView has no Notification API; `src/lib/notify.ts` picks the plugin or the browser API).
- **Capabilities** (`capabilities/default.json`): every permission the webview uses must be granted here. A missing grant fails at runtime, never at build time.
- **Window:** `titleBarStyle: "Overlay"` + `hiddenTitle`, so the macOS traffic lights sit over the webview. `TopBar` insets for them (only inside Tauri on macOS) and marks itself `data-tauri-drag-region`; the drag attribute goes on the bar and its empty spacer only. `backgroundColor` matches the ground color to avoid a white flash.
- **CSP is real in release:** self only, `'unsafe-inline'` styles for antd's CSS-in-JS, IPC, and `connect-src` limited to `*.ts.net` (https/wss) and localhost for bridges. `devCsp` is null so Vite HMR works.
- **App icons:** two masters, `src-tauri/app-icon.svg` (desktop, an inset rounded square on Apple's macOS grid) and `src-tauri/app-icon-mobile.svg` (full-bleed for iOS/Android, which apply their own masks). `pnpm icons` regenerates every size into `src-tauri/icons/` and refreshes the Xcode asset catalog if `src-tauri/gen/apple` exists, so run it again after `tauri ios init`; `pnpm ios:build` (icons, then `tauri ios build --export-method debugging`) always does. The web favicon is `public/favicon.svg`.
- `devtools` Cargo feature: `pnpm tauri build --features devtools` opens the inspector in a packaged build.

### Webview (`src/`), following deadrop/desktop's structure
- `main.tsx`: `BootErrorBoundary` → `XProvider` (antd theme) → antd `App` (message/modal) → `HubProvider` → `RouterProvider`. The router root also has a `RouteError` element.
- `router.tsx`: `RootLayout` (UiProvider, ⌘K shortcut, top bar, `Outlet`) with `/` and `/m/:machineId/p/:paneId` (Console) and `/machines`. With no pane selected, the console redirects to whichever agent has waited longest for the user; with no machine chosen, to `/machines`.
- `contexts/HubContext.tsx`: **the injection seam.** Owns the saved machines, the active one, and its `HubConnection` (`lib/hub/connection.ts`): a `BridgeClient` for real machines, `createMockConnection()` for demo mode. Exposes the snapshot, connection status, derived counts and attention, and fires native notifications on needs-you/finished transitions while the window is unfocused. Use `useConnection()` only below a connected route; `useHub().connection` can be null while connecting.
- `contexts/UiContext.tsx`: overlays (palette, new-agent modal, files and changes drawers), opened from anywhere.
- `lib/`: framework-free logic.
  - `bridge/client.ts`: one WebSocket per machine, with reconnect and re-subscribe, typed `request(op, args)`, and terminal fan-out (one bridge attach per pane shared by every local view, with a replay buffer).
  - `hub/`: `connection.ts` (the interface), `mock-connection.ts`, `derive.ts` (+ tests).
  - `session/turns.ts` (+ tests): AG-UI messages → turns, tool steps with results and summaries, and the latest TodoWrite plan.
  - `composer.ts` (per-pane drafts in localStorage; the send-later queue), `machines.ts`, `credentials.ts`, `notify.ts`, `native.ts`, `routes.ts`.
- `hooks/`: `use-session.ts` (subscribe to a pane's AG-UI stream and reduce it with `@devhub/shared/agui`), `use-app-info.ts`.
- `components/` uses atomic design. Atoms include `PaneIcon` (🤖 agent, 💻 shell). `ContextMenu` (molecule) is the one way to add right-click menus; every row, tab, message, tool step, file and diff entry has one. Molecules include `UsageMeter`, `Reasoning` (one-line collapsible reasoning), `XTerm` (xterm.js on a bridge attach; copy on select), `PromptCard`, `ToolSteps` (one quiet row per call; a run of calls folds into one "N steps" line; rows expand to output), `Markdown` (XMarkdown), `DiffView` (Prism-highlighted, with add/remove as a gutter mark plus a faint tint so token contrast holds). Syntax highlighting lives in `lib/highlight.ts`, with token colors in `theme/global.css` (`.devhub-code`). Organisms include `SessionView` (the chat is a plain list, not `Bubble.List`: user prompts are right-aligned bubbles, agent turns take the full column, plus a working indicator and jump-to-latest), `Composer` (Sender + Suggestion for `/` and `@`, queue, image paste), `TerminalDock`, `WorkspaceSidebar` (herdr-web-ui's nesting: one compact row per workspace, panes nested under it when it has more than one, linked worktrees nested under their repo via `repoKey`), `CommandPalette`, `NewAgentModal`, `FilesDrawer`, `ChangesDrawer`, `AttentionPanel`, `TopBar`, `BrowserView` (browser panes from `snapshot.browserTabs`, routed at `/b/:tabId` or shown beside an agent in Split view; a native webview in Tauri, an iframe fallback under `pnpm dev`). Per-pane view state (Chat/Terminal/Split and what sits on the right) lives in `UiContext`, so a tab an agent opens with `devhub open` can flip that agent into Split.
- **Phone layout** (`useIsMobile`, ≤820px): one column. The sidebar is a left drawer and the activity panel is a bottom sheet (`UiContext.navOpen`/`sheetOpen`, closed on navigation). The session header is compact (Chat/Terminal only; Split reads as Chat), the dock is hidden, the files and changes drawers stack list → detail, and `XTerm` adds a key bar (Esc, Tab, arrows, ^C, sticky Ctrl via `lib/terminal-keys.ts`). Safe-area insets come from `viewport-fit=cover`. **Keyboard:** `lib/viewport.ts` sizes the body to the visual viewport (`--app-height`) and sets `data-keyboard` while it's up, because iOS scrolls the page instead of resizing it; `maximum-scale=1` plus 16px fields on coarse pointers stop focus zoom. On touch devices nothing autofocuses, Return in the composer is a newline (the button sends), tapping the conversation dismisses the keyboard, and the terminal's input has autocorrect and autocapitalize off. On desktop the composer takes focus when you switch panes. Toasts are restyled in `global.css` (lighter card, edge, shadow, below the notch). Use `isMacDesktop()`/`isTouchDevice()` (`lib/native.ts`), never a bare `userAgent.includes('Mac')`: iPhone and iPad user agents say Mac too. On touch devices, web tabs render a hand-off card (`lib/deeplink.ts`): "Open in GitHub/Linear/…" sends the URL through the opener plugin, so iOS universal links open the matching app if installed, otherwise Safari. Server files (`devhub-file://`) still render in place. Child webviews are desktop-only.
- Pane identity is always `machineId` + `paneId` (`paneKey`, `panePath`). Never key by `paneId` alone. The bridge stamps the machine id the client sent in `hello`.
- Strict TS (`noUnusedLocals`/`noUnusedParameters`), imports with explicit `.ts`/`.tsx` extensions.

## herdr Integration

### What herdr is

herdr is a Rust terminal multiplexer and agent runtime. Its hierarchy is **workspaces → tabs → panes** (public pane ids look like `w1:p1`). It owns every PTY, scrollback buffer, and agent process. It tracks per-pane agent state (`idle` / `working` / `blocked` / `done` / `unknown`), keeps sessions alive across detaches, and can resume supported agents after a restart.

- **Socket API:** newline-delimited JSON over a local Unix socket. Resolve the path from `HERDR_SOCKET_PATH`, then `~/.config/herdr/herdr.sock` (named sessions use `~/.config/herdr/sessions/<name>/herdr.sock`). Requests look like `{"id","method","params"}`, with dot-named methods (`session.snapshot`, `workspace.*`, `tab.*`, `pane.*`, `agent.prompt`/`agent.wait`, `events.subscribe`, `worktree.*`, `pane.report_agent`, …).
- **Socket rules:**
  - herdr closes the socket after each response, so use one connection per RPC and never pool.
  - Only `events.subscribe` stays open, and a second subscribe on the same connection is silently ignored. To change the subscription set, reopen with the full set.
  - Bootstrap and recovery: subscribe first, then call `session.snapshot` to reconcile. Events only invalidate cached state and can't be replayed onto an old snapshot.
  - `pane.process_info` takes `pane_id`, not `target`. Given `target`, it silently answers for the focused pane.
- **Terminal streaming:** the source of truth is the byte stream from `herdr terminal attach <terminal_id>` running in a PTY, not `pane.read`. Never pass `--takeover` unless the user explicitly asks for it, so devhub coexists with the user's herdr TUI and other clients.

### Remote topology: devhub-bridge on each herdr server

herdr's socket is local to its machine, and live terminals (`herdr terminal attach` in a PTY), Claude Code transcripts, and screen reads all live on that machine too. So each herdr server runs a **devhub-bridge**:

```
devhub app (client machine)  ──WS/HTTP over tailnet──▶  devhub-bridge (herdr server)  ──Unix socket / PTY / files──▶  herdr + Claude Code
```

- **The bridge** (`bridge/`, Bun + TS) owns everything host-side:
  - `herdr/client.ts`: the RPC client (one connection per call) and `subscribe`.
  - `hub/collector.ts` + `hub/build.ts`: one subscription (global structure events plus per-pane agent status). Every event schedules a debounced resnapshot, so the snapshot is the truth; the subscription reopens with backoff and whenever the agent pane set changes. Tracks when each status changed and git branches per workspace.
  - `pty/`: `herdr terminal attach` in a Node sidecar (node-pty must never load in Bun), one attach per pane shared by all clients, a 256 KB replay buffer, pause/resume backpressure, `HERDR_*` env stripped.
  - `claude/`: transcript location and tailing, translation of transcript lines to AG-UI events (`translate.ts`), and the screen prompt parser (`prompt.ts`).
  - `session.ts`: per-pane session streams (a `MESSAGES_SNAPSHOT` on subscribe, then incremental events, plus `devhub.prompt` / `devhub.meta` CUSTOM events), and `PromptWatcher`, which polls blocked agents' screens.
  - `claude/commands.ts`: slash commands. Built-ins are read from the installed Claude Code binary (the `type:"local"|"local-jsx"|"prompt"` command table), cached by path+mtime, so new ones like `/voice` appear without code changes; plus user and project commands, skills, and enabled plugins' commands and skills.
  - `browser/`: browser tabs. devhub owns them (herdr has no browsers); herdr stays the source of truth for everything else. `store.ts` persists tabs in `~/.config/devhub-bridge/browser-tabs.json` (`DEVHUB_BRIDGE_STATE_DIR`), and the server merges them into every hub snapshot. **Anchor rule** (`anchors.ts`): each tab stores the herdr workspace/pane ids it belongs to plus a fingerprint (workspace path and name, pane title). If the id still exists and fits the fingerprint, keep it. If not (a herdr restart renumbered or reused ids), re-find the workspace by path, then by name, and persist the refreshed ids. If nothing fits, show the tab free-standing but keep its old anchor on disk. Don't give herdr panes devhub ids; only browser tabs get them.
  - `cli.ts`: the `devhub` CLI for use inside herdr panes (`devhub open <url|file>`, `devhub ls`). It calls the bridge's `/api/cli/*` endpoints on loopback and passes `HERDR_PANE_ID`, so tabs anchor next to the calling agent. Shipped as a standalone Bun binary: `pnpm cli:build` compiles `bridge/dist/devhub` (`bun build --compile`), and `pnpm cli:install` builds it and copies it to `~/.local/bin/devhub`. Re-run `cli:install` after changing `cli.ts`.
  - `GET /raw?path=`: serves a file under `$HOME` for browser panes. Tabs for server files store `devhub-file://<abs path>`, and the app turns that into `<bridge>/raw?path=` (`loadableUrl` in `shared/src/browser.ts`).
  - `web.ts`: serves the app's **web build** (`pnpm web:build` → `dist-web/`, relative asset paths; `DEVHUB_WEB_DIST` overrides) for any non-API path, so a phone opens the bridge URL and gets devhub (Add to Home Screen gives a full-screen app via `manifest.webmanifest` and the Apple web-app meta tags). Files resolve by path suffix, so it works whether or not `tailscale serve` strips the mount path; anything that isn't a file gets `index.html`. The page auto-adds its own bridge as the machine (`lib/base.ts` `servedByBridge`, `HubContext` `detecting`), the router's basename is computed at runtime (`appBase`), and the server accepts same-origin WebSockets.
  - `ops.ts`: request/response operations. `files.ts` and `git.ts` confine paths to the home directory.
  - `usage.ts`: Claude plan usage (5-hour session and weekly) for the account Claude Code is signed into: token from the macOS keychain item `Claude Code-credentials` or `~/.claude/.credentials.json`, then Anthropic's OAuth usage endpoint. Read-only (never refreshes the token), cached 5 minutes, honors 429.
  - `server.ts`: `/health` (open), `/schema`, `/ws` (one multiplexed WebSocket per client). CORS and WS origins are limited to the app's webview origins.
  - Later: the Claude Code hooks receiver and the M2 MCP server, which need to sit where Claude Code runs anyway.
- **Translation to AG-UI happens in the bridge**, and the app applies the same reducer (`shared/src/agui.ts`), so snapshots and live events can't disagree.
- **The webview connects to bridges directly** (a decision change from "relay through Rust"). Rust can't be compiled on the dev machine, so a Rust WS relay would have shipped untested. We control the bridge's CORS, and the CSP limits `connect-src` to the tailnet and localhost. Tokens stay in the keychain via Rust. Revisit if the webview origin ever becomes a problem.
- **Auth** (`bridge/src/auth.ts`): a bridge token (Bearer, or `?token=` on the `/ws` upgrade only), else `tailscale serve`'s `Tailscale-User-Login` matching the owner, else a direct loopback request with no proxy headers **and a loopback `Host`** (DNS-rebinding guard; `DEVHUB_BRIDGE_LOOPBACK=0` disables the rule). Everything else is refused. After auth, any request whose `Origin` isn't an app origin or same-origin gets 403 (cross-site "simple" requests skip CORS preflight), and `POST /api/cli/open` requires JSON. `/raw` is served with a `sandbox` CSP (no `allow-same-origin`, `RAW_SANDBOX` in `shared/src/browser.ts`), and the web build's iframe repeats it, so an opened HTML file can't reach the bridge as the app.
- **Mount path:** routes answer with or without `DEVHUB_BRIDGE_BASE_PATH`, so `tailscale serve --set-path` works whether or not the prefix is stripped. The app stores each machine's full base URL.

### The herdr contract comes from the running herdr

herdr changes quickly, so types are generated from **the herdr actually running**, not from GitHub. `scripts/sync-herdr-schema.ts` runs `herdr api schema --json` (via `HERDR_BIN_PATH` or `herdr` on PATH); the bridge also serves the same thing at `GET /schema`. The script commits the raw schema to `shared/src/herdr/schema.json`, so the git diff is the changelog, and generates TS into `shared/src/herdr/generated/`.

- The schema has five sections (`request`, `success_response`, `error_response`, `event`, `subscription_event`). Each has its own `$defs`, and names repeat across sections **without always matching**. Each section becomes its own namespace (`Request.*`, `SuccessResponse.*`, …), and they are never merged.
- Import from `@devhub/shared/herdr`. Never edit `generated/`.
- After `pnpm api:sync`, run `pnpm build` (`tsc`) to see where devhub broke against the new protocol. At runtime, compare `ping`'s protocol number against `schema.json`'s `protocol` and surface drift.

### Reusing herdr-web-ui

[herdr-web-ui](https://github.com/devswha/herdr-web-ui) (MIT, Bun + React) already solves most of the bridge's problems. **Lifting its code into `bridge/` to speed up M1 is fine.** Keep its MIT copyright notice on lifted files and list them in a `THIRD_PARTY_NOTICES.md`. Adapt the code to devhub's own protocol and architecture. Don't depend on its package or call a running herdr-web-ui. Best sources:

- `server/herdr/client.ts`: the socket RPC client.
- `server/collector.ts`: a single status subscription with reconnect backoff and snapshot resync.
- `server/pty/` and `docs/terminal-flow-control.md`: one shared attach per pane, a bounded replay buffer, and ACK-based backpressure. Never load node-pty inside Bun; it panics, so use their Node sidecar pattern.
- `server/conversation.ts`: locating and parsing Claude Code transcripts.
- `server/prompt.ts`: parsing approvals and plan menus off the screen and answering them with key navigation, never digits.
- `server/access.ts` and `auth.ts`: Tailscale identity, token, and pairing.

Its `AGENTS.md` and `server/AGENTS.md` record many hard-won herdr quirks. Read them before writing bridge code.

### AG-UI

`@ag-ui/core` supplies the event and message types. M1 uses devhub's own small reducer (`shared/src/agui.ts`) rather than `@ag-ui/client`; wrapping a session as an `AbstractAgent` is the M2 step that lets orchestration treat herdr panes and native AG-UI agents (`HttpAgent`) the same way.

What M1 actually emits: `MESSAGES_SNAPSHOT`, `TEXT_MESSAGE_*` (user and assistant), `TOOL_CALL_START/ARGS/END`, `TOOL_CALL_RESULT`, and CUSTOM `devhub.prompt` (the parsed menu, or null) and `devhub.meta` (model, tokens, turns). Run lifecycle, reasoning, subagents and state deltas from the table below are still to come.

Mapping (Claude Code in a herdr pane):

| herdr / Claude Code | AG-UI |
|---|---|
| pane's Claude Code session | thread (`threadId`) |
| one turn: prompt sent → agent leaves `working` | run: `RUN_STARTED` … `RUN_FINISHED` |
| agent goes `blocked` (approval or plan prompt) | `RUN_FINISHED` with `outcome: { type: "interrupt" }`; the resume becomes keys sent to the pane |
| transcript assistant text / thinking | `TEXT_MESSAGE_*` / `REASONING_*` (or `MESSAGES_SNAPSHOT` on attach) |
| transcript `tool_use` / `tool_result` | `TOOL_CALL_START/ARGS/END` / `TOOL_CALL_RESULT` |
| Claude Code subagents (Task tool) | `SUBAGENT_*` |
| transcript token usage | `RUN_FINISHED.usage` |
| hub-wide workspaces / panes / agent statuses | `STATE_SNAPSHOT` + `STATE_DELTA` (JSON Patch) |

Runs here aren't always started by devhub: the user may type into the TUI directly. The translator has to infer run boundaries from herdr state and the transcript, rather than from `RunAgentInput`. Terminal bytes aren't AG-UI; they go on their own channel.

## Conventions (carried over from ../deadrop)

The user's sibling project `../deadrop` (especially `deadrop/desktop/`, the other Tauri hub) sets the house style. Follow it unless there's a reason not to:

- **Thin platform adapters around shared headless logic.** Keep orchestration and protocol state in framework-agnostic modules or hooks. React components and Rust commands are adapters, so don't duplicate workflow logic in either. Use explicit state machines (deadrop uses XState) for multi-step agent and session lifecycles.
- **Secrets live in Rust, not the webview** (OS keychain via `keyring`; local persistence would be Rust-side SQLite via `libsql`, as in deadrop). deadrop also routes network calls through Rust; devhub's bridge connections are the documented exception (see "Remote topology").
- **UI kit: Ant Design 6 + Ant Design X** (chosen over Mantine and MUI for devhub specifically, because Ant Design X ships the agent chat components and an A2UI card renderer). Use `antd` for the shell, `@ant-design/x` for chat (`Bubble.List`, `Sender`, `ThoughtChain`, `Think`, `Suggestion`, …), `@ant-design/x-markdown` for streaming Markdown, and `@ant-design/icons`. The app is wrapped in `XProvider` with `src/theme/antd-theme.ts`. That theme maps the raw tokens in `src/theme/tokens.ts` (the nieky.info × deadrop palette: grape-black grounds, Clash Display / General Sans from `public/fonts`, deadrop blue for actions, accent status dots) onto Ant Design's tokens. Add colors to `tokens.ts` and map them there, rather than hardcoding Ant overrides. `Splitter` uses `orientation`, not the deprecated `layout`.
- **Preferred stack for other additions:** `react-router-dom` for routing, Clerk (`@clerk/react` SPA SDK) for auth, `import.meta.env.VITE_*` env typed in `src/vite-env.d.ts` and read through a `src/env.ts` module.
- **Atomic design** for components (atoms → molecules → organisms).
- **Specs before features:** design docs go in `specs/<feature>.md`, as in deadrop.
- Prettier style used across the workspace: 70-char width, 2-space indent, single quotes, trailing commas, semicolons.
- Follow the agentic patterns and slash-command conventions from `../labkit`.
