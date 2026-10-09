import {
  applyEvents,
  latestCustom,
  type Message,
} from '@devhub/shared/agui';
import {
  CUSTOM_EVENTS,
  type PaneRef,
  type PromptInfo,
  type SessionMeta,
} from '@devhub/shared/hub';
import { useEffect, useState } from 'react';
import { useHub } from '../contexts/HubContext.tsx';

export interface SessionState {
  loaded: boolean;
  messages: Message[];
  prompt: PromptInfo | null;
  meta: SessionMeta | null;
}

const INITIAL: SessionState = {
  loaded: false,
  messages: [],
  prompt: null,
  meta: null,
};

/** A pane's live session: AG-UI events from the bridge, reduced with
 * the same reducer the bridge uses for its snapshots. */
export function useSession(ref: PaneRef | null): SessionState {
  const { connection } = useHub();
  const [state, setState] = useState(INITIAL);
  const paneId = ref?.paneId ?? null;

  useEffect(() => {
    setState(INITIAL);
    if (!paneId || !connection) return;
    return connection.subscribeSession(paneId, (events) => {
      const custom = latestCustom(events);
      setState((prev) => ({
        loaded: true,
        messages: applyEvents(prev.messages, events),
        prompt: custom.has(CUSTOM_EVENTS.prompt)
          ? (custom.get(CUSTOM_EVENTS.prompt) as PromptInfo | null)
          : prev.prompt,
        meta: custom.has(CUSTOM_EVENTS.meta)
          ? (custom.get(CUSTOM_EVENTS.meta) as SessionMeta)
          : prev.meta,
      }));
    });
  }, [connection, paneId]);

  return state;
}
