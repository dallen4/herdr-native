// herdr session snapshot → devhub HubSnapshot. Pure, so it's tested
// without a herdr.

import type {
  AgentStatus,
  HubSnapshot,
  Pane,
  Workspace,
} from '@devhub/shared/hub';
import type { SessionSnapshot } from '../herdr/client.ts';

export interface BuildContext {
  machineId: string;
  machineLabel: string;
  /** pane id → status and when it last changed */
  statusSince: Map<string, { status: AgentStatus; since: number }>;
  /** workspace cwd → current git branch */
  branches: Map<string, string | null>;
  /** pane id → what the agent is asking */
  asks: Map<string, string>;
  now: number;
}

export function toAgentStatus(
  herdrStatus: string | undefined,
): AgentStatus {
  switch (herdrStatus) {
    case 'working':
      return 'working';
    case 'blocked':
      return 'needsYou';
    case 'done':
      return 'done';
    default:
      return 'idle';
  }
}

export function duration(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function activity(status: AgentStatus, elapsed: number): string {
  switch (status) {
    case 'working':
      return `working · ${duration(elapsed)}`;
    case 'needsYou':
      return 'needs input';
    case 'done':
      return `finished · ${duration(elapsed)}`;
    default:
      return 'idle';
  }
}

/** A shell's terminal title, minus the usual "user@host:" prompt
 * prefix: "user@host:~/Projects/webapp" reads as "webapp". */
export function shellTitle(title: string | null | undefined): string {
  if (!title) return 'shell';
  const prompt = title.match(/^[^@\s]+@[^:\s]+:\s*(.*)$/);
  if (!prompt) return title;
  const path = prompt[1]!.replace(/\/+$/, '');
  if (!path || path === '~') return '~';
  return path.slice(path.lastIndexOf('/') + 1) || path;
}

export function buildHub(
  snap: SessionSnapshot,
  ctx: BuildContext,
): HubSnapshot {
  const tabsByWorkspace = new Map<
    string,
    { id: string; label: string }[]
  >();
  for (const tab of [...snap.tabs].sort(
    (a, b) => a.number - b.number,
  )) {
    const list = tabsByWorkspace.get(tab.workspace_id) ?? [];
    list.push({ id: tab.tab_id, label: tab.label });
    tabsByWorkspace.set(tab.workspace_id, list);
  }

  // A tab the user named ("logs", "server") names its lone shell
  // better than the shell's prompt does; herdr's defaults are numbers.
  const tabLabel = new Map<string, string>();
  const panesInTab = new Map<string, number>();
  for (const p of snap.panes) {
    panesInTab.set(p.tab_id, (panesInTab.get(p.tab_id) ?? 0) + 1);
  }
  for (const t of snap.tabs) {
    if (!/^\d+$/.test(t.label) && panesInTab.get(t.tab_id) === 1) {
      tabLabel.set(t.tab_id, t.label);
    }
  }

  const panesByWorkspace = new Map<string, Pane[]>();
  for (const p of snap.panes) {
    const title = p.agent
      ? p.label || p.terminal_title_stripped || p.title || p.agent
      : p.label ||
        tabLabel.get(p.tab_id) ||
        shellTitle(p.terminal_title_stripped || p.title);
    const base = {
      machineId: ctx.machineId,
      paneId: p.pane_id,
      workspaceId: p.workspace_id,
      tabId: p.tab_id,
      terminalId: p.terminal_id,
      title,
      cwd: p.foreground_cwd ?? p.cwd ?? null,
    };
    let pane: Pane;
    if (p.agent) {
      const status = toAgentStatus(p.agent_status);
      const since = ctx.statusSince.get(p.pane_id)?.since ?? ctx.now;
      const ask = ctx.asks.get(p.pane_id);
      pane = {
        ...base,
        kind: 'agent',
        agent: p.agent,
        status,
        activity: activity(status, ctx.now - since),
        sessionId: p.agent_session?.value ?? null,
        ...(status === 'needsYou' && ask ? { ask } : {}),
        updatedAt: since,
      };
    } else {
      pane = { ...base, kind: 'shell', state: 'idle' };
    }
    const list = panesByWorkspace.get(p.workspace_id) ?? [];
    list.push(pane);
    panesByWorkspace.set(p.workspace_id, list);
  }

  const workspaces: Workspace[] = [...snap.workspaces]
    .sort((a, b) => a.number - b.number)
    .map((ws) => {
      const panes = panesByWorkspace.get(ws.workspace_id) ?? [];
      const cwd = ws.worktree?.checkout_path ?? panes[0]?.cwd ?? null;
      return {
        machineId: ctx.machineId,
        id: ws.workspace_id,
        name: ws.label,
        cwd,
        branch: cwd ? (ctx.branches.get(cwd) ?? null) : null,
        worktree: ws.worktree?.is_linked_worktree ?? false,
        repoKey: ws.worktree?.repo_key ?? null,
        tabs: tabsByWorkspace.get(ws.workspace_id) ?? [],
        panes,
      };
    });

  return {
    machines: [
      {
        id: ctx.machineId,
        label: ctx.machineLabel,
        herdrVersion: snap.version,
        protocol: snap.protocol,
        connected: true,
      },
    ],
    workspaces,
    // browser tabs are devhub's, merged in by the server
    browserTabs: [],
  };
}

/** Rewrites every machine id, so one built snapshot can be stamped
 * per client connection. */
export function stampMachine(
  hub: HubSnapshot,
  machineId: string,
): HubSnapshot {
  return {
    machines: hub.machines.map((m) => ({ ...m, id: machineId })),
    workspaces: hub.workspaces.map((ws) => ({
      ...ws,
      machineId,
      panes: ws.panes.map((p) => ({ ...p, machineId })),
    })),
    browserTabs: hub.browserTabs,
  };
}
