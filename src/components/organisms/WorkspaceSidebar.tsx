import {
  DownOutlined,
  MoreOutlined,
  PlusOutlined,
  RightOutlined,
  VerticalAlignBottomOutlined,
} from '@ant-design/icons';
import {
  paneKey,
  type BrowserTab,
  type Pane,
  type PaneRef,
  type Workspace,
} from '@devhub/shared/hub';
import { App, Button, Dropdown, Flex, Input } from 'antd';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnection, useHub } from '../../contexts/HubContext.tsx';
import { useUi } from '../../contexts/UiContext.tsx';
import { browserPath } from '../../lib/browser.ts';
import * as nativeBrowser from '../../lib/native-browser.ts';
import { panePath } from '../../lib/routes.ts';
import {
  palette,
  radius,
  space,
  status as statusColors,
  type Status,
} from '../../theme/tokens.ts';
import { ClaudeMark } from '../atoms/ClaudeMark.tsx';
import { Display } from '../atoms/Display.tsx';
import { Mono } from '../atoms/Mono.tsx';
import { PaneIcon } from '../atoms/PaneIcon.tsx';
import { StatusDot } from '../atoms/StatusDot.tsx';
import {
  ContextMenu,
  copyText,
  type MenuItem,
} from '../molecules/ContextMenu.tsx';

// ---- shaping ---------------------------------------------------------

interface Group {
  workspace: Workspace;
  worktrees: Workspace[];
}

/** Linked worktrees nest under their repository's main checkout, as
 * herdr groups them; anything without a parent stays top level. */
export function groupWorkspaces(workspaces: Workspace[]): Group[] {
  const mainByRepo = new Map<string, Workspace>();
  for (const ws of workspaces) {
    if (ws.repoKey && !ws.worktree && !mainByRepo.has(ws.repoKey)) {
      mainByRepo.set(ws.repoKey, ws);
    }
  }
  const groups: Group[] = [];
  const byMain = new Map<string, Group>();
  for (const ws of workspaces) {
    const parent =
      ws.worktree && ws.repoKey
        ? mainByRepo.get(ws.repoKey)
        : undefined;
    if (parent && parent !== ws) {
      let group = byMain.get(parent.id);
      if (!group) {
        group = { workspace: parent, worktrees: [] };
        byMain.set(parent.id, group);
      }
      group.worktrees.push(ws);
    } else if (!byMain.has(ws.id)) {
      const group = { workspace: ws, worktrees: [] };
      byMain.set(ws.id, group);
      groups.push(group);
    } else {
      groups.push(byMain.get(ws.id)!);
    }
  }
  return groups;
}

const paneStatus = (p: Pane): Status | null =>
  p.kind === 'agent'
    ? p.status
    : p.state === 'failing'
      ? 'error'
      : p.state === 'running'
        ? 'done'
        : null;

const RANK: Status[] = [
  'needsYou',
  'error',
  'working',
  'done',
  'idle',
];

/** The one status a collapsed workspace shows: whatever most needs
 * attention among its panes. */
function rollup(panes: Pane[]): Status | null {
  const all = panes.map(paneStatus).filter((s): s is Status => !!s);
  return RANK.find((s) => all.includes(s)) ?? null;
}

const subtitle = (p: Pane) =>
  p.kind === 'agent'
    ? p.agent === 'claude'
      ? p.activity
      : `${p.agent} · ${p.activity}`
    : (p.note ?? 'shell');

/** An agent's second line, led by its mark (the Claude logo for
 * Claude Code) instead of spelling out the agent's name. */
function AgentLine({ pane, text }: { pane: Pane; text: string }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        minWidth: 0,
        fontSize: 11.5,
        color: palette.textFaint,
      }}
    >
      {pane.kind === 'agent' && pane.agent === 'claude' && (
        <ClaudeMark size={11} />
      )}
      <span className="devhub-ellipsis">{text}</span>
    </span>
  );
}

/** A single-pane workspace's second line, without repeating what the
 * workspace name already says. */
function metaLine(pane: Pane, ws: Workspace): string {
  const parts = [pane.title, subtitle(pane)];
  const seen = new Set([ws.name.toLowerCase()]);
  return parts
    .filter((p) => {
      const k = p.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join(' · ');
}

const COLLAPSE_KEY = (id: string) => `devhub.sidebar.collapsed.${id}`;
const readCollapsed = (id: string) => {
  try {
    return localStorage.getItem(COLLAPSE_KEY(id)) === '1';
  } catch {
    return false;
  }
};

// ---- rows ------------------------------------------------------------

function Row({
  selected,
  indent = 0,
  onClick,
  menu,
  children,
}: {
  selected?: boolean;
  indent?: number;
  onClick: () => void;
  menu: MenuItem[];
  children: ReactNode;
}) {
  return (
    <ContextMenu items={menu}>
      <div
        className="devhub-row"
        role="button"
        tabIndex={0}
        aria-current={selected ? 'true' : undefined}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space.sm,
          minWidth: 0,
          cursor: 'pointer',
          padding: `${space.xs}px ${space.xs}px ${space.xs}px ${space.sm + indent}px`,
          borderRadius: radius.card,
          border: `1px solid ${selected ? palette.borderEmphasis : 'transparent'}`,
        }}
      >
        {children}
      </div>
    </ContextMenu>
  );
}

function RowMenuButton({ items }: { items: MenuItem[] }) {
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: items.flatMap((i) => [
          ...(i.divider ? [{ type: 'divider' as const }] : []),
          {
            key: i.key,
            label: i.label,
            danger: i.danger,
            disabled: i.disabled,
          },
        ]),
        onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation();
          items.find((i) => i.key === key)?.onClick?.();
        },
      }}
    >
      <Button
        className="devhub-row-action"
        type="text"
        size="small"
        aria-label="More"
        icon={<MoreOutlined />}
        onClick={(e) => e.stopPropagation()}
        style={{ color: palette.textFaint, flex: '0 0 auto' }}
      />
    </Dropdown>
  );
}

// ---- sidebar ---------------------------------------------------------

export function WorkspaceSidebar({
  selected,
  workspace: current,
  browserTabId,
}: {
  selected?: PaneRef;
  workspace?: Workspace;
  /** The open browser tab, when one is showing. */
  browserTabId?: string;
}) {
  const { snapshot } = useHub();
  const browserTabs = snapshot.browserTabs;
  const connection = useConnection();
  const { open, showInDock } = useUi();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const selectedKey = selected && paneKey(selected);
  const selectedPane = selected
    ? snapshot.workspaces
        .flatMap((w) => w.panes)
        .find((p) => paneKey(p) === selectedKey)
    : undefined;
  // Shells can open below an agent (in the dock) without leaving it.
  const canDock = (pane: Pane) =>
    pane.kind === 'shell' &&
    !!selectedPane &&
    paneKey(selectedPane) !== paneKey(pane);
  const groups = useMemo(
    () => groupWorkspaces(snapshot.workspaces),
    [snapshot.workspaces],
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    {},
  );
  const isCollapsed = (id: string) =>
    collapsed[id] ?? readCollapsed(id);
  const toggle = (id: string) => {
    const next = !isCollapsed(id);
    setCollapsed((c) => ({ ...c, [id]: next }));
    try {
      if (next) localStorage.setItem(COLLAPSE_KEY(id), '1');
      else localStorage.removeItem(COLLAPSE_KEY(id));
    } catch {
      // storage unavailable
    }
  };

  const run = (p: Promise<unknown>) =>
    p.catch((e: Error) => message.error(e.message));

  const rename = (
    title: string,
    initial: string,
    save: (v: string) => Promise<unknown>,
  ) => {
    let value = initial;
    modal.confirm({
      title,
      icon: null,
      content: (
        <Input
          autoFocus
          defaultValue={initial}
          onChange={(e) => (value = e.target.value)}
        />
      ),
      okText: 'Rename',
      onOk: () =>
        value.trim() ? run(save(value.trim())) : undefined,
    });
  };

  const confirmClose = (
    title: string,
    close: () => Promise<unknown>,
  ) =>
    modal.confirm({
      title,
      content: 'herdr stops its processes.',
      okText: 'Close',
      okButtonProps: { danger: true },
      onOk: () => run(close()),
    });

  const newTerminal = (ws: Workspace) =>
    run(
      connection
        .request('tab.create', { workspaceId: ws.id, label: 'shell' })
        .then(({ paneId }) =>
          navigate(panePath({ machineId: ws.machineId, paneId })),
        ),
    );

  const workspaceMenu = (ws: Workspace): MenuItem[] => {
    const index = snapshot.workspaces.findIndex(
      (w) => w.id === ws.id,
    );
    return [
      {
        key: 'agent',
        label: 'New Claude session here',
        onClick: () => open({ kind: 'newAgent', workspaceId: ws.id }),
      },
      {
        key: 'terminal',
        label: 'New terminal here',
        onClick: () => void newTerminal(ws),
      },
      {
        key: 'browser',
        label: 'Open browser tab here',
        onClick: () =>
          open({ kind: 'newBrowser', workspaceId: ws.id }),
      },
      ...(ws.cwd
        ? [
            {
              key: 'changes',
              label: 'Review changes',
              onClick: () => open({ kind: 'changes', cwd: ws.cwd! }),
            },
            {
              key: 'files',
              label: 'Browse files',
              onClick: () => open({ kind: 'files', cwd: ws.cwd! }),
            },
            {
              key: 'copy-path',
              label: 'Copy path',
              onClick: () => void copyText(ws.cwd!),
            },
          ]
        : []),
      {
        key: 'rename',
        label: 'Rename…',
        divider: true,
        onClick: () =>
          rename('Rename workspace', ws.name, (label) =>
            connection.request('workspace.rename', {
              workspaceId: ws.id,
              label,
            }),
          ),
      },
      {
        key: 'up',
        label: 'Move up',
        disabled: index <= 0,
        onClick: () =>
          void run(
            connection.request('workspace.move', {
              workspaceId: ws.id,
              insertIndex: index - 1,
            }),
          ),
      },
      {
        key: 'down',
        label: 'Move down',
        disabled: index === snapshot.workspaces.length - 1,
        onClick: () =>
          void run(
            connection.request('workspace.move', {
              workspaceId: ws.id,
              insertIndex: index + 1,
            }),
          ),
      },
      {
        key: 'close',
        label: 'Close workspace…',
        danger: true,
        divider: true,
        onClick: () =>
          confirmClose(`Close ${ws.name}?`, () =>
            connection.request('workspace.close', {
              workspaceId: ws.id,
            }),
          ),
      },
    ];
  };

  const paneMenu = (pane: Pane, ws: Workspace): MenuItem[] => [
    {
      key: 'open',
      label: 'Open',
      onClick: () => navigate(panePath(pane)),
    },
    ...(canDock(pane)
      ? [
          {
            key: 'dock',
            label: 'Show in terminal dock',
            onClick: () => showInDock(paneKey(pane)),
          },
        ]
      : []),
    {
      key: 'terminal',
      label: 'New terminal in this workspace',
      onClick: () => void newTerminal(ws),
    },
    ...(pane.cwd
      ? [
          {
            key: 'copy-cwd',
            label: 'Copy path',
            onClick: () => void copyText(pane.cwd!),
          },
        ]
      : []),
    {
      key: 'copy-id',
      label: `Copy pane id (${pane.paneId})`,
      onClick: () => void copyText(pane.paneId),
    },
    {
      key: 'rename',
      label: 'Rename…',
      divider: true,
      onClick: () =>
        rename('Rename pane', pane.title, (label) =>
          connection.request('pane.rename', {
            paneId: pane.paneId,
            label,
          }),
        ),
    },
    {
      key: 'close',
      label: 'Close pane…',
      danger: true,
      onClick: () =>
        confirmClose(`Close ${pane.title}?`, () =>
          connection.request('pane.close', { paneId: pane.paneId }),
        ),
    },
  ];

  const browserMenu = (tab: BrowserTab): MenuItem[] => [
    {
      key: 'open',
      label: 'Open',
      onClick: () => navigate(browserPath(tab.id)),
    },
    {
      key: 'copy',
      label: 'Copy URL',
      onClick: () => void copyText(tab.url),
    },
    ...(tab.anchor
      ? [
          {
            key: 'detach',
            label: 'Move to Browser section',
            onClick: () =>
              void run(
                connection.request('browser.anchor', {
                  id: tab.id,
                  workspaceId: null,
                }),
              ),
          },
        ]
      : current
        ? [
            {
              key: 'attach',
              label: `Keep with ${current.name}`,
              onClick: () =>
                void run(
                  connection.request('browser.anchor', {
                    id: tab.id,
                    workspaceId: current.id,
                  }),
                ),
            },
          ]
        : []),
    {
      key: 'close',
      label: 'Close tab',
      danger: true,
      divider: true,
      onClick: () => {
        void nativeBrowser.destroy(tab.id);
        void run(connection.request('browser.close', { id: tab.id }));
        if (tab.id === browserTabId) navigate('/');
      },
    },
  ];

  const renderBrowserTab = (tab: BrowserTab, indent: number) => (
    <Row
      key={tab.id}
      selected={tab.id === browserTabId}
      indent={indent}
      onClick={() => navigate(browserPath(tab.id))}
      menu={browserMenu(tab)}
    >
      <span
        role="img"
        aria-label="browser"
        style={{
          width: indent ? 19 : 21,
          textAlign: 'center',
          fontSize: indent ? 12 : 14,
          flex: '0 0 auto',
        }}
      >
        🌐
      </span>
      <span
        className="devhub-ellipsis"
        style={{ flex: 1, fontSize: 13 }}
        title={tab.url}
      >
        {tab.title}
      </span>
    </Row>
  );

  const primaryPane = (ws: Workspace) =>
    ws.panes.find((p) => paneKey(p) === selectedKey) ??
    ws.panes.find((p) => p.kind === 'agent') ??
    ws.panes[0];

  const renderWorkspace = (ws: Workspace, nested: boolean) => {
    const primary = primaryPane(ws);
    if (!primary) return null;
    const tabsHere = browserTabs.filter(
      (t) => t.anchor?.workspaceId === ws.id,
    );
    const multi = ws.panes.length + tabsHere.length > 1;
    const folded = multi && isCollapsed(ws.id);
    const status = folded || !multi ? rollup(ws.panes) : null;
    const menu = workspaceMenu(ws);
    const rowSelected = !multi && paneKey(primary) === selectedKey;

    return (
      <div
        key={ws.id}
        style={{ display: 'flex', flexDirection: 'column', gap: 1 }}
      >
        <Row
          selected={rowSelected}
          indent={nested ? space.md : 0}
          onClick={() => navigate(panePath(primary))}
          menu={
            multi
              ? menu
              : [
                  ...paneMenu(primary, ws),
                  ...menu.map((m, i) =>
                    i === 0 ? { ...m, divider: true } : m,
                  ),
                ]
          }
        >
          {multi ? (
            <button
              type="button"
              aria-label={folded ? 'Expand' : 'Collapse'}
              onClick={(e) => {
                e.stopPropagation();
                toggle(ws.id);
              }}
              style={{
                flex: '0 0 auto',
                width: 21,
                padding: 0,
                border: 0,
                background: 'transparent',
                color: palette.textFaint,
                cursor: 'pointer',
                fontSize: 10,
              }}
            >
              {folded ? <RightOutlined /> : <DownOutlined />}
            </button>
          ) : (
            <PaneIcon pane={primary} />
          )}
          <Flex vertical style={{ flex: 1, minWidth: 0 }}>
            <Flex
              align="baseline"
              gap={space.xs}
              style={{ minWidth: 0 }}
            >
              <Display
                size={14}
                style={{
                  flex: '0 1 auto',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {ws.name}
              </Display>
              {ws.branch && !ws.name.endsWith(ws.branch) && (
                <Mono
                  size={11}
                  faint
                  style={{
                    flex: '0 100 auto',
                    minWidth: 24,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ws.branch}
                </Mono>
              )}
            </Flex>
            {!multi && (
              <AgentLine
                pane={primary}
                text={metaLine(primary, ws)}
              />
            )}
          </Flex>
          {status && <StatusDot status={status} />}
          <RowMenuButton items={menu} />
        </Row>

        {multi &&
          !folded &&
          ws.panes.map((pane) => (
            <Row
              key={paneKey(pane)}
              selected={paneKey(pane) === selectedKey}
              indent={(nested ? space.md : 0) + space.lg}
              onClick={() => navigate(panePath(pane))}
              menu={paneMenu(pane, ws)}
            >
              <PaneIcon pane={pane} size={13} />
              <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                <span
                  className="devhub-ellipsis"
                  style={{
                    fontWeight: pane.kind === 'agent' ? 600 : 500,
                    fontSize: 13,
                  }}
                >
                  {pane.title}
                </span>
                {pane.kind === 'agent' && (
                  <AgentLine pane={pane} text={subtitle(pane)} />
                )}
              </Flex>
              {canDock(pane) && (
                <Button
                  className="devhub-row-action"
                  type="text"
                  size="small"
                  aria-label="Show in terminal dock"
                  title="Show in terminal dock"
                  icon={<VerticalAlignBottomOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    showInDock(paneKey(pane));
                  }}
                  style={{
                    color: palette.textFaint,
                    flex: '0 0 auto',
                  }}
                />
              )}
              {paneStatus(pane) && (
                <StatusDot status={paneStatus(pane)!} />
              )}
            </Row>
          ))}
        {multi &&
          !folded &&
          tabsHere.map((tab) =>
            renderBrowserTab(tab, (nested ? space.md : 0) + space.lg),
          )}
      </div>
    );
  };

  return (
    <nav
      aria-label="Workspaces"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <Flex
        align="center"
        justify="space-between"
        style={{
          padding: `${space.lg}px ${space.lg}px ${space.md}px`,
        }}
      >
        <Display>Workspaces</Display>
        <Button
          shape="circle"
          size="small"
          type="text"
          aria-label="New workspace"
          icon={<PlusOutlined />}
          onClick={() => open({ kind: 'newAgent' })}
          style={{ background: palette.raised }}
        />
      </Flex>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: space.md,
          padding: `0 ${space.sm}px ${space.lg}px`,
        }}
      >
        {groups.length === 0 && (
          <span
            style={{
              padding: `0 ${space.sm}px`,
              color: palette.textFaint,
              fontSize: 12.5,
            }}
          >
            No workspaces yet.
          </span>
        )}
        {groups.map(({ workspace, worktrees }) => (
          <section
            key={workspace.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {renderWorkspace(workspace, false)}
            {worktrees.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  marginLeft: space.md,
                  paddingLeft: 2,
                  borderLeft: `1px solid ${statusColors.worktree}55`,
                }}
              >
                {worktrees.map((wt) => renderWorkspace(wt, false))}
              </div>
            )}
          </section>
        ))}

        <section
          style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <Flex
            align="center"
            justify="space-between"
            style={{
              padding: `${space.xs}px ${space.xs}px ${space.xxs}px ${space.sm}px`,
            }}
          >
            <Display size={14} style={{ color: palette.textMuted }}>
              Browser
            </Display>
            <Button
              type="text"
              size="small"
              aria-label="New browser tab"
              icon={<PlusOutlined />}
              onClick={() => open({ kind: 'newBrowser' })}
              style={{ color: palette.textFaint }}
            />
          </Flex>
          {browserTabs
            .filter((t) => !t.anchor)
            .map((tab) => renderBrowserTab(tab, 0))}
        </section>
      </div>

      <Flex
        gap={space.xs}
        style={{
          padding: space.md,
          borderTop: `1px solid ${palette.border}`,
        }}
      >
        <Button
          type="primary"
          block
          onClick={() =>
            open({ kind: 'newAgent', workspaceId: current?.id })
          }
        >
          New agent
        </Button>
        <Button
          color="primary"
          variant="filled"
          block
          disabled={!current}
          onClick={() => current && void newTerminal(current)}
        >
          New terminal
        </Button>
      </Flex>
    </nav>
  );
}
