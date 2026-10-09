// Saved machines (herdr servers running devhub-bridge) and which one is
// active. Only labels and URLs live in webview storage; tokens go to the
// OS keychain (credentials.ts).

import { DEMO_MACHINE_ID } from './hub/mock-connection.ts';

export interface MachineConfig {
  id: string;
  label: string;
  /** Bridge base URL, e.g. https://studio.tail1234.ts.net/devhub */
  url: string;
}

const MACHINES_KEY = 'devhub.machines';
const ACTIVE_KEY = 'devhub.activeMachine';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable; settings won't persist this session
  }
}

export const loadMachines = () =>
  read<MachineConfig[]>(MACHINES_KEY, []);

export function saveMachines(machines: MachineConfig[]) {
  write(MACHINES_KEY, machines);
}

/** The active machine id: a saved machine, DEMO_MACHINE_ID, or null
 * when nothing has been chosen yet. */
export const loadActiveMachine = () =>
  read<string | null>(ACTIVE_KEY, null);

export function saveActiveMachine(id: string | null) {
  write(ACTIVE_KEY, id);
}

export const isDemo = (id: string | null) => id === DEMO_MACHINE_ID;

export function machineIdFor(label: string, taken: string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'machine';
  let id = base;
  for (let n = 2; taken.includes(id) || id === DEMO_MACHINE_ID; n++) {
    id = `${base}-${n}`;
  }
  return id;
}

/** Normalize what a user pastes into a bridge base URL. */
export function normalizeBridgeUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '').replace(/\/(ws|health)$/, '');
}
