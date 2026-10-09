// Opening links out of the app. On iOS, handing an https URL to the
// system (the opener plugin → UIApplication.open) follows universal
// links: a github.com PR opens in the GitHub app when it's installed,
// otherwise Safari. Same for Linear, Slack, Notion and the rest.

import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

const APPS: [RegExp, string][] = [
  [/(^|\.)github\.com$/, 'GitHub'],
  [/(^|\.)linear\.app$/, 'Linear'],
  [/(^|\.)slack\.com$/, 'Slack'],
  [/(^|\.)notion\.(so|site)$/, 'Notion'],
  [/(^|\.)figma\.com$/, 'Figma'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)(x|twitter)\.com$/, 'X'],
  [/(^|\.)vercel\.com$/, 'Vercel'],
  [/(^|\.)sentry\.io$/, 'Sentry'],
  [/(^|\.)atlassian\.net$/, 'Jira'],
];

/** The app a URL is likely to open in, if a well-known one. */
export function appFor(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return APPS.find(([re]) => re.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function openLink(url: string) {
  if (isTauri()) {
    await openUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}
