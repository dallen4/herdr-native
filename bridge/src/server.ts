// HTTP + WebSocket server. One WebSocket per app connection carries hub
// state, session streams, terminals and request/response ops.

import type { BaseEvent } from '@devhub/shared/agui';
import type { HubSnapshot } from '@devhub/shared/hub';
import {
  BRIDGE_PROTOCOL,
  type BridgeInfo,
  type ClientFrame,
  type OpName,
  type ServerFrame,
} from '@devhub/shared/protocol';
import type { ServerWebSocket } from 'bun';
import { hostname } from 'node:os';
import pkg from '../package.json' with { type: 'json' };
import { authorize } from './auth.ts';
import { config, routePath } from './config.ts';
import { resolveTabs } from './browser/anchors.ts';
import type { BrowserStore } from './browser/store.ts';
import { herdr } from './herdr/client.ts';
import { serveWeb } from './web.ts';
import { stampMachine } from './hub/build.ts';
import type { Collector } from './hub/collector.ts';
import { anchorIn, createOps } from './ops.ts';
import { confine } from './files.ts';
import { RAW_SANDBOX, toUrl } from '@devhub/shared/browser';
import { FILE_URL_PREFIX } from '@devhub/shared/hub';
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve as resolvePath } from 'node:path';
import * as terminals from './pty/attachments.ts';
import type { PromptWatcher, Sessions } from './session.ts';

interface Conn {
  id: number;
  machineId: string;
  hub: boolean;
  sessions: Map<string, (events: BaseEvent[]) => void>;
  terminals: Set<string>;
}

type Socket = ServerWebSocket<Conn>;

// The app's webview origins: Tauri (macOS/Linux, Windows) and Vite dev.
const ALLOWED_ORIGINS = new Set([
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'http://localhost:1420',
  'http://127.0.0.1:1420',
]);

/** Served on /raw, see there. */
const RAW_CSP = `sandbox ${RAW_SANDBOX}`;

/** The web build served by this bridge talks back to its own origin. */
function sameOrigin(req: Request, origin: string): boolean {
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  return (
    host === req.headers.get('host') ||
    host === req.headers.get('x-forwarded-host')
  );
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
    vary: 'origin',
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors(req) },
  });
}

async function bridgeInfo(): Promise<BridgeInfo> {
  let h: BridgeInfo['herdr'] = null;
  try {
    const { version, protocol } = await herdr.ping();
    h = { version, protocol };
  } catch {
    // herdr not running
  }
  return {
    protocol: BRIDGE_PROTOCOL,
    version: pkg.version,
    herdr: h,
    hostname: hostname().replace(/\.(local|lan|home)$/, ''),
  };
}

export function startServer(
  collector: Collector,
  sessions: Sessions,
  prompts: PromptWatcher,
  browser: BrowserStore,
) {
  const ops = createOps(collector, prompts, browser);

  /** herdr's state plus devhub's browser tabs, anchors re-resolved
   * against the live workspaces (persisting any that moved). */
  const assemble = (): HubSnapshot | null => {
    const hub = collector.current();
    if (!hub) return null;
    const { shown, stored, changed } = resolveTabs(
      browser.list(),
      hub.workspaces,
    );
    if (changed) browser.replaceAll(stored);
    return { ...hub, browserTabs: shown };
  };
  const conns = new Set<Socket>();
  let nextId = 1;

  const send = (ws: Socket, frame: ServerFrame) =>
    ws.send(JSON.stringify(frame));

  const sendHub = (ws: Socket, hub: HubSnapshot) =>
    send(ws, {
      t: 'hub',
      snapshot: stampMachine(hub, ws.data.machineId),
    });

  const broadcast = () => {
    const hub = assemble();
    if (!hub) return;
    for (const ws of conns) if (ws.data.hub) sendHub(ws, hub);
  };
  collector.onChange(broadcast);
  browser.onChange(broadcast);

  async function handle(ws: Socket, frame: ClientFrame) {
    const conn = ws.data;
    switch (frame.t) {
      case 'hello':
        conn.machineId = frame.machineId;
        send(ws, { t: 'hello', bridge: await bridgeInfo() });
        return;
      case 'hub.subscribe': {
        conn.hub = true;
        const hub = assemble();
        if (hub) sendHub(ws, hub);
        return;
      }
      case 'session.subscribe': {
        if (conn.sessions.has(frame.paneId)) return;
        const listener = (events: BaseEvent[]) =>
          send(ws, { t: 'session', paneId: frame.paneId, events });
        conn.sessions.set(frame.paneId, listener);
        sessions.subscribe(frame.paneId, listener);
        return;
      }
      case 'session.unsubscribe': {
        const listener = conn.sessions.get(frame.paneId);
        if (!listener) return;
        conn.sessions.delete(frame.paneId);
        sessions.unsubscribe(frame.paneId, listener);
        return;
      }
      case 'term.attach': {
        const pane = collector
          .raw()
          ?.panes.find((p) => p.pane_id === frame.paneId);
        if (!pane) {
          send(ws, { t: 'term.exit', paneId: frame.paneId });
          return;
        }
        conn.terminals.add(frame.paneId);
        terminals.attach(
          frame.paneId,
          pane.terminal_id,
          {
            id: conn.id,
            interact: frame.mode === 'interact',
            send: (data) =>
              send(ws, {
                t: 'term.data',
                paneId: frame.paneId,
                data,
              }),
            exited: () => {
              conn.terminals.delete(frame.paneId);
              send(ws, { t: 'term.exit', paneId: frame.paneId });
            },
            buffered: () => ws.getBufferedAmount(),
          },
          frame.cols,
          frame.rows,
        );
        return;
      }
      case 'term.detach':
        conn.terminals.delete(frame.paneId);
        terminals.detach(frame.paneId, conn.id);
        return;
      case 'term.input':
        terminals.input(frame.paneId, conn.id, frame.data);
        return;
      case 'term.resize':
        terminals.resize(
          frame.paneId,
          conn.id,
          frame.cols,
          frame.rows,
        );
        return;
      case 'req': {
        const handler = ops[frame.op as OpName] as
          ((args: unknown) => Promise<unknown>) | undefined;
        if (!handler) {
          send(ws, {
            t: 'res',
            id: frame.id,
            ok: false,
            error: { code: 'unknown_op', message: frame.op },
          });
          return;
        }
        try {
          const result = await handler(frame.args);
          send(ws, { t: 'res', id: frame.id, ok: true, result });
        } catch (error) {
          const e = error as { code?: string; message?: string };
          send(ws, {
            t: 'res',
            id: frame.id,
            ok: false,
            error: {
              code: e.code ?? 'internal_error',
              message: e.message ?? String(error),
            },
          });
        }
        return;
      }
    }
  }

  const server = Bun.serve<Conn>({
    hostname: config.host,
    port: config.port,
    async fetch(req, srv) {
      const url = new URL(req.url);
      const path = routePath(url.pathname);
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: cors(req),
        });
      }
      if (path === '/health') {
        return json(req, { ok: true, bridge: await bridgeInfo() });
      }

      const auth = authorize(req, srv.requestIP(req)?.address);
      if (!auth.ok) {
        return path === '/ws'
          ? new Response('unauthorized', { status: 401 })
          : json(req, { error: { code: auth.reason } }, 401);
      }

      // Browsers stamp Origin on cross-site requests, including the
      // "simple" ones that skip CORS preflight. Only the app's own
      // origins (or no Origin: the CLI, curl) get any further.
      const origin = req.headers.get('origin');
      if (
        origin &&
        !ALLOWED_ORIGINS.has(origin) &&
        !sameOrigin(req, origin)
      ) {
        return new Response('forbidden origin', { status: 403 });
      }

      if (path === '/ws') {
        const ok = srv.upgrade(req, {
          data: {
            id: nextId++,
            machineId: 'local',
            hub: false,
            sessions: new Map(),
            terminals: new Set(),
          },
        });
        return ok
          ? undefined
          : new Response('upgrade failed', { status: 400 });
      }
      // Files on the server, for browser panes (an agent's HTML plan,
      // a report). Same auth as everything else, confined to $HOME.
      // Sandboxed without allow-same-origin: the page gets an opaque
      // origin, so its scripts can't reach the bridge as the app (its
      // WebSocket arrives with Origin "null" and is refused above).
      if (path === '/raw') {
        try {
          const file = await confine(
            url.searchParams.get('path') ?? '',
          );
          return new Response(Bun.file(file), {
            headers: {
              'cache-control': 'no-store',
              'content-security-policy': RAW_CSP,
              'x-content-type-options': 'nosniff',
            },
          });
        } catch (error) {
          return json(
            req,
            { error: { code: 'not_found', message: String(error) } },
            404,
          );
        }
      }

      // The devhub CLI (bridge/src/cli.ts), from inside herdr panes.
      if (path === '/api/cli/open' && req.method === 'POST') {
        // JSON only: a cross-site form or text/plain POST is refused
        // even if it somehow carries no Origin.
        if (
          !req.headers
            .get('content-type')
            ?.startsWith('application/json')
        ) {
          return json(req, { error: { code: 'bad_input' } }, 415);
        }
        const body = (await req.json().catch(() => ({}))) as {
          target?: string;
          cwd?: string;
          paneId?: string;
        };
        const target = body.target?.trim();
        if (!target)
          return json(req, { error: { code: 'bad_input' } }, 400);
        const asPath = isAbsolute(target)
          ? target
          : resolvePath(body.cwd ?? process.cwd(), target);
        const isFile =
          !/^https?:\/\//i.test(target) &&
          existsSync(asPath) &&
          statSync(asPath).isFile();
        const tab = browser.open(
          isFile ? `${FILE_URL_PREFIX}${asPath}` : toUrl(target),
          anchorIn(collector, undefined, body.paneId),
          'cli',
        );
        return json(req, { tab });
      }
      if (path === '/api/cli/ls') {
        return json(req, { hub: assemble() });
      }

      if (path === '/schema') {
        const proc = Bun.spawn(
          [config.herdrBin, 'api', 'schema', '--json'],
          { stdout: 'pipe', stderr: 'ignore' },
        );
        return new Response(await new Response(proc.stdout).text(), {
          headers: {
            'content-type': 'application/json',
            ...cors(req),
          },
        });
      }
      if (!path.startsWith('/api/')) {
        const web = serveWeb(req, url.pathname);
        if (web) return web;
      }
      return json(req, { error: { code: 'not_found' } }, 404);
    },
    websocket: {
      open(ws) {
        conns.add(ws);
      },
      message(ws, raw) {
        let frame: ClientFrame;
        try {
          frame = JSON.parse(String(raw));
        } catch {
          send(ws, { t: 'error', code: 'invalid_json', message: '' });
          return;
        }
        void handle(ws, frame).catch((error) =>
          send(ws, {
            t: 'error',
            code: 'internal_error',
            message: String(error),
          }),
        );
      },
      close(ws) {
        conns.delete(ws);
        for (const [paneId, listener] of ws.data.sessions) {
          sessions.unsubscribe(paneId, listener);
        }
        terminals.detachAll(ws.data.id);
      },
    },
  });

  return server;
}
