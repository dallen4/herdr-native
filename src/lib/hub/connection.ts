// What the UI needs from a hub: the bridge client implements it for
// real machines, the mock for demo mode. UI code only ever sees this.

import type { BaseEvent } from '@devhub/shared/agui';
import type { HubSnapshot } from '@devhub/shared/hub';
import type {
  OpArgs,
  OpName,
  OpResult,
  TerminalMode,
} from '@devhub/shared/protocol';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export interface TerminalHandlers {
  onData(data: string): void;
  onExit(): void;
}

export interface TerminalHandle {
  input(data: string): void;
  resize(cols: number, rows: number): void;
  detach(): void;
}

export interface HubConnection {
  readonly machineId: string;
  snapshot(): HubSnapshot;
  subscribe(listener: (snapshot: HubSnapshot) => void): () => void;
  status(): ConnectionStatus;
  onStatus(listener: (status: ConnectionStatus) => void): () => void;
  subscribeSession(
    paneId: string,
    listener: (events: BaseEvent[]) => void,
  ): () => void;
  attachTerminal(
    paneId: string,
    opts: { cols: number; rows: number; mode: TerminalMode },
    handlers: TerminalHandlers,
  ): TerminalHandle;
  request<K extends OpName>(
    op: K,
    args: OpArgs<K>,
  ): Promise<OpResult<K>>;
  close(): void;
}
