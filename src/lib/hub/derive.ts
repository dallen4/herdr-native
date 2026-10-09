// Pure derivations over hub state, shared by the top bar, sidebar and
// attention panel so counts never disagree.

import type {
  AgentPane,
  HubSnapshot,
  Pane,
  PaneRef,
  Workspace,
} from '@devhub/shared/hub';

export interface StatusCounts {
  working: number;
  needsYou: number;
  failing: number;
}

const agents = (snapshot: HubSnapshot): AgentPane[] =>
  snapshot.workspaces.flatMap((ws) =>
    ws.panes.filter((p): p is AgentPane => p.kind === 'agent'),
  );

export function statusCounts(snapshot: HubSnapshot): StatusCounts {
  const all = snapshot.workspaces.flatMap((ws) => ws.panes);
  return {
    working: all.filter(
      (p) => p.kind === 'agent' && p.status === 'working',
    ).length,
    needsYou: all.filter(
      (p) => p.kind === 'agent' && p.status === 'needsYou',
    ).length,
    failing: all.filter(
      (p) => p.kind === 'shell' && p.state === 'failing',
    ).length,
  };
}

export interface AttentionItem {
  pane: AgentPane;
  workspace: Workspace;
}

/** Agents waiting on the user, oldest ask first. */
export function attention(snapshot: HubSnapshot): AttentionItem[] {
  return snapshot.workspaces
    .flatMap((workspace) =>
      workspace.panes
        .filter(
          (p): p is AgentPane =>
            p.kind === 'agent' && p.status === 'needsYou',
        )
        .map((pane) => ({ pane, workspace })),
    )
    .sort((a, b) => a.pane.updatedAt - b.pane.updatedAt);
}

export function findPane(
  snapshot: HubSnapshot,
  ref: PaneRef,
): { pane: Pane; workspace: Workspace } | undefined {
  for (const workspace of snapshot.workspaces) {
    const pane = workspace.panes.find(
      (p) => p.machineId === ref.machineId && p.paneId === ref.paneId,
    );
    if (pane) return { pane, workspace };
  }
  return undefined;
}

/** The pane to open when none is selected: whoever needs you, else
 * the first agent. */
export function defaultPane(
  snapshot: HubSnapshot,
): AgentPane | undefined {
  return attention(snapshot)[0]?.pane ?? agents(snapshot)[0];
}
