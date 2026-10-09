// Re-finding a browser tab's place in herdr.
//
// herdr is the source of truth for workspaces and panes, but its ids
// can change across a herdr server restart. Each tab's anchor carries
// the ids it was last seen with plus a fingerprint (workspace path and
// name, pane title). Resolution:
//
// 1. The anchor's workspace id exists and still fits the fingerprint
//    (same path, or same name): keep it.
// 2. Otherwise the server restarted (or the id now names something
//    else): find the live workspace by path, then by name.
// 3. Nothing fits: the tab becomes free-standing rather than lost.
//
// Panes resolve the same way inside the chosen workspace (id, then
// title); a pane that can't be found just drops to the workspace.

import type {
  BrowserAnchor,
  BrowserTab,
  Pane,
  Workspace,
} from '@devhub/shared/hub';

const fits = (ws: Workspace, a: BrowserAnchor) =>
  (a.workspacePath !== null && ws.cwd === a.workspacePath) ||
  ws.name === a.workspaceName;

function findWorkspace(
  a: BrowserAnchor,
  workspaces: Workspace[],
): Workspace | null {
  const byId = workspaces.find((ws) => ws.id === a.workspaceId);
  if (byId && fits(byId, a)) return byId;
  return (
    (a.workspacePath !== null &&
      workspaces.find((ws) => ws.cwd === a.workspacePath)) ||
    workspaces.find((ws) => ws.name === a.workspaceName) ||
    null
  );
}

function findPane(a: BrowserAnchor, ws: Workspace): Pane | null {
  if (!a.paneId) return null;
  const byId = ws.panes.find((p) => p.paneId === a.paneId);
  if (byId && (a.paneTitle === null || byId.title === a.paneTitle)) {
    return byId;
  }
  return (
    (a.paneTitle !== null &&
      ws.panes.find((p) => p.title === a.paneTitle)) ||
    null
  );
}

export function anchorFor(
  ws: Workspace,
  pane?: Pane | null,
): BrowserAnchor {
  return {
    workspaceId: ws.id,
    workspacePath: ws.cwd,
    workspaceName: ws.name,
    paneId: pane?.paneId ?? null,
    paneTitle: pane?.title ?? null,
  };
}

export function resolveAnchor(
  a: BrowserAnchor | null,
  workspaces: Workspace[],
): BrowserAnchor | null {
  if (!a) return null;
  const ws = findWorkspace(a, workspaces);
  if (!ws) return null;
  const pane = findPane(a, ws);
  return anchorFor(ws, pane);
}

const same = (x: BrowserAnchor | null, y: BrowserAnchor | null) =>
  JSON.stringify(x) === JSON.stringify(y);

/** Resolve every tab; reports whether any anchor changed so the store
 * can persist the refreshed ids. Free-standing tabs whose workspace is
 * merely missing right now keep their old anchor on disk (herdr may be
 * mid-restart) but are shown unanchored. */
export function resolveTabs(
  tabs: BrowserTab[],
  workspaces: Workspace[],
): { shown: BrowserTab[]; stored: BrowserTab[]; changed: boolean } {
  let changed = false;
  const shown: BrowserTab[] = [];
  const stored: BrowserTab[] = [];
  for (const tab of tabs) {
    const resolved = resolveAnchor(tab.anchor, workspaces);
    shown.push({ ...tab, anchor: resolved });
    if (resolved && !same(resolved, tab.anchor)) {
      changed = true;
      stored.push({ ...tab, anchor: resolved });
    } else {
      stored.push(tab);
    }
  }
  return { shown, stored, changed };
}
