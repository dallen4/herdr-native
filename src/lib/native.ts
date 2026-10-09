// Typed wrappers over Rust commands. Every command returns
// Result<T, Error> on the Rust side, so a failed invoke rejects with
// `{ code, message }` (src-tauri/src/error.rs).

import { invoke, isTauri } from '@tauri-apps/api/core';

export interface NativeError {
  code: string;
  message: string;
}

export interface AppInfo {
  version: string;
  os: string;
  arch: string;
}

/** True inside the Tauri window; false under plain `pnpm dev`. */
export const inTauri = isTauri;

export async function getAppInfo(): Promise<AppInfo | null> {
  if (!isTauri()) return null;
  return invoke<AppInfo>('app_info');
}

/** A touch device (iPhone/iPad), as opposed to a desktop. iPadOS and
 * iOS user agents both mention "Mac", so check touch support too. */
export const isTouchDevice = () =>
  navigator.maxTouchPoints > 0 &&
  /iPhone|iPad|iPod|Android|Macintosh/.test(navigator.userAgent);

/** Desktop macOS (where the overlay title bar has traffic lights). */
export const isMacDesktop = () =>
  /Macintosh/.test(navigator.userAgent) &&
  navigator.maxTouchPoints === 0;
