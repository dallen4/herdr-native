import type { BrowserTab, Pane, Workspace } from '@devhub/shared/hub';
import { describe, expect, it } from 'bun:test';
import { anchorFor, resolveTabs } from './anchors.ts';

const pane = (paneId: string, title: string): Pane => ({
  machineId: 'm',
  paneId,
  workspaceId: '',
  tabId: '',
  terminalId: '',
  title,
  cwd: null,
  kind: 'shell',
  state: 'idle',
});

const ws = (
  id: string,
  name: string,
  cwd: string | null,
  panes: Pane[] = [],
): Workspace => ({
  machineId: 'm',
  id,
  name,
  cwd,
  branch: null,
  worktree: false,
  repoKey: null,
  tabs: [],
  panes,
});

const tab = (anchor: BrowserTab['anchor']): BrowserTab => ({
  id: 'dh1',
  url: 'https://github.com',
  title: 'github.com',
  anchor,
  createdBy: 'app',
  createdAt: 0,
});

const devhub = ws('w5', 'devhub', '/p/devhub', [
  pane('w5:p1', 'claude'),
]);

describe('resolveTabs', () => {
  it('keeps an anchor whose id still fits', () => {
    const t = tab(anchorFor(devhub, devhub.panes[0]));
    const { shown, changed } = resolveTabs([t], [devhub]);
    expect(changed).toBe(false);
    expect(shown[0]!.anchor).toEqual(t.anchor);
  });

  it('re-finds the workspace by path after a restart renumbers it', () => {
    const t = tab(anchorFor(devhub, devhub.panes[0]));
    const restarted = [
      ws('w5', 'deadrop', '/p/deadrop'), // the old id now names another
      ws('w2', 'devhub', '/p/devhub', [pane('w2:p1', 'claude')]),
    ];
    const { shown, stored, changed } = resolveTabs([t], restarted);
    expect(changed).toBe(true);
    expect(shown[0]!.anchor).toMatchObject({
      workspaceId: 'w2',
      paneId: 'w2:p1',
    });
    expect(stored[0]!.anchor?.workspaceId).toBe('w2');
  });

  it('falls back to the name when the path moved', () => {
    const t = tab(anchorFor(devhub));
    const { shown } = resolveTabs(
      [t],
      [ws('w9', 'devhub', '/elsewhere')],
    );
    expect(shown[0]!.anchor?.workspaceId).toBe('w9');
  });

  it('shows a tab unanchored when its workspace is gone, without forgetting it', () => {
    const t = tab(anchorFor(devhub));
    const { shown, stored, changed } = resolveTabs([t], []);
    expect(shown[0]!.anchor).toBeNull();
    expect(stored[0]!.anchor).toEqual(t.anchor);
    expect(changed).toBe(false);
  });
});
