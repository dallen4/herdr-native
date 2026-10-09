#!/usr/bin/env bun
// devhub: drive the devhub console from inside a herdr pane.
//
//   devhub open <url|file>   open a browser pane next to this pane
//   devhub ls                list workspaces, panes and browser tabs
//
// Talks to the local devhub-bridge (DEVHUB_BRIDGE_URL, default
// http://127.0.0.1:7417) and knows which pane it runs in from herdr's
// HERDR_PANE_ID.

import type { HubSnapshot } from '@devhub/shared/hub';

const base = (
  process.env.DEVHUB_BRIDGE_URL ??
  `http://127.0.0.1:${process.env.DEVHUB_BRIDGE_PORT ?? 7417}`
).replace(/\/+$/, '');
const token = process.env.DEVHUB_BRIDGE_TOKEN;

const HELP = `devhub — drive the devhub console from a herdr pane

Usage:
  devhub open <url|file>   Open a browser pane next to this pane.
                           Files on this machine (an HTML plan, a report)
                           are served by the bridge.
  devhub ls                List workspaces, panes and browser tabs.
  devhub help              Show this help.

Environment:
  DEVHUB_BRIDGE_URL        Bridge address (default http://127.0.0.1:7417)
  DEVHUB_BRIDGE_TOKEN      Bridge token, if the bridge requires one
`;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(
      `can't reach devhub-bridge at ${base} (is it running? pnpm bridge:start)`,
    );
  }
  const body = (await res.json().catch(() => ({}))) as T & {
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    throw new Error(
      body.error?.message ?? body.error?.code ?? res.statusText,
    );
  }
  return body;
}

async function open(target: string | undefined) {
  if (!target) throw new Error('usage: devhub open <url|file>');
  const paneId = process.env.HERDR_PANE_ID;
  const { tab } = await call<{
    tab: {
      id: string;
      title: string;
      anchor: { workspaceName: string } | null;
    };
  }>('/api/cli/open', {
    method: 'POST',
    body: JSON.stringify({ target, cwd: process.cwd(), paneId }),
  });
  console.log(
    `opened ${tab.title}${tab.anchor ? ` in ${tab.anchor.workspaceName}` : ''} (${tab.id})`,
  );
}

async function ls() {
  const { hub } = await call<{ hub: HubSnapshot | null }>(
    '/api/cli/ls',
  );
  if (!hub) {
    console.log('herdr not reachable yet');
    return;
  }
  for (const ws of hub.workspaces) {
    console.log(
      `${ws.name}${ws.branch ? `  (${ws.branch})` : ''}  ${ws.id}`,
    );
    for (const p of ws.panes) {
      const what =
        p.kind === 'agent' ? `${p.agent} · ${p.activity}` : 'shell';
      console.log(`  ${p.paneId.padEnd(8)} ${p.title}  — ${what}`);
    }
    for (const t of hub.browserTabs.filter(
      (t) => t.anchor?.workspaceId === ws.id,
    )) {
      console.log(`  ${t.id.padEnd(8)} 🌐 ${t.title}`);
    }
  }
  const loose = hub.browserTabs.filter((t) => !t.anchor);
  if (loose.length) {
    console.log('browser');
    for (const t of loose)
      console.log(`  ${t.id.padEnd(8)} 🌐 ${t.title}`);
  }
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'open') await open(args[0]);
  else if (command === 'ls') await ls();
  else console.log(HELP);
} catch (error) {
  console.error(`devhub: ${(error as Error).message}`);
  process.exit(1);
}
