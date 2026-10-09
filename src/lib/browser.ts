// Browser panes live on the bridge now (shared across devices and the
// CLI). This keeps routing, and moves tabs saved locally by earlier
// builds onto the bridge once.

import type { HubConnection } from './hub/connection.ts';

export const browserPath = (id: string) => `/b/${id}`;

const LEGACY_KEY = 'devhub.browserTabs';

export async function migrateLocalTabs(connection: HubConnection) {
  let legacy: { url: string }[] = [];
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '[]');
  } catch {
    return;
  }
  if (!legacy.length) return;
  for (const tab of legacy) {
    await connection.request('browser.open', { url: tab.url });
  }
  localStorage.removeItem(LEGACY_KEY);
}
