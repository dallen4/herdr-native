// Demo mode: a HubConnection over fake data, so the console runs with
// no bridge. Sessions are real AG-UI events, so demo mode exercises the
// same rendering path as a live machine.

import {
  EventType,
  type BaseEvent,
  type Message,
} from '@devhub/shared/agui';
import { titleFor, toUrl } from '@devhub/shared/browser';
import {
  CUSTOM_EVENTS,
  type BrowserTab,
  type HubSnapshot,
  type PromptInfo,
  type SessionMeta,
} from '@devhub/shared/hub';
import type {
  OpArgs,
  OpName,
  OpResult,
} from '@devhub/shared/protocol';
import type {
  HubConnection,
  TerminalHandle,
  TerminalHandlers,
} from './connection.ts';

export const DEMO_MACHINE_ID = 'demo';
const m = DEMO_MACHINE_ID;
const minutesAgo = (n: number) => Date.now() - n * 60_000;
const ws = (id: string) => ({ workspaceId: id, tabId: `${id}:t1` });

const base: Omit<HubSnapshot, 'browserTabs'> = {
  machines: [
    {
      id: m,
      label: 'demo',
      herdrVersion: '0.9.3',
      protocol: 22,
      connected: true,
    },
  ],
  workspaces: [
    {
      machineId: m,
      id: 'w5',
      name: 'devhub',
      cwd: '~/Projects/devhub',
      branch: 'main',
      worktree: false,
      repoKey: 'devhub',
      tabs: [{ id: 'w5:t1', label: '1' }],
      panes: [
        {
          machineId: m,
          paneId: 'w5:p2',
          ...ws('w5'),
          terminalId: 't52',
          cwd: '~/Projects/devhub',
          kind: 'agent',
          agent: 'claude',
          title: 'AG-UI translator',
          status: 'needsYou',
          activity: 'needs input',
          sessionId: 'demo-1',
          ask: 'Bash command: pnpm add @ag-ui/core @ag-ui/client',
          updatedAt: minutesAgo(4),
        },
        {
          machineId: m,
          paneId: 'w5:p1',
          ...ws('w5'),
          terminalId: 't51',
          cwd: '~/Projects/devhub',
          kind: 'agent',
          agent: 'claude',
          title: 'herdr socket client',
          status: 'working',
          activity: 'working · 6m',
          sessionId: 'demo-2',
          updatedAt: minutesAgo(6),
        },
        {
          machineId: m,
          paneId: 'w5:p3',
          ...ws('w5'),
          terminalId: 't53',
          cwd: '~/Projects/devhub',
          kind: 'shell',
          title: 'pnpm tauri dev',
          state: 'running',
        },
      ],
    },
    {
      machineId: m,
      id: 'w6',
      name: 'deadrop',
      cwd: '~/Projects/deadrop',
      branch: 'main',
      worktree: false,
      repoKey: 'deadrop',
      tabs: [{ id: 'w6:t1', label: '1' }],
      panes: [
        {
          machineId: m,
          paneId: 'w6:p1',
          ...ws('w6'),
          terminalId: 't61',
          cwd: '~/Projects/deadrop',
          kind: 'agent',
          agent: 'claude',
          title: 'Docs refresh',
          status: 'done',
          activity: 'finished · 22m',
          sessionId: 'demo-5',
          updatedAt: minutesAgo(22),
        },
      ],
    },
    {
      machineId: m,
      id: 'w2',
      name: 'deadrop.vault-sync',
      cwd: '~/.herdr/worktrees/deadrop/vault-sync',
      branch: 'vault-sync',
      worktree: true,
      repoKey: 'deadrop',
      tabs: [{ id: 'w2:t1', label: '1' }],
      panes: [
        {
          machineId: m,
          paneId: 'w2:p1',
          ...ws('w2'),
          terminalId: 't21',
          cwd: '~/Projects/deadrop',
          kind: 'agent',
          agent: 'claude',
          title: 'Turso replica fix',
          status: 'working',
          activity: 'working · 12m',
          sessionId: 'demo-3',
          updatedAt: minutesAgo(12),
        },
        {
          machineId: m,
          paneId: 'w2:p2',
          ...ws('w2'),
          terminalId: 't22',
          cwd: '~/Projects/deadrop',
          kind: 'shell',
          title: 'pnpm test:watch',
          state: 'failing',
          note: '2 failing',
        },
      ],
    },
    {
      machineId: m,
      id: 'w3',
      name: 'labkit',
      cwd: '~/Projects/labkit',
      branch: 'main',
      worktree: false,
      repoKey: 'labkit',
      tabs: [{ id: 'w3:t1', label: '1' }],
      panes: [
        {
          machineId: m,
          paneId: 'w3:p1',
          ...ws('w3'),
          terminalId: 't31',
          cwd: '~/Projects/labkit',
          kind: 'agent',
          agent: 'claude',
          title: 'Skill parity sync',
          status: 'needsYou',
          activity: 'needs input',
          sessionId: 'demo-4',
          ask: 'Should Windsurf rules mirror the new commit convention?',
          updatedAt: minutesAgo(1),
        },
      ],
    },
  ],
};

const call = (id: string, name: string, args: unknown) => ({
  id,
  type: 'function' as const,
  function: { name, arguments: JSON.stringify(args) },
});

const translatorMessages: Message[] = [
  {
    id: 'u1',
    role: 'user',
    content:
      'Build a HerdrAgent that extends AbstractAgent and emits a STATE_SNAPSHOT from session.snapshot. Use the generated types in shared/src/herdr.',
  },
  {
    id: 'th1',
    role: 'reasoning',
    content:
      'The snapshot already carries workspaces, tabs and panes; the agent only needs to reshape it, so start from the generated SessionSnapshot type.',
  },
  {
    id: 'a1',
    role: 'assistant',
    content:
      "I'll read the generated herdr types first, then scaffold the agent so each pane becomes an entry in hub state.",
  },
  {
    id: 'a2',
    role: 'assistant',
    toolCalls: [
      call('t1', 'Read', {
        file_path: 'shared/src/herdr/generated/success-response.ts',
      }),
    ],
  },
  {
    id: 'r1',
    role: 'tool',
    toolCallId: 't1',
    content: '1,269 lines',
  },
  {
    id: 'a3',
    role: 'assistant',
    toolCalls: [
      call('t2', 'Write', { file_path: 'src/agents/herdr-agent.ts' }),
    ],
  },
  {
    id: 'r2',
    role: 'tool',
    toolCallId: 't2',
    content: 'File created',
  },
  {
    id: 'a4',
    role: 'assistant',
    toolCalls: [
      call('t3', 'TodoWrite', {
        todos: [
          {
            content: 'Read generated herdr types',
            status: 'completed',
          },
          { content: 'Scaffold HerdrAgent', status: 'completed' },
          {
            content: 'Install AG-UI packages',
            status: 'in_progress',
          },
          {
            content: 'Map panes → STATE_SNAPSHOT',
            status: 'pending',
          },
          { content: 'Wire the bridge stream', status: 'pending' },
        ],
      }),
    ],
  },
  { id: 'r3', role: 'tool', toolCallId: 't3', content: 'ok' },
  {
    id: 'a5',
    role: 'assistant',
    content:
      'The agent needs `@ag-ui/core` and `@ag-ui/client`, so I’ll install them.',
  },
  {
    id: 'a6',
    role: 'assistant',
    toolCalls: [
      call('t4', 'Bash', {
        command: 'pnpm add @ag-ui/core @ag-ui/client',
        description: 'Install AG-UI packages',
      }),
    ],
  },
];

const translatorPrompt: PromptInfo = {
  hash: 'demo',
  kind: 'approval',
  title: 'Bash command',
  body: 'pnpm add @ag-ui/core @ag-ui/client\nDo you want to proceed?',
  options: [
    { index: 1, label: 'Yes' },
    {
      index: 2,
      label: "Yes, and don't ask again for pnpm add commands",
    },
    { index: 3, label: 'No, and tell Claude what to do differently' },
  ],
  selected: 1,
};

const meta: SessionMeta = {
  model: 'claude-opus-5-5',
  inputTokens: 182_000,
  outputTokens: 18_200,
  turns: 7,
};

function sessionEvents(paneId: string): BaseEvent[] {
  const messages: Message[] =
    paneId === 'w5:p2'
      ? translatorMessages
      : [
          {
            id: `${paneId}-placeholder`,
            role: 'assistant',
            content:
              'This is demo data. Connect a machine running devhub-bridge to see live sessions.',
          },
        ];
  return [
    { type: EventType.MESSAGES_SNAPSHOT, messages } as BaseEvent,
    {
      type: EventType.CUSTOM,
      name: CUSTOM_EVENTS.meta,
      value: meta,
    } as BaseEvent,
    {
      type: EventType.CUSTOM,
      name: CUSTOM_EVENTS.prompt,
      value: paneId === 'w5:p2' ? translatorPrompt : null,
    } as BaseEvent,
  ];
}

const terminalText = [
  '\x1b[32m~/Projects/devhub\x1b[0m \x1b[90mmain\x1b[0m \x1b[34m$\x1b[0m pnpm api:check',
  '\x1b[90m$ node scripts/sync-herdr-schema.ts --check\x1b[0m',
  'api:sync: in sync (protocol 22 schema_version 1)',
  '\x1b[32m~/Projects/devhub\x1b[0m \x1b[90mmain\x1b[0m \x1b[34m$\x1b[0m ',
].join('\r\n');

const demoDiff = `diff --git a/src/agents/herdr-agent.ts b/src/agents/herdr-agent.ts
new file mode 100644
--- /dev/null
+++ b/src/agents/herdr-agent.ts
@@ -0,0 +1,6 @@
+import { AbstractAgent } from '@ag-ui/client';
+
+export class HerdrAgent extends AbstractAgent {
+  // emits STATE_SNAPSHOT from session.snapshot
+}
+
`;

const demoResults: Partial<{ [K in OpName]: OpResult<K> }> = {
  'git.status': {
    root: '~/Projects/devhub',
    branch: 'main',
    files: [{ code: '??', path: 'src/agents/herdr-agent.ts' }],
  },
  'git.diff': { diff: demoDiff },
  'commands.list': [
    {
      name: '/clear',
      description: 'Clear the conversation',
      source: 'builtin',
    },
    {
      name: '/compact',
      description: 'Compact the conversation',
      source: 'builtin',
    },
  ],
  'files.search': ['src/main.tsx', 'src/router.tsx'],
  'usage.get': {
    plan: 'pro',
    session: {
      usedPercent: 38,
      resetsAt: new Date(Date.now() + 2.4 * 3600_000).toISOString(),
    },
    week: {
      usedPercent: 26,
      resetsAt: new Date(Date.now() + 4 * 86400_000).toISOString(),
    },
    fetchedAt: new Date().toISOString(),
  },
  'fs.list': [],
};

export function createMockConnection(): HubConnection {
  // Browser tabs are the one thing demo mode lets you change.
  let tabs: BrowserTab[] = [
    {
      id: 'dh_demo1',
      url: 'https://example.com/',
      title: 'example.com',
      anchor: {
        workspaceId: 'w5',
        workspacePath: '~/Projects/devhub',
        workspaceName: 'devhub',
        paneId: 'w5:p2',
        paneTitle: 'AG-UI translator',
      },
      createdBy: 'cli',
      createdAt: 0,
    },
  ];
  const listeners = new Set<(s: HubSnapshot) => void>();
  const snapshot = (): HubSnapshot => ({
    ...base,
    browserTabs: tabs,
  });
  const emit = () => {
    const s = snapshot();
    for (const l of listeners) l(s);
  };
  const anchorOf = (
    workspaceId?: string | null,
    paneId?: string | null,
  ) => {
    const ws = base.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return null;
    const pane = ws.panes.find((p) => p.paneId === paneId);
    return {
      workspaceId: ws.id,
      workspacePath: ws.cwd,
      workspaceName: ws.name,
      paneId: pane?.paneId ?? null,
      paneTitle: pane?.title ?? null,
    };
  };

  return {
    machineId: m,
    snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    status: () => 'online',
    onStatus: () => () => {},
    subscribeSession(paneId, listener) {
      const timer = setTimeout(
        () => listener(sessionEvents(paneId)),
        0,
      );
      return () => clearTimeout(timer);
    },
    attachTerminal(
      _paneId,
      _opts,
      handlers: TerminalHandlers,
    ): TerminalHandle {
      const timer = setTimeout(
        () => handlers.onData(terminalText),
        0,
      );
      return {
        input: (data) =>
          handlers.onData(data === '\r' ? '\r\n' : data),
        resize: () => {},
        detach: () => clearTimeout(timer),
      };
    },
    async request<K extends OpName>(op: K, args: OpArgs<K>) {
      await new Promise((r) => setTimeout(r, 150));
      if (op === 'browser.open') {
        const a = args as OpArgs<'browser.open'>;
        const url = toUrl(a.url);
        const tab: BrowserTab = {
          id: `dh_${Math.random().toString(16).slice(2, 8)}`,
          url,
          title: titleFor(url),
          anchor: anchorOf(a.workspaceId, a.paneId),
          createdBy: 'app',
          createdAt: Date.now(),
        };
        tabs = [...tabs, tab];
        emit();
        return tab as OpResult<K>;
      }
      if (op === 'browser.update') {
        const a = args as OpArgs<'browser.update'>;
        tabs = tabs.map((t) =>
          t.id === a.id
            ? { ...t, url: a.url, title: titleFor(a.url) }
            : t,
        );
        emit();
        return null as OpResult<K>;
      }
      if (op === 'browser.anchor') {
        const a = args as OpArgs<'browser.anchor'>;
        tabs = tabs.map((t) =>
          t.id === a.id
            ? { ...t, anchor: anchorOf(a.workspaceId, a.paneId) }
            : t,
        );
        emit();
        return null as OpResult<K>;
      }
      if (op === 'browser.close') {
        const a = args as OpArgs<'browser.close'>;
        tabs = tabs.filter((t) => t.id !== a.id);
        emit();
        return null as OpResult<K>;
      }
      if (op in demoResults) return demoResults[op] as OpResult<K>;
      throw new Error('Demo mode: connect a machine to do this.');
    },
    close() {},
  };
}
