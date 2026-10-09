// Keeps one live picture of the herdr session.
//
// herdr's documented model: subscribe first, then read a snapshot;
// events only invalidate cached state. So every event here just
// schedules a debounced resnapshot, and the snapshot is the truth.
// The subscription reopens itself (with backoff) whenever herdr closes
// it, and whenever the pane set changes, since per-pane status
// subscriptions need the full pane list up front.

import type { AgentStatus, HubSnapshot } from '@devhub/shared/hub';
import { hostname } from 'node:os';
import { branchOf } from '../git.ts';
import {
  herdr,
  subscribe,
  type SessionSnapshot,
  type Subscription,
} from '../herdr/client.ts';
import { buildHub, toAgentStatus } from './build.ts';

const GLOBAL_EVENTS = [
  'workspace.created',
  'workspace.updated',
  'workspace.renamed',
  'workspace.moved',
  'workspace.reordered',
  'workspace.closed',
  'tab.created',
  'tab.closed',
  'tab.renamed',
  'tab.moved',
  'pane.created',
  'pane.closed',
  'pane.updated',
  'pane.moved',
  'pane.exited',
];

const DEBOUNCE_MS = 120;
const BACKSTOP_MS = 15_000;
const RECONNECT_MIN_MS = 250;
const RECONNECT_MAX_MS = 5_000;

export interface StatusChange {
  paneId: string;
  from: AgentStatus;
  to: AgentStatus;
}

export interface Collector {
  current(): HubSnapshot | null;
  raw(): SessionSnapshot | null;
  onChange(listener: (hub: HubSnapshot) => void): () => void;
  onStatus(listener: (change: StatusChange) => void): () => void;
  /** Set or clear what an agent is asking (from the prompt watcher). */
  setAsk(paneId: string, ask: string | null): void;
  refresh(): void;
  stop(): void;
}

export function startCollector(): Collector {
  const statusSince = new Map<
    string,
    { status: AgentStatus; since: number }
  >();
  const branches = new Map<string, string | null>();
  const asks = new Map<string, string>();
  const changeListeners = new Set<(hub: HubSnapshot) => void>();
  const statusListeners = new Set<(c: StatusChange) => void>();

  let hub: HubSnapshot | null = null;
  let raw: SessionSnapshot | null = null;
  let sub: Subscription | null = null;
  let subscribedPanes = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let backoff = RECONNECT_MIN_MS;
  let stopped = false;
  let rebuilding = false;
  let again = false;

  const schedule = () => {
    if (timer || stopped) return;
    timer = setTimeout(() => {
      timer = null;
      void rebuild();
    }, DEBOUNCE_MS);
  };

  function openSubscription(paneIds: string[]) {
    sub?.close();
    subscribedPanes = paneIds.join(',');
    const s = subscribe(
      [
        ...GLOBAL_EVENTS.map((type) => ({ type })),
        ...paneIds.map((pane_id) => ({
          type: 'pane.agent_status_changed',
          pane_id,
        })),
      ],
      {
        onStarted: () => {
          backoff = RECONNECT_MIN_MS;
          schedule();
        },
        onEvent: () => schedule(),
        onClose: () => {
          if (stopped || sub !== s) return;
          sub = null;
          subscribedPanes = '';
          setTimeout(() => schedule(), backoff);
          backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
        },
      },
    );
    sub = s;
  }

  async function rebuild() {
    if (rebuilding) {
      again = true;
      return;
    }
    rebuilding = true;
    try {
      const snap = await herdr.snapshot();
      raw = snap;
      const now = Date.now();

      for (const p of snap.panes) {
        if (!p.agent) continue;
        const status = toAgentStatus(p.agent_status);
        const prev = statusSince.get(p.pane_id);
        if (!prev || prev.status !== status) {
          statusSince.set(p.pane_id, { status, since: now });
          if (prev) {
            for (const l of statusListeners)
              l({ paneId: p.pane_id, from: prev.status, to: status });
          }
        }
      }
      const live = new Set(snap.panes.map((p) => p.pane_id));
      for (const id of statusSince.keys())
        if (!live.has(id)) statusSince.delete(id);
      for (const id of asks.keys())
        if (!live.has(id)) asks.delete(id);

      const cwds = new Set<string>();
      for (const ws of snap.workspaces) {
        const cwd =
          ws.worktree?.checkout_path ??
          snap.panes.find((p) => p.workspace_id === ws.workspace_id)
            ?.cwd;
        if (cwd) cwds.add(cwd);
      }
      await Promise.all(
        [...cwds].map(async (cwd) =>
          branches.set(cwd, await branchOf(cwd)),
        ),
      );

      hub = buildHub(snap, {
        machineId: 'local',
        machineLabel: hostname().replace(/\.(local|lan|home)$/, ''),
        statusSince,
        branches,
        asks,
        now,
      });
      for (const l of changeListeners) l(hub);

      const paneIds = snap.panes
        .filter((p) => p.agent)
        .map((p) => p.pane_id)
        .sort();
      if (!sub || paneIds.join(',') !== subscribedPanes) {
        openSubscription(paneIds);
      }
    } catch {
      // herdr unreachable or restarting: retry with backoff
      setTimeout(() => schedule(), backoff);
      backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
    } finally {
      rebuilding = false;
      if (again) {
        again = false;
        schedule();
      }
    }
  }

  // Durations ("working · 6m") and missed events both want a periodic
  // rebuild even when herdr is quiet.
  const backstop = setInterval(schedule, BACKSTOP_MS);
  schedule();

  return {
    current: () => hub,
    raw: () => raw,
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    setAsk(paneId, ask) {
      const prev = asks.get(paneId);
      if (ask) asks.set(paneId, ask);
      else asks.delete(paneId);
      if ((prev ?? null) !== ask) schedule();
    },
    refresh: schedule,
    stop() {
      stopped = true;
      clearInterval(backstop);
      if (timer) clearTimeout(timer);
      sub?.close();
    },
  };
}
