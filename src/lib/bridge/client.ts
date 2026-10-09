// The app's connection to one devhub-bridge: a single WebSocket that
// carries hub state, session streams, terminals and ops. Reconnects
// with backoff and re-establishes every subscription afterwards.

import type { BaseEvent } from '@devhub/shared/agui';
import type { HubSnapshot } from '@devhub/shared/hub';
import type {
  BridgeInfo,
  ClientFrame,
  OpArgs,
  OpName,
  OpResult,
  ServerFrame,
  TerminalMode,
} from '@devhub/shared/protocol';
import type {
  ConnectionStatus,
  HubConnection,
  TerminalHandle,
  TerminalHandlers,
} from '../hub/connection.ts';

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 8_000;
const REQUEST_TIMEOUT_MS = 30_000;

export class BridgeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// One bridge attach per pane, fanned out to every local view of it
// (e.g. the main view and the dock), with a replay buffer so a view
// opened later starts with the current screen.
interface TerminalSub {
  cols: number;
  rows: number;
  mode: TerminalMode;
  viewers: Set<TerminalHandlers>;
  replay: string;
}

const REPLAY_CHARS = 256 * 1024;

export function wsUrl(base: string, token: string | null): string {
  const url = new URL(base.replace(/\/+$/, '') + '/ws');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

export class BridgeClient implements HubConnection {
  private ws: WebSocket | null = null;
  private hub: HubSnapshot = {
    machines: [],
    workspaces: [],
    browserTabs: [],
  };
  private hubListeners = new Set<(s: HubSnapshot) => void>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private sessions = new Map<string, Set<(e: BaseEvent[]) => void>>();
  private terminals = new Map<string, TerminalSub>();
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private nextId = 1;
  private backoff = RECONNECT_MIN_MS;
  private closed = false;
  private currentStatus: ConnectionStatus = 'connecting';
  info: BridgeInfo | null = null;

  constructor(
    readonly machineId: string,
    private readonly url: string,
    private readonly token: string | null,
  ) {
    this.connect();
  }

  // ---- connection ----------------------------------------------------

  private setStatus(status: ConnectionStatus) {
    this.currentStatus = status;
    for (const l of this.statusListeners) l(status);
  }

  private connect() {
    if (this.closed) return;
    this.setStatus('connecting');
    const ws = new WebSocket(wsUrl(this.url, this.token));
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = RECONNECT_MIN_MS;
      this.send({ t: 'hello', machineId: this.machineId });
      this.send({ t: 'hub.subscribe' });
      for (const paneId of this.sessions.keys()) {
        this.send({ t: 'session.subscribe', paneId });
      }
      for (const [paneId, sub] of this.terminals) {
        this.send({
          t: 'term.attach',
          paneId,
          cols: sub.cols,
          rows: sub.rows,
          mode: sub.mode,
        });
      }
    };
    ws.onmessage = (m) => this.receive(JSON.parse(String(m.data)));
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      for (const [, p] of this.pending) {
        p.reject(new BridgeError('disconnected', 'Connection lost.'));
      }
      this.pending.clear();
      if (this.closed) return;
      this.setStatus('offline');
      setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
    };
  }

  private send(frame: ClientFrame) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  private receive(frame: ServerFrame) {
    switch (frame.t) {
      case 'hello':
        this.info = frame.bridge;
        this.setStatus('online');
        return;
      case 'hub':
        this.hub = frame.snapshot;
        for (const l of this.hubListeners) l(this.hub);
        return;
      case 'session':
        for (const l of this.sessions.get(frame.paneId) ?? []) {
          l(frame.events);
        }
        return;
      case 'term.data': {
        const sub = this.terminals.get(frame.paneId);
        if (!sub) return;
        sub.replay = (sub.replay + frame.data).slice(-REPLAY_CHARS);
        for (const v of sub.viewers) v.onData(frame.data);
        return;
      }
      case 'term.exit': {
        const sub = this.terminals.get(frame.paneId);
        this.terminals.delete(frame.paneId);
        for (const v of sub?.viewers ?? []) v.onExit();
        return;
      }
      case 'res': {
        const p = this.pending.get(frame.id);
        if (!p) return;
        this.pending.delete(frame.id);
        if (frame.ok) p.resolve(frame.result);
        else
          p.reject(
            new BridgeError(frame.error.code, frame.error.message),
          );
        return;
      }
      case 'error':
        console.warn('bridge error', frame.code, frame.message);
        return;
    }
  }

  close() {
    this.closed = true;
    this.ws?.close();
  }

  // ---- HubConnection -------------------------------------------------

  snapshot() {
    return this.hub;
  }

  subscribe(listener: (s: HubSnapshot) => void) {
    this.hubListeners.add(listener);
    listener(this.hub);
    return () => {
      this.hubListeners.delete(listener);
    };
  }

  status() {
    return this.currentStatus;
  }

  onStatus(listener: (s: ConnectionStatus) => void) {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  subscribeSession(
    paneId: string,
    listener: (e: BaseEvent[]) => void,
  ) {
    let set = this.sessions.get(paneId);
    if (!set) {
      set = new Set();
      this.sessions.set(paneId, set);
      this.send({ t: 'session.subscribe', paneId });
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.sessions.delete(paneId);
        this.send({ t: 'session.unsubscribe', paneId });
      }
    };
  }

  attachTerminal(
    paneId: string,
    opts: { cols: number; rows: number; mode: TerminalMode },
    handlers: TerminalHandlers,
  ): TerminalHandle {
    let sub = this.terminals.get(paneId);
    if (!sub) {
      sub = { ...opts, viewers: new Set(), replay: '' };
      this.terminals.set(paneId, sub);
      this.send({ t: 'term.attach', paneId, ...opts });
    } else if (sub.replay) {
      handlers.onData(sub.replay);
    }
    sub.viewers.add(handlers);
    return {
      input: (data) => this.send({ t: 'term.input', paneId, data }),
      resize: (cols, rows) => {
        const current = this.terminals.get(paneId);
        if (current) Object.assign(current, { cols, rows });
        this.send({ t: 'term.resize', paneId, cols, rows });
      },
      detach: () => {
        const current = this.terminals.get(paneId);
        if (!current?.viewers.delete(handlers)) return;
        if (current.viewers.size === 0) {
          this.terminals.delete(paneId);
          this.send({ t: 'term.detach', paneId });
        }
      },
    };
  }

  request<K extends OpName>(
    op: K,
    args: OpArgs<K>,
  ): Promise<OpResult<K>> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return Promise.reject(
        new BridgeError('offline', 'Not connected to the bridge.'),
      );
    }
    const id = this.nextId++;
    return new Promise<OpResult<K>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BridgeError('timeout', `${op} timed out`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as OpResult<K>);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.send({ t: 'req', id, op, args } as ClientFrame);
    });
  }
}
