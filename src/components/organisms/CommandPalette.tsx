import { paneKey, type Workspace } from '@devhub/shared/hub';
import { Input, Modal } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHub } from '../../contexts/HubContext.tsx';
import { useUi } from '../../contexts/UiContext.tsx';
import { browserPath } from '../../lib/browser.ts';
import { panePath } from '../../lib/routes.ts';
import { fonts, palette, radius, space } from '../../theme/tokens.ts';
import { Mono } from '../atoms/Mono.tsx';
import { PaneIcon } from '../atoms/PaneIcon.tsx';
import { StatusDot } from '../atoms/StatusDot.tsx';

interface Entry {
  key: string;
  icon?: 'agent' | 'shell';
  label: string;
  hint: string;
  dot?: Parameters<typeof StatusDot>[0]['status'];
  run(): void;
}

export function CommandPalette({
  workspace,
}: {
  workspace?: Workspace;
}) {
  const { snapshot } = useHub();
  const browserTabs = snapshot.browserTabs;
  const { overlay, open, close } = useUi();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const visible = overlay?.kind === 'palette';

  const entries: Entry[] = useMemo(() => {
    const panes = snapshot.workspaces.flatMap((ws) =>
      ws.panes.map((pane) => ({
        key: paneKey(pane),
        icon: pane.kind,
        label: pane.title,
        hint: `${ws.name} · ${pane.kind === 'agent' ? pane.activity : 'shell'}`,
        dot:
          pane.kind === 'agent'
            ? pane.status
            : pane.state === 'failing'
              ? ('error' as const)
              : undefined,
        run: () => navigate(panePath(pane)),
      })),
    );
    const tabs: Entry[] = browserTabs.map((tab) => ({
      key: `browser-${tab.id}`,
      label: tab.title,
      hint: 'browser',
      run: () => navigate(browserPath(tab.id)),
    }));
    const actions: Entry[] = [
      {
        key: 'new-browser',
        label: 'New browser tab',
        hint: 'action',
        run: () =>
          open({ kind: 'newBrowser', workspaceId: workspace?.id }),
      },
      {
        key: 'new-agent',
        label: 'New Claude session',
        hint: 'action',
        run: () =>
          open({ kind: 'newAgent', workspaceId: workspace?.id }),
      },
      ...(workspace?.cwd
        ? [
            {
              key: 'changes',
              label: `Review changes in ${workspace.name}`,
              hint: 'action',
              run: () =>
                open({ kind: 'changes', cwd: workspace.cwd! }),
            },
            {
              key: 'files',
              label: `Browse files in ${workspace.name}`,
              hint: 'action',
              run: () => open({ kind: 'files', cwd: workspace.cwd! }),
            },
          ]
        : []),
      {
        key: 'machines',
        label: 'Machines',
        hint: 'action',
        run: () => navigate('/machines'),
      },
    ];
    const q = query.trim().toLowerCase();
    return [...panes, ...tabs, ...actions].filter(
      (e) =>
        !q ||
        e.label.toLowerCase().includes(q) ||
        e.hint.toLowerCase().includes(q),
    );
  }, [snapshot, browserTabs, query, workspace, navigate, open]);

  const choose = (entry: Entry | undefined) => {
    if (!entry) return;
    // actions may open another overlay, so close this one first
    close();
    setQuery('');
    entry.run();
  };

  return (
    <Modal
      open={visible}
      onCancel={() => {
        close();
        setQuery('');
      }}
      footer={null}
      closable={false}
      width={600}
      styles={{ body: { padding: 0 } }}
      destroyOnHidden
    >
      <Input
        autoFocus
        variant="borderless"
        placeholder="Jump to a pane or run an action"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setCursor(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, entries.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === 'Enter') {
            choose(entries[cursor]);
          }
        }}
        style={{
          padding: space.md,
          fontFamily: fonts.mono,
          fontSize: 13,
          borderBottom: `1px solid ${palette.border}`,
          borderRadius: 0,
        }}
      />
      <div
        role="listbox"
        style={{
          maxHeight: 380,
          overflow: 'auto',
          padding: space.xs,
        }}
      >
        {entries.map((entry, i) => (
          <button
            key={entry.key}
            type="button"
            role="option"
            aria-selected={i === cursor}
            onMouseEnter={() => setCursor(i)}
            onClick={() => choose(entry)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: space.sm,
              width: '100%',
              padding: `${space.xs}px ${space.sm}px`,
              border: 0,
              borderRadius: radius.control,
              cursor: 'pointer',
              textAlign: 'left',
              font: 'inherit',
              color: palette.text,
              background:
                i === cursor ? palette.raised : 'transparent',
            }}
          >
            {entry.icon ? (
              <PaneIcon pane={{ kind: entry.icon }} size={13} />
            ) : (
              <span style={{ width: 19 }} />
            )}
            <span className="devhub-ellipsis" style={{ flex: 1 }}>
              {entry.label}
            </span>
            {entry.dot && <StatusDot status={entry.dot} />}
            <Mono size={11} faint>
              {entry.hint}
            </Mono>
          </button>
        ))}
        {entries.length === 0 && (
          <div
            style={{ padding: space.md, color: palette.textFaint }}
          >
            Nothing matches.
          </div>
        )}
      </div>
    </Modal>
  );
}
