import type { Workspace } from '@devhub/shared/hub';
import { describe, expect, it } from 'vitest';
import { groupWorkspaces } from './WorkspaceSidebar.tsx';

const ws = (
  id: string,
  repoKey: string | null,
  worktree = false,
): Workspace => ({
  machineId: 'm',
  id,
  name: id,
  cwd: null,
  branch: null,
  worktree,
  repoKey,
  tabs: [],
  panes: [],
});

describe('groupWorkspaces', () => {
  it('nests linked worktrees under their main checkout', () => {
    const groups = groupWorkspaces([
      ws('deadrop', 'r1'),
      ws('other', null),
      ws('deadrop.alpha', 'r1', true),
      ws('orphan', 'r2', true),
    ]);
    expect(
      groups.map((g) => [
        g.workspace.id,
        g.worktrees.map((w) => w.id),
      ]),
    ).toEqual([
      ['deadrop', ['deadrop.alpha']],
      ['other', []],
      ['orphan', []],
    ]);
  });
});
