// Per-pane composer state that outlives the component: drafts (saved
// across restarts) and the queue of messages written while the agent
// works. Nothing queued is ever sent automatically; the user sends each
// one.

import { useSyncExternalStore } from 'react';

export interface Queued {
  id: string;
  text: string;
}

const DRAFT_KEY = (key: string) => `devhub.draft.${key}`;

const queues = new Map<string, Queued[]>();
const listeners = new Set<() => void>();
const EMPTY: Queued[] = [];

const emit = () => {
  for (const l of listeners) l();
};

export function loadDraft(key: string): string {
  try {
    return localStorage.getItem(DRAFT_KEY(key)) ?? '';
  } catch {
    return '';
  }
}

export function saveDraft(key: string, text: string) {
  try {
    if (text) localStorage.setItem(DRAFT_KEY(key), text);
    else localStorage.removeItem(DRAFT_KEY(key));
  } catch {
    // storage unavailable
  }
}

export function enqueue(key: string, text: string) {
  queues.set(key, [
    ...(queues.get(key) ?? []),
    { id: crypto.randomUUID(), text },
  ]);
  emit();
}

export function dequeue(key: string, id: string) {
  queues.set(
    key,
    (queues.get(key) ?? []).filter((q) => q.id !== id),
  );
  emit();
}

export function useQueue(key: string): Queued[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => queues.get(key) ?? EMPTY,
  );
}
