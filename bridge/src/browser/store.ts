// Browser tabs, persisted on the bridge so every client (and the CLI)
// sees the same set. Written atomically, readable by the user only.

import type { BrowserAnchor, BrowserTab } from '@devhub/shared/hub';
import { titleFor } from '@devhub/shared/browser';
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dir =
  process.env.DEVHUB_BRIDGE_STATE_DIR ??
  join(homedir(), '.config', 'devhub-bridge');
const file = join(dir, 'browser-tabs.json');

export class BrowserStore {
  private tabs: BrowserTab[];
  private listeners = new Set<() => void>();

  constructor() {
    try {
      this.tabs = existsSync(file)
        ? (JSON.parse(readFileSync(file, 'utf8')) as BrowserTab[])
        : [];
    } catch {
      this.tabs = [];
    }
  }

  list() {
    return this.tabs;
  }

  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: BrowserTab[], notify = true) {
    this.tabs = next;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2), {
      mode: 0o600,
    });
    chmodSync(tmp, 0o600);
    renameSync(tmp, file);
    if (notify) for (const l of this.listeners) l();
  }

  open(
    url: string,
    anchor: BrowserAnchor | null,
    createdBy: BrowserTab['createdBy'],
  ): BrowserTab {
    const tab: BrowserTab = {
      id: `dh_${randomBytes(5).toString('hex')}`,
      url,
      title: titleFor(url),
      anchor,
      createdBy,
      createdAt: Date.now(),
    };
    this.commit([...this.tabs, tab]);
    return tab;
  }

  update(id: string, url: string) {
    if (!this.tabs.some((t) => t.id === id && t.url !== url)) return;
    this.commit(
      this.tabs.map((t) =>
        t.id === id ? { ...t, url, title: titleFor(url) } : t,
      ),
    );
  }

  setAnchor(id: string, anchor: BrowserAnchor | null) {
    this.commit(
      this.tabs.map((t) => (t.id === id ? { ...t, anchor } : t)),
    );
  }

  close(id: string) {
    this.commit(this.tabs.filter((t) => t.id !== id));
  }

  /** Persist refreshed anchors without echoing a change event (the
   * caller is already broadcasting). */
  replaceAll(tabs: BrowserTab[]) {
    this.commit(tabs, false);
  }
}
