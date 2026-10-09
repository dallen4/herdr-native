// Per-machine bridge tokens. Inside Tauri they live in the OS keychain
// (src-tauri/src/keychain.rs); under plain `pnpm dev` in a browser,
// localStorage stands in so the UI stays usable for development.

import { invoke, isTauri } from '@tauri-apps/api/core';

const account = (machineId: string) => `bridge-token:${machineId}`;
const devKey = (machineId: string) => `devhub.devToken.${machineId}`;

export async function getToken(
  machineId: string,
): Promise<string | null> {
  if (isTauri()) {
    return invoke<string | null>('secret_get', {
      account: account(machineId),
    });
  }
  try {
    return localStorage.getItem(devKey(machineId));
  } catch {
    return null;
  }
}

export async function setToken(
  machineId: string,
  token: string | null,
): Promise<void> {
  if (isTauri()) {
    if (token) {
      await invoke('secret_set', {
        account: account(machineId),
        secret: token,
      });
    } else {
      await invoke('secret_delete', { account: account(machineId) });
    }
    return;
  }
  try {
    if (token) localStorage.setItem(devKey(machineId), token);
    else localStorage.removeItem(devKey(machineId));
  } catch {
    // storage unavailable
  }
}
