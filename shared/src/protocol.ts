// The app ⇄ devhub-bridge wire protocol: one WebSocket carrying JSON
// frames. Hub state and session transcripts travel as AG-UI events;
// terminal bytes and request/response ops have their own frames.

import type { BaseEvent } from '@ag-ui/core';
import type {
  BrowserTab,
  ClaudeUsage,
  FileContent,
  FileEntry,
  GitStatus,
  HubSnapshot,
  SlashCommand,
} from './hub.ts';

export const BRIDGE_PROTOCOL = 1;

export interface BridgeInfo {
  protocol: number;
  version: string;
  herdr: { version: string; protocol: number } | null;
  hostname: string;
}

/** Request/response operations: op name → [args, result]. */
export interface Ops {
  'pane.send': [{ paneId: string; text: string }, null];
  'pane.keys': [{ paneId: string; keys: string[] }, null];
  'pane.close': [{ paneId: string }, null];
  'pane.rename': [{ paneId: string; label: string | null }, null];
  'pane.split': [
    { paneId: string; direction: 'right' | 'down' },
    { paneId: string },
  ];
  'prompt.answer': [
    { paneId: string; hash: string; index: number },
    null,
  ];
  'workspace.create': [
    { cwd: string; label?: string; agent?: 'claude' },
    { workspaceId: string; paneId: string },
  ];
  'workspace.rename': [{ workspaceId: string; label: string }, null];
  'workspace.close': [{ workspaceId: string }, null];
  'workspace.move': [
    { workspaceId: string; insertIndex: number },
    null,
  ];
  'tab.create': [
    { workspaceId: string; label?: string; agent?: 'claude' },
    { tabId: string; paneId: string },
  ];
  'fs.list': [{ path: string }, FileEntry[]];
  'fs.read': [{ path: string }, FileContent];
  'fs.saveImage': [
    { paneId: string; name: string; dataUrl: string },
    { path: string },
  ];
  'git.status': [{ cwd: string }, GitStatus];
  'git.diff': [
    { cwd: string; path?: string; staged?: boolean },
    { diff: string },
  ];
  'commands.list': [{ paneId: string }, SlashCommand[]];
  'files.search': [{ paneId: string; query: string }, string[]];
  'browser.open': [
    { url: string; workspaceId?: string; paneId?: string },
    BrowserTab,
  ];
  'browser.update': [{ id: string; url: string }, null];
  'browser.anchor': [
    {
      id: string;
      workspaceId: string | null;
      paneId?: string | null;
    },
    null,
  ];
  'browser.close': [{ id: string }, null];
  /** Claude plan usage on the server's account; null when unknown. */
  'usage.get': [{ force?: boolean }, ClaudeUsage | null];
}

export type OpName = keyof Ops;
export type OpArgs<K extends OpName> = Ops[K][0];
export type OpResult<K extends OpName> = Ops[K][1];

export type TerminalMode = 'interact' | 'observe';

export type ClientFrame =
  | { t: 'hello'; machineId: string }
  | { t: 'hub.subscribe' }
  | { t: 'session.subscribe'; paneId: string }
  | { t: 'session.unsubscribe'; paneId: string }
  | {
      t: 'term.attach';
      paneId: string;
      cols: number;
      rows: number;
      mode: TerminalMode;
    }
  | { t: 'term.detach'; paneId: string }
  | { t: 'term.input'; paneId: string; data: string }
  | { t: 'term.resize'; paneId: string; cols: number; rows: number }
  | {
      [K in OpName]: { t: 'req'; id: number; op: K; args: OpArgs<K> };
    }[OpName];

export type ServerFrame =
  | { t: 'hello'; bridge: BridgeInfo }
  | { t: 'hub'; snapshot: HubSnapshot }
  | { t: 'session'; paneId: string; events: BaseEvent[] }
  | { t: 'term.data'; paneId: string; data: string }
  | { t: 'term.exit'; paneId: string }
  | { t: 'res'; id: number; ok: true; result: unknown }
  | {
      t: 'res';
      id: number;
      ok: false;
      error: { code: string; message: string };
    }
  | { t: 'error'; code: string; message: string };
