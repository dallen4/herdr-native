// One `herdr terminal attach` per pane, shared by every client watching
// it. The attach byte stream is the terminal's source of truth; a
// bounded replay buffer catches up late joiners. Attaches never pass
// --takeover, so they coexist with the user's own herdr TUI.

import { config } from '../config.ts';
import { herdrSocketPath } from '../herdr/client.ts';
import { PtySession } from './session.ts';

const REPLAY_BYTES = 256 * 1024;
const PAUSE_ABOVE = 1024 * 1024;
const RESUME_BELOW = 256 * 1024;

export interface TerminalClient {
  id: number;
  interact: boolean;
  send(data: string): void;
  exited(): void;
  /** Bytes queued on the client's socket, for backpressure. */
  buffered(): number;
}

interface Attachment {
  pty: PtySession;
  clients: Map<number, TerminalClient>;
  replay: string;
  cols: number;
  rows: number;
  drainTimer: ReturnType<typeof setInterval> | null;
}

const attachments = new Map<string, Attachment>();

// herdr marks panes it runs with HERDR_* variables; an attach spawned
// from a bridge that itself runs inside a pane must not inherit them.
function attachEnv() {
  const env: Record<string, string | undefined> = {};
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('HERDR_')) env[key] = undefined;
  }
  env.HERDR_SOCKET_PATH = herdrSocketPath();
  return env;
}

function checkPressure(att: Attachment) {
  const worst = Math.max(
    0,
    ...[...att.clients.values()].map((c) => c.buffered()),
  );
  if (worst > PAUSE_ABOVE) {
    att.pty.pause();
    att.drainTimer ??= setInterval(() => {
      const now = Math.max(
        0,
        ...[...att.clients.values()].map((c) => c.buffered()),
      );
      if (now < RESUME_BELOW) {
        att.pty.resume();
        if (att.drainTimer) clearInterval(att.drainTimer);
        att.drainTimer = null;
      }
    }, 50);
  }
}

export function attach(
  paneId: string,
  terminalId: string,
  client: TerminalClient,
  cols: number,
  rows: number,
) {
  let att = attachments.get(paneId);
  if (!att) {
    const created: Attachment = {
      clients: new Map(),
      replay: '',
      cols,
      rows,
      drainTimer: null,
      pty: new PtySession({
        command: config.herdrBin,
        args: ['terminal', 'attach', terminalId],
        cols,
        rows,
        env: attachEnv(),
        onData: (data) => {
          created.replay = (created.replay + data).slice(
            -REPLAY_BYTES,
          );
          for (const c of created.clients.values()) c.send(data);
          checkPressure(created);
        },
        onExit: () => {
          attachments.delete(paneId);
          if (created.drainTimer) clearInterval(created.drainTimer);
          for (const c of created.clients.values()) c.exited();
        },
      }),
    };
    att = created;
    attachments.set(paneId, att);
  } else if (att.replay) {
    client.send(att.replay);
  }
  att.clients.set(client.id, client);
  if (client.interact) resize(paneId, client.id, cols, rows);
}

export function detach(paneId: string, clientId: number) {
  const att = attachments.get(paneId);
  if (!att) return;
  att.clients.delete(clientId);
  if (att.clients.size === 0) {
    if (att.drainTimer) clearInterval(att.drainTimer);
    att.pty.kill();
    attachments.delete(paneId);
  }
}

export function detachAll(clientId: number) {
  for (const paneId of [...attachments.keys()])
    detach(paneId, clientId);
}

export function input(
  paneId: string,
  clientId: number,
  data: string,
) {
  const att = attachments.get(paneId);
  if (att?.clients.get(clientId)?.interact) att.pty.write(data);
}

export function resize(
  paneId: string,
  clientId: number,
  cols: number,
  rows: number,
) {
  const att = attachments.get(paneId);
  if (!att?.clients.get(clientId)?.interact) return;
  const c = Math.max(1, Math.min(1000, Math.floor(cols)));
  const r = Math.max(1, Math.min(1000, Math.floor(rows)));
  if (c === att.cols && r === att.rows) return;
  att.cols = c;
  att.rows = r;
  att.pty.resize(c, r);
}
