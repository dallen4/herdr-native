import { PlusOutlined } from '@ant-design/icons';
import {
  paneKey,
  type ShellPane,
  type Workspace,
} from '@devhub/shared/hub';
import { App, Button, Flex, Segmented } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnection, useHub } from '../../contexts/HubContext.tsx';
import { useUi } from '../../contexts/UiContext.tsx';
import { panePath } from '../../lib/routes.ts';
import {
  palette,
  radius,
  space,
  status,
} from '../../theme/tokens.ts';
import { PaneIcon } from '../atoms/PaneIcon.tsx';
import { StatusDot } from '../atoms/StatusDot.tsx';
import { ContextMenu, copyText } from '../molecules/ContextMenu.tsx';
import { XTerm } from '../molecules/XTerm.tsx';

type Scope = 'workspace' | 'all';

// Shell panes as live terminals: the current workspace's by default,
// or every workspace's, grouped by name.
export function TerminalDock({
  workspace,
  exclude,
}: {
  workspace: Workspace;
  /** The pane already open in the main view. */
  exclude?: string;
}) {
  const { snapshot } = useHub();
  const connection = useConnection();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [scope, setScope] = useState<Scope>('workspace');
  const { dockPane: chosen, showInDock: setChosen } = useUi();

  // A shell sent here from another workspace widens the dock to "All".
  useEffect(() => {
    if (!chosen) return;
    const home = snapshot.workspaces.find((ws) =>
      ws.panes.some((p) => paneKey(p) === chosen),
    );
    if (home && home.id !== workspace.id) setScope('all');
  }, [chosen, snapshot.workspaces, workspace.id]);

  const shells = snapshot.workspaces
    .filter((ws) => scope === 'all' || ws.id === workspace.id)
    .flatMap((ws) =>
      ws.panes
        .filter(
          (p): p is ShellPane =>
            p.kind === 'shell' && paneKey(p) !== exclude,
        )
        .map((pane) => ({ pane, ws })),
    );
  const active =
    shells.find((s) => paneKey(s.pane) === chosen) ?? shells[0];

  const newTerminal = async () => {
    try {
      const { paneId } = await connection.request('tab.create', {
        workspaceId: workspace.id,
        label: 'shell',
      });
      setChosen(paneKey({ machineId: workspace.machineId, paneId }));
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const close = (pane: ShellPane) =>
    modal.confirm({
      title: `Close ${pane.title}?`,
      content: 'herdr stops its processes.',
      okText: 'Close',
      okButtonProps: { danger: true },
      onOk: () =>
        connection
          .request('pane.close', { paneId: pane.paneId })
          .catch((e: Error) => message.error(e.message)),
    });

  return (
    <section
      aria-label="Terminals"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: palette.terminal,
      }}
    >
      <Flex
        align="center"
        gap={space.xs}
        style={{
          padding: `${space.xs}px ${space.md}px`,
          flex: '0 0 auto',
          minWidth: 0,
          borderBottom: `1px solid ${palette.border}`,
        }}
      >
        <div
          role="tablist"
          className="no-scrollbar"
          style={{
            display: 'flex',
            gap: 2,
            flex: 1,
            minWidth: 0,
            overflowX: 'auto',
          }}
        >
          {shells.map(({ pane, ws }) => {
            const key = paneKey(pane);
            const isActive = active && paneKey(active.pane) === key;
            return (
              <ContextMenu
                key={key}
                items={[
                  {
                    key: 'open',
                    label: 'Open in main view',
                    onClick: () => navigate(panePath(pane)),
                  },
                  ...(pane.cwd
                    ? [
                        {
                          key: 'copy',
                          label: 'Copy path',
                          onClick: () => void copyText(pane.cwd!),
                        },
                      ]
                    : []),
                  {
                    key: 'close',
                    label: 'Close terminal…',
                    danger: true,
                    divider: true,
                    onClick: () => close(pane),
                  },
                ]}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  title={`${ws.name} · ${pane.title}${pane.cwd ? ` · ${pane.cwd}` : ''} (double-click to open in the main view)`}
                  onClick={() => setChosen(key)}
                  onDoubleClick={() => navigate(panePath(pane))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    maxWidth: 220,
                    height: 26,
                    padding: `0 ${space.sm}px 0 ${space.xs}px`,
                    border: 0,
                    borderRadius: radius.pill,
                    cursor: 'pointer',
                    font: 'inherit',
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    color: isActive
                      ? palette.ground
                      : palette.textSecondary,
                    background: isActive
                      ? status.done
                      : 'transparent',
                  }}
                >
                  <PaneIcon pane={pane} size={12} />
                  <span className="devhub-ellipsis">
                    {scope === 'all' ? `${ws.name} · ` : ''}
                    {pane.title}
                  </span>
                  {pane.state === 'failing' && (
                    <StatusDot status="error" size={6} />
                  )}
                </button>
              </ContextMenu>
            );
          })}
        </div>
        <Button
          shape="circle"
          size="small"
          type="text"
          aria-label="New terminal"
          icon={<PlusOutlined />}
          onClick={() => void newTerminal()}
          style={{ background: palette.raised, flex: '0 0 auto' }}
        />
        <Segmented<Scope>
          size="small"
          shape="round"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'workspace', label: 'This workspace' },
            { value: 'all', label: 'All' },
          ]}
          style={{ flex: '0 0 auto' }}
        />
      </Flex>
      <div style={{ flex: 1, minHeight: 0 }}>
        {active ? (
          <XTerm
            key={paneKey(active.pane)}
            paneId={active.pane.paneId}
          />
        ) : (
          <div
            style={{
              padding: space.lg,
              color: palette.textFaint,
              fontSize: 12.5,
            }}
          >
            {scope === 'workspace'
              ? `No other terminals in ${workspace.name}. Use + to open one.`
              : 'No terminals yet.'}
          </div>
        )}
      </div>
    </section>
  );
}
