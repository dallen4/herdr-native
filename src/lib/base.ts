// Where the app is mounted. Inside Tauri it's the root. As the web
// build served by a bridge it can sit under a path (e.g. /devhub behind
// `tailscale serve --set-path /devhub`), so the router's basename is
// whatever comes before the app's own routes.

import { isTauri } from '@tauri-apps/api/core';

const ROUTE = /\/(m|b|machines)(\/|$)/;

export function appBase(pathname = window.location.pathname): string {
  if (isTauri()) return '';
  const route = pathname.search(ROUTE);
  const base = route === -1 ? pathname : pathname.slice(0, route);
  return base.replace(/\/+$/, '');
}

/** True for the web build served by a bridge (not Vite dev, not Tauri):
 * the bridge to talk to is this page's own origin. */
export function servedByBridge(): boolean {
  return !isTauri() && window.location.port !== '1420';
}

export const bridgeOrigin = () =>
  `${window.location.origin}${appBase()}`;
