// URL helpers shared by the app, the bridge and the CLI.

import { FILE_URL_PREFIX } from './hub.ts';

/** What the user typed → a URL: bare hosts get https, anything that
 * doesn't look like a host becomes a search. */
export function toUrl(input: string): string {
  const text = input.trim();
  if (
    /^https?:\/\//i.test(text) ||
    text.startsWith(FILE_URL_PREFIX)
  ) {
    return text;
  }
  if (/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/|$)/i.test(text)) {
    return `${text.startsWith('localhost') ? 'http' : 'https'}://${text}`;
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`;
}

export function titleFor(url: string): string {
  if (url.startsWith(FILE_URL_PREFIX)) {
    return url.slice(url.lastIndexOf('/') + 1) || url;
  }
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '');
    return `${u.hostname.replace(/^www\./, '')}${path.length > 1 ? path : ''}`;
  } catch {
    return url;
  }
}

/** What a server file may do once loaded: run scripts, open links,
 * submit forms, but never share an origin with the bridge (no
 * allow-same-origin). The bridge sends it as a CSP on /raw and the
 * web build's iframe repeats it. */
export const RAW_SANDBOX =
  'allow-scripts allow-popups allow-forms allow-modals allow-downloads';

/** The address a webview loads: server files go through the bridge's
 * /raw endpoint, everything else as-is. */
export function loadableUrl(url: string, bridgeBase: string): string {
  if (!url.startsWith(FILE_URL_PREFIX)) return url;
  const path = url.slice(FILE_URL_PREFIX.length);
  return `${bridgeBase.replace(/\/+$/, '')}/raw?path=${encodeURIComponent(path)}`;
}
