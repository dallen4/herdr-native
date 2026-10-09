// Request/response operations from the app (see Ops in
// @devhub/shared/protocol).

import type {
  OpArgs,
  OpName,
  OpResult,
} from '@devhub/shared/protocol';
import { answerKeys } from './claude/prompt.ts';
import {
  confine,
  listDir,
  readFileContent,
  saveImage,
  searchFiles,
} from './files.ts';
import { slashCommands } from './claude/commands.ts';
import { gitDiff, gitStatus } from './git.ts';
import { herdr } from './herdr/client.ts';
import { claudeUsage } from './usage.ts';
import { toUrl } from '@devhub/shared/browser';
import { anchorFor } from './browser/anchors.ts';
import type { BrowserStore } from './browser/store.ts';
import type { Collector } from './hub/collector.ts';
import type { PromptWatcher } from './session.ts';

export class OpError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Handlers = {
  [K in OpName]: (args: OpArgs<K>) => Promise<OpResult<K>>;
};

/** Where a new tab belongs: the given workspace (and pane), or the
 * workspace of the given pane alone. */
export function anchorIn(
  collector: Collector,
  workspaceId?: string,
  paneId?: string,
) {
  const hub = collector.current();
  if (!hub) return null;
  const ws = hub.workspaces.find(
    (w) =>
      (workspaceId && w.id === workspaceId) ||
      (!workspaceId &&
        paneId &&
        w.panes.some((p) => p.paneId === paneId)),
  );
  if (!ws) return null;
  return anchorFor(
    ws,
    ws.panes.find((p) => p.paneId === paneId) ?? null,
  );
}

export function createOps(
  collector: Collector,
  prompts: PromptWatcher,
  browser: BrowserStore,
): Handlers {
  const paneCwd = (paneId: string) => {
    const pane = collector
      .raw()
      ?.panes.find((p) => p.pane_id === paneId);
    if (!pane)
      throw new OpError('pane_not_found', `no pane ${paneId}`);
    const cwd = pane.foreground_cwd ?? pane.cwd;
    if (!cwd)
      throw new OpError('no_cwd', `pane ${paneId} has no cwd`);
    return cwd;
  };

  const done = <T>(p: Promise<unknown>, value: T) =>
    p.then(() => {
      collector.refresh();
      return value;
    });

  async function startAgent(paneId: string, agent?: string) {
    if (agent) await herdr.agentStart(paneId, agent);
  }

  return {
    'pane.send': async ({ paneId, text }) => {
      // Paste the text, then press Enter separately: a newline inside
      // send_text would submit multi-line prompts line by line.
      await herdr.sendText(paneId, text);
      await Bun.sleep(80);
      await herdr.sendKeys(paneId, ['enter']);
      collector.refresh();
      return null;
    },
    'pane.keys': ({ paneId, keys }) =>
      done(herdr.sendKeys(paneId, keys), null),
    'pane.close': ({ paneId }) => done(herdr.paneClose(paneId), null),
    'pane.rename': ({ paneId, label }) =>
      done(herdr.paneRename(paneId, label), null),
    'pane.split': async ({ paneId, direction }) => {
      const res = await herdr.paneSplit(paneId, direction);
      collector.refresh();
      const pane = res.pane ?? res.root_pane;
      return { paneId: pane?.pane_id ?? '' };
    },
    'prompt.answer': async ({ paneId, hash, index }) => {
      const current = await prompts.readNow(paneId);
      if (!current || current.hash !== hash) {
        throw new OpError(
          'prompt_changed',
          'The prompt changed before the answer was sent.',
        );
      }
      if (!current.options.some((o) => o.index === index)) {
        throw new OpError('bad_option', `no option ${index}`);
      }
      await herdr.sendKeys(paneId, answerKeys(current, index));
      collector.refresh();
      return null;
    },
    'workspace.create': async ({ cwd, label, agent }) => {
      // herdr wants an absolute path; confine also expands ~
      const res = await herdr.workspaceCreate(
        await confine(cwd),
        label,
      );
      await startAgent(res.root_pane.pane_id, agent);
      collector.refresh();
      return {
        workspaceId: res.workspace.workspace_id,
        paneId: res.root_pane.pane_id,
      };
    },
    'workspace.rename': ({ workspaceId, label }) =>
      done(herdr.workspaceRename(workspaceId, label), null),
    'workspace.close': ({ workspaceId }) =>
      done(herdr.workspaceClose(workspaceId), null),
    'workspace.move': ({ workspaceId, insertIndex }) =>
      done(herdr.workspaceMove(workspaceId, insertIndex), null),
    'tab.create': async ({ workspaceId, label, agent }) => {
      const res = await herdr.tabCreate(workspaceId, label);
      await startAgent(res.root_pane.pane_id, agent);
      collector.refresh();
      return { tabId: res.tab.tab_id, paneId: res.root_pane.pane_id };
    },
    'fs.list': ({ path }) => listDir(path),
    'fs.read': ({ path }) => readFileContent(path),
    'fs.saveImage': async ({ paneId, name, dataUrl }) => ({
      path: await saveImage(paneCwd(paneId), name, dataUrl),
    }),
    'git.status': async ({ cwd }) => gitStatus(await confine(cwd)),
    'git.diff': async ({ cwd, path, staged }) => ({
      diff: await gitDiff(await confine(cwd), path, staged),
    }),
    'commands.list': async ({ paneId }) => {
      let cwd: string | null = null;
      try {
        cwd = paneCwd(paneId);
      } catch {
        // commands without a project still list the user's and builtins
      }
      return slashCommands(cwd);
    },
    'files.search': ({ paneId, query }) =>
      searchFiles(paneCwd(paneId), query),
    'usage.get': ({ force }) => claudeUsage(force),
    'browser.open': async ({ url, workspaceId, paneId }) =>
      browser.open(
        toUrl(url),
        anchorIn(collector, workspaceId, paneId),
        'app',
      ),
    'browser.update': async ({ id, url }) => {
      browser.update(id, toUrl(url));
      return null;
    },
    'browser.anchor': async ({ id, workspaceId, paneId }) => {
      browser.setAnchor(
        id,
        workspaceId
          ? anchorIn(collector, workspaceId, paneId ?? undefined)
          : null,
      );
      return null;
    },
    'browser.close': async ({ id }) => {
      browser.close(id);
      return null;
    },
  };
}
