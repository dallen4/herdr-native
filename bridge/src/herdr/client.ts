// herdr socket client.
//
// Adapted from herdr-web-ui (https://github.com/devswha/herdr-web-ui),
// server/herdr/client.ts. Copyright (c) 2026 devswha. MIT License; see
// THIRD_PARTY_NOTICES.md.
//
// herdr speaks newline-delimited JSON over a Unix socket and closes the
// connection after each response: one request, one connection, never
// pooled. Only events.subscribe stays open.

import type { SuccessResponse } from '@devhub/shared/herdr';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_TIMEOUT_MS = 10_000;

export type SessionSnapshot = SuccessResponse.SessionSnapshot;
export type PaneInfo = SuccessResponse.PaneInfo;

export function herdrSocketPath(): string {
  return (
    process.env.HERDR_SOCKET_PATH ||
    join(homedir(), '.config/herdr/herdr.sock')
  );
}

export class HerdrError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'HerdrError';
    this.code = code;
  }
}

let counter = 0;
const nextId = () => `dh-${Date.now().toString(36)}-${++counter}`;

/** Splits a byte stream into complete newline-terminated frames. */
function lineReader(onLine: (line: string) => void) {
  const decoder = new TextDecoder();
  let buffer = '';
  return (chunk: Uint8Array) => {
    buffer += decoder.decode(chunk, { stream: true });
    let i = buffer.indexOf('\n');
    while (i !== -1) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (line) onLine(line);
      i = buffer.indexOf('\n');
    }
  };
}

export async function rpc<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  socketPath = herdrSocketPath(),
): Promise<T> {
  const id = nextId();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let socket: { end: () => void } | null = null;
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(
            new HerdrError(
              'timeout',
              `herdr ${method} timed out after ${timeoutMs}ms`,
            ),
          ),
        ),
      timeoutMs,
    );

    function finish(fn: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.end();
      } catch {
        // already closed by herdr
      }
      fn();
    }

    const onData = lineReader((line) => {
      let frame: {
        result?: unknown;
        error?: { code?: string; message?: string };
      };
      try {
        frame = JSON.parse(line);
      } catch {
        finish(() =>
          reject(new HerdrError('bad_frame', line.slice(0, 200))),
        );
        return;
      }
      if (frame.error) {
        const { code = 'herdr_error', message = 'herdr error' } =
          frame.error;
        finish(() => reject(new HerdrError(code, message)));
      } else {
        finish(() => resolve(frame.result as T));
      }
    });

    Bun.connect({
      unix: socketPath,
      socket: {
        data: (_s, chunk) => onData(chunk),
        error: (_s, err) =>
          finish(() =>
            reject(new HerdrError('socket_error', err.message)),
          ),
        close: () =>
          finish(() =>
            reject(
              new HerdrError(
                'closed',
                `herdr closed before answering ${method}`,
              ),
            ),
          ),
      },
    })
      .then((s) => {
        socket = s;
        if (settled) s.end();
        else s.write(`${JSON.stringify({ id, method, params })}\n`);
      })
      .catch((err: Error) =>
        finish(() =>
          reject(
            new HerdrError(
              'connect_failed',
              `cannot reach herdr at ${socketPath}: ${err.message}`,
            ),
          ),
        ),
      );
  });
}

export interface EventFrame {
  event?: string;
  data?: Record<string, unknown>;
}

export interface Subscription {
  close(): void;
}

/** A long-lived events.subscribe connection. A second subscribe on an
 * open connection is ignored by herdr, so callers reopen with the
 * full set when it changes. */
export function subscribe(
  subscriptions: { type: string; pane_id?: string }[],
  handlers: {
    onEvent: (frame: EventFrame) => void;
    onStarted?: () => void;
    onClose: () => void;
  },
  socketPath = herdrSocketPath(),
): Subscription {
  let closed = false;
  let started = false;
  let socket: { end: () => void } | null = null;

  const close = () => {
    if (closed) return;
    closed = true;
    try {
      socket?.end();
    } catch {
      // already gone
    }
    handlers.onClose();
  };

  const onData = lineReader((line) => {
    if (closed) return;
    let frame: EventFrame & {
      result?: { type?: string };
      error?: unknown;
    };
    try {
      frame = JSON.parse(line);
    } catch {
      return;
    }
    if (frame.error) return close();
    if (!started && frame.result?.type === 'subscription_started') {
      started = true;
      handlers.onStarted?.();
      return;
    }
    handlers.onEvent(frame);
  });

  Bun.connect({
    unix: socketPath,
    socket: {
      data: (_s, chunk) => onData(chunk),
      error: () => close(),
      close: () => close(),
    },
  })
    .then((s) => {
      socket = s;
      if (closed) return s.end();
      s.write(
        `${JSON.stringify({
          id: nextId(),
          method: 'events.subscribe',
          params: { subscriptions },
        })}\n`,
      );
    })
    .catch(() => close());

  return {
    close() {
      if (closed) return;
      closed = true;
      try {
        socket?.end();
      } catch {
        // already gone
      }
    },
  };
}

// ---- typed helpers -------------------------------------------------

export const herdr = {
  ping: () => rpc<{ version: string; protocol: number }>('ping'),
  snapshot: async () =>
    (await rpc<{ snapshot: SessionSnapshot }>('session.snapshot'))
      .snapshot,
  sendText: (paneId: string, text: string) =>
    rpc('pane.send_text', { pane_id: paneId, text }),
  sendKeys: (paneId: string, keys: string[]) =>
    rpc('pane.send_keys', { pane_id: paneId, keys }),
  readVisible: async (paneId: string) =>
    (
      await rpc<{ read: { text: string } }>('pane.read', {
        pane_id: paneId,
        source: 'visible',
        format: 'text',
        strip_ansi: true,
      })
    ).read.text,
  paneClose: (paneId: string) =>
    rpc('pane.close', { pane_id: paneId }),
  paneRename: (paneId: string, label: string | null) =>
    rpc('pane.rename', { pane_id: paneId, label }),
  paneSplit: (paneId: string, direction: 'right' | 'down') =>
    rpc<{ pane?: PaneInfo; root_pane?: PaneInfo }>('pane.split', {
      target_pane_id: paneId,
      direction,
      focus: false,
    }),
  workspaceCreate: (cwd: string, label?: string) =>
    rpc<{ workspace: { workspace_id: string }; root_pane: PaneInfo }>(
      'workspace.create',
      { cwd, ...(label ? { label } : {}), focus: false },
    ),
  workspaceRename: (workspaceId: string, label: string) =>
    rpc('workspace.rename', { workspace_id: workspaceId, label }),
  workspaceClose: (workspaceId: string) =>
    rpc('workspace.close', { workspace_id: workspaceId }),
  workspaceMove: (workspaceId: string, insertIndex: number) =>
    rpc('workspace.move', {
      workspace_id: workspaceId,
      insert_index: insertIndex,
    }),
  tabCreate: (workspaceId: string, label?: string) =>
    rpc<{ tab: { tab_id: string }; root_pane: PaneInfo }>(
      'tab.create',
      {
        workspace_id: workspaceId,
        ...(label ? { label } : {}),
        focus: false,
      },
    ),
  agentStart: (paneId: string, kind: string) =>
    rpc(
      'agent.start',
      { name: kind, kind, pane_id: paneId, timeout_ms: 20_000 },
      25_000,
    ),
};
