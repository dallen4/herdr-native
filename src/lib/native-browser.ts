// Native browser panes: a Tauri child webview per tab, laid over the
// pane's placeholder element. Real webviews load sites that refuse to
// be framed (GitHub, most docs), which an iframe can't.
//
// Child webviews draw above the DOM, so callers hide them whenever an
// overlay (drawer, modal, palette) is open.

import { invoke, isTauri } from '@tauri-apps/api/core';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { Webview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** Child webviews are desktop-only in Tauri; iOS falls back to an
 * iframe plus "open in browser". */
export const nativeBrowser = () =>
  isTauri() &&
  !(
    navigator.maxTouchPoints > 0 &&
    /iPhone|iPad|Macintosh/.test(navigator.userAgent)
  );

const label = (tabId: string) => `browser-${tabId}`;
const views = new Map<string, Promise<Webview>>();

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function create(
  tabId: string,
  url: string,
  b: Bounds,
): Promise<Webview> {
  return new Promise((resolve, reject) => {
    const view = new Webview(getCurrentWindow(), label(tabId), {
      url,
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
    });
    void view.once('tauri://created', () => resolve(view));
    void view.once('tauri://error', (e) =>
      reject(new Error(String(e.payload))),
    );
  });
}

/** Show the tab's webview at these bounds, creating it on first use. */
export async function place(tabId: string, url: string, b: Bounds) {
  let pending = views.get(tabId);
  if (!pending) {
    pending = create(tabId, url, b);
    views.set(tabId, pending);
    pending.catch(() => views.delete(tabId));
    return;
  }
  const view = await pending;
  await view.setPosition(new LogicalPosition(b.x, b.y));
  await view.setSize(new LogicalSize(b.width, b.height));
  await view.show();
}

export async function hide(tabId: string) {
  const view = await views.get(tabId)?.catch(() => null);
  await view?.hide();
}

export async function hideAll() {
  await Promise.all([...views.keys()].map(hide));
}

export async function destroy(tabId: string) {
  const view = await views.get(tabId)?.catch(() => null);
  views.delete(tabId);
  await view?.close();
}

export const navigate = (tabId: string, url: string) =>
  invoke('browser_navigate', { label: label(tabId), url });

export const history = (
  tabId: string,
  action: 'back' | 'forward' | 'reload',
) => invoke('browser_history', { label: label(tabId), action });

export const currentUrl = (tabId: string) =>
  invoke<string>('browser_url', { label: label(tabId) });

export const exists = (tabId: string) => views.has(tabId);
