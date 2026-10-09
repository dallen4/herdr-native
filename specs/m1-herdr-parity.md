# M1 — Native herdr console (herdr-web-ui parity)

**Goal:** a native Tauri console that covers most of what
[herdr-web-ui](https://github.com/devswha/herdr-web-ui) does for
**workspaces, chat, and terminals**, for Claude Code sessions on a
**remote herdr server on the tailnet**. herdr-web-ui is the feature
reference, and its MIT code may be lifted into the bridge to move
faster (keep its notices). devhub keeps its own protocol and
architecture: app ⇄ devhub-bridge ⇄ herdr (see CLAUDE.md, "Remote
topology").

**Machines:** M1 targets one server. Still, key every pane, workspace,
and storage id by machine (`machineId` + `paneId`) from the start, so
adding servers later doesn't mean a rewrite.

Generative UI (Claude building in-app experiences) is **M2**. M1 has to
leave a clean on-ramp for it: chat renders from AG-UI events from day
one, never from raw transcript shapes.

## In scope

### Workspaces

- A live tree of workspaces → tabs → panes, with agent status (working,
  needs input, done, idle) and worktree provenance.
- Create a workspace (pick a folder, optionally start Claude Code in the
  root pane), add a tab, rename, reorder, and close.
- A command palette (⌘K) that jumps to any workspace, pane, or action.

### Terminal

- xterm.js on any live pane, through `herdr terminal attach` in a
  Rust-side PTY. Full TUIs, raw keys, resize, and herdr's scrollback.
  It coexists with the user's own herdr TUI, so never pass `--takeover`
  unprompted.
- Interact vs observe modes, and one shared attach per pane across
  views.
- Copy on select; Ctrl+C copies when there is a selection.
- "New terminal" creates a **herdr pane**, so every terminal is owned
  and persisted by herdr. devhub never runs its own shells.

### Chat (Claude Code)

- Read the session from Claude Code's own transcript: herdr's agent
  session id → `~/.claude/projects/<cwd-slug>/<session>.jsonl`.
  Translate it to AG-UI messages and events, and render Markdown, code,
  and tables.
- Fold each turn's tool calls into one "worked for …" block. Show
  todo-tool calls as the session plan.
- Compose: send by typing into the live pane (`pane.send_text` + Enter),
  keep a draft per pane, queue messages while the agent works (sent
  only when the user says so), support `/` commands (built-ins plus
  `.claude/commands`) and `@` file mentions, and attach images by
  saving them and referencing the path.
- Chat / Terminal / Split views of the same pane.

### Prompts and attention

- Approval, question, and plan menus become cards. Check that the menu
  is still current before answering.
- Live status for every pane. Native macOS notifications when an agent
  needs input, finishes, or its terminal ends.
- A cross-workspace "needs you" list.

### Files

- File paths in chat open in a viewer (text/code, images, PDF).
- Browse a pane's folder.

## Out of scope for M1

Phone/PWA, multiple servers in the UI (the data model is ready for
them), SSH-provisioned machines, voice input,
subscription-usage meters, i18n, agents other than Claude Code,
generative UI (M2), and self-update.

## Open decisions

- **How prompts are detected.** herdr-web-ui parses the visible screen.
  The alternative is Claude Code hooks (`PreToolUse` can hold a
  permission decision; `Notification` signals waiting), which are
  structured and give clean run boundaries for AG-UI. Leaning toward
  hooks first with screen parsing as the fallback; settle this in
  slice 5.
- **Transcript reading.** Tail the JSONL in the bridge with
  inode/size/mtime caching (herdr-web-ui's approach) vs a file watcher.
- **How the app reaches the bridge.** Rust-side WS client relaying
  over Tauri channels (house rule) vs letting the webview connect
  directly, since we control the bridge's CORS. Start with Rust.
- **UI kit.** Mantine v8 (house default, as in deadrop) themed to the
  nieky.info × deadrop look from the mockup, vs custom components.

## Status (2026-10-04)

All slices are implemented. Verified with unit tests, against an
isolated herdr session (`devhub-test`), read-only against the real
session's transcripts, and in a browser. Not yet verified: the Rust side
(never compiled on the dev Mac, which has no Xcode CLT), answering a
real Claude Code prompt end to end, and a bridge behind
`tailscale serve`.

| Slice                          | State                 | Notes                                                                                 |
| ------------------------------ | --------------------- | ------------------------------------------------------------------------------------- |
| 0. Repo shape, bridge skeleton | done                  | App at the root (not `app/`); `bridge/` + `shared/` workspaces. Health, schema, auth. |
| 1. Live hub state              | done                  | Webview connects to the bridge directly (decision changed; see CLAUDE.md).            |
| 2. Terminal                    | done                  | Pause/resume backpressure instead of herdr-web-ui's ACK protocol.                     |
| 3. Chat, read-only             | done                  | No thinking blocks or subagent transcripts yet.                                       |
| 4. Compose                     | done                  | `/` + `@` suggestions, per-pane drafts, send-later queue, image paste.                |
| 5. Prompts + notifications     | done (screen parsing) | Hooks-based detection still open.                                                     |
| 6. Management + polish         | done                  | Create/rename/close/reorder, tabs, palette, file viewer.                              |
| 7. Git diff review             | done (basic)          | Status + unified diff per file or all, auto-refresh. See below.                       |

### Follow-ups

- Claude Code hooks for approvals and run boundaries (AG-UI `RUN_*`).
- Thinking blocks (`REASONING_*`) behind a toggle; subagent transcripts.
- Wrap sessions as `@ag-ui/client` `AbstractAgent`s (the M2 on-ramp).
- Diff review v2: side-by-side, per-turn diffs ("what did this turn
  change"), staged vs unstaged, jump from a tool step's Edit to its hunk.
- Multiple machines in one sidebar; install the bridge as a herdr
  plugin.

## Build order (vertical slices)

0. **Repo shape and bridge skeleton.** Split into pnpm workspaces
   `app/`, `bridge/`, and `shared/`. A Bun bridge with health and
   schema endpoints and auth (Tailscale identity + token), served with
   `tailscale serve`. The app has a "connect to machine" screen, with
   the token stored in the keychain.
1. **Live hub state.** Bridge: herdr RPC client plus a collector with
   snapshot resync (lifted from herdr-web-ui), exposed as an AG-UI hub
   state stream. App: Rust holds the connection and relays it over a
   Tauri channel; the workspace sidebar renders live from AG-UI state.
2. **Terminal.** Bridge: a shared `herdr terminal attach` per pane in a
   Node PTY sidecar, with replay and ACK flow control over WS. App:
   xterm.js, resize, interact/observe. "New terminal" creates a herdr
   pane.
3. **Chat, read-only.** Bridge: locate and tail the transcript and
   translate it to AG-UI. App: an `AbstractAgent` per session; render
   messages and the "worked for" blocks.
4. **Compose.** Send, drafts, queue, `/` and `@`, image attach.
5. **Prompts and notifications.** Settle the hooks-vs-screen decision,
   build approval and question cards, add native notifications and
   the "needs you" list.
6. **Management and polish.** Workspace create/rename/reorder/close,
   tabs, command palette, file viewer.

Layout reference: https://claude.ai/artifact/8Dz8BtmvCZJy7ygiHszXhj
