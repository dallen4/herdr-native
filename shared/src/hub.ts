// Hub state as devhub sees it: the bridge builds it from herdr's
// session snapshot, the app renders it. Everything is keyed by
// machine + pane so several herdr servers can coexist.

export type AgentStatus = 'working' | 'needsYou' | 'done' | 'idle';

export interface PaneRef {
  machineId: string;
  paneId: string;
}

interface PaneBase extends PaneRef {
  workspaceId: string;
  tabId: string;
  terminalId: string;
  title: string;
  cwd: string | null;
}

export interface AgentPane extends PaneBase {
  kind: 'agent';
  /** herdr's agent name, e.g. "claude". */
  agent: string;
  status: AgentStatus;
  /** Short human summary, e.g. "needs approval" or "working · 6m". */
  activity: string;
  /** The agent's own session id (Claude Code: the transcript id). */
  sessionId: string | null;
  /** What the agent is asking, when status is needsYou. */
  ask?: string;
  /** When the status last changed (ms since epoch). */
  updatedAt: number;
}

export interface ShellPane extends PaneBase {
  kind: 'shell';
  state: 'running' | 'idle' | 'failing';
  note?: string;
}

export type Pane = AgentPane | ShellPane;

export interface Tab {
  id: string;
  label: string;
}

export interface Workspace {
  machineId: string;
  id: string;
  name: string;
  cwd: string | null;
  branch: string | null;
  /** A linked git worktree (not the repo's main checkout). */
  worktree: boolean;
  /** Identifies the repository, so worktrees can nest under it. */
  repoKey: string | null;
  tabs: Tab[];
  panes: Pane[];
}

export interface Machine {
  id: string;
  label: string;
  herdrVersion: string;
  protocol: number;
  connected: boolean;
}

/** Where a browser tab lives. herdr ids can change when the herdr
 * server restarts, so the fingerprint (path, names) re-finds the right
 * workspace and pane when the ids stop matching. */
export interface BrowserAnchor {
  workspaceId: string;
  workspacePath: string | null;
  workspaceName: string;
  paneId: string | null;
  paneTitle: string | null;
}

/** A browser pane: devhub-owned (herdr has no browsers), anchored to a
 * herdr workspace or free-standing. `url` may be `devhub-file://<abs
 * path>` for a file on the server, which the app loads via the bridge. */
export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  anchor: BrowserAnchor | null;
  createdBy: 'app' | 'cli';
  createdAt: number;
}

export const FILE_URL_PREFIX = 'devhub-file://';

export interface HubSnapshot {
  machines: Machine[];
  workspaces: Workspace[];
  browserTabs: BrowserTab[];
}

export const paneKey = (ref: PaneRef) =>
  `${ref.machineId}/${ref.paneId}`;

/** An interactive menu the agent is showing (approval, question,
 * plan), parsed from the pane's screen. */
export interface PromptInfo {
  /** Hash of the visible menu; answers carry it so a stale menu is
   * never answered. */
  hash: string;
  kind: 'approval' | 'question' | 'plan' | 'confirm';
  title: string;
  body: string;
  options: { index: number; label: string }[];
  selected: number;
}

/** AG-UI CUSTOM event names devhub emits beside the standard ones. */
export const CUSTOM_EVENTS = {
  /** value: PromptInfo | null */
  prompt: 'devhub.prompt',
  /** value: SessionMeta */
  meta: 'devhub.meta',
} as const;

/** Running facts about a session, sent as a devhub.meta CUSTOM event. */
export interface SessionMeta {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  turns: number;
}

export interface FileEntry {
  name: string;
  path: string;
  kind: 'file' | 'dir';
  size: number;
}

export interface FileContent {
  path: string;
  kind: 'text' | 'image' | 'binary' | 'too_large';
  size: number;
  /** utf-8 text, or a data: URL for images */
  content: string;
}

export interface GitFileStatus {
  path: string;
  /** porcelain XY code, e.g. " M", "??", "A " */
  code: string;
}

export interface GitStatus {
  root: string;
  branch: string | null;
  files: GitFileStatus[];
}

/** One Claude plan limit window (from the account's usage). */
export interface UsageWindow {
  usedPercent: number;
  resetsAt: string | null;
}

export interface ClaudeUsage {
  plan: string | null;
  /** The rolling 5-hour session limit. */
  session: UsageWindow | null;
  week: UsageWindow | null;
  fetchedAt: string;
}

export interface SlashCommand {
  name: string;
  description: string;
  source: 'builtin' | 'user' | 'project' | 'plugin';
}
