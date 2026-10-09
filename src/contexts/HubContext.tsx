import type { HubSnapshot } from '@devhub/shared/hub';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { BridgeClient } from '../lib/bridge/client.ts';
import { getToken, setToken } from '../lib/credentials.ts';
import {
  attention,
  statusCounts,
  type AttentionItem,
  type StatusCounts,
} from '../lib/hub/derive.ts';
import type {
  ConnectionStatus,
  HubConnection,
} from '../lib/hub/connection.ts';
import {
  createMockConnection,
  DEMO_MACHINE_ID,
} from '../lib/hub/mock-connection.ts';
import {
  loadActiveMachine,
  loadMachines,
  saveActiveMachine,
  saveMachines,
  type MachineConfig,
} from '../lib/machines.ts';
import { bridgeOrigin, servedByBridge } from '../lib/base.ts';
import { notify } from '../lib/notify.ts';

interface HubContextValue {
  connection: HubConnection | null;
  snapshot: HubSnapshot;
  status: ConnectionStatus;
  counts: StatusCounts;
  attention: AttentionItem[];
  machines: MachineConfig[];
  activeId: string | null;
  /** True while checking whether the page's own bridge can be used. */
  detecting: boolean;
  /** The active bridge's base URL (null in demo mode). */
  bridgeUrl: string | null;
  selectMachine(id: string | null): void;
  saveMachine(
    machine: MachineConfig,
    token: string | null,
  ): Promise<void>;
  removeMachine(id: string): Promise<void>;
}

const EMPTY: HubSnapshot = {
  machines: [],
  workspaces: [],
  browserTabs: [],
};

const HubContext = createContext<HubContextValue | null>(null);

export const useHub = () => {
  const value = useContext(HubContext);
  if (!value)
    throw new Error('useHub must be used inside HubProvider');
  return value;
};

/** The current connection; throws outside a connected route. */
export const useConnection = () => {
  const { connection } = useHub();
  if (!connection) throw new Error('No machine connected');
  return connection;
};

// Owns which machine is active and the connection to it. UI below only
// sees a HubConnection, so a bridge and demo mode look the same.
export const HubProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [machines, setMachines] = useState(loadMachines);
  const [activeId, setActiveId] = useState(loadActiveMachine);
  const [connection, setConnection] = useState<HubConnection | null>(
    null,
  );
  const [snapshot, setSnapshot] = useState<HubSnapshot>(EMPTY);
  const [status, setStatus] = useState<ConnectionStatus>('offline');
  const lastStatus = useRef(new Map<string, string>());
  const [detecting, setDetecting] = useState(
    () => servedByBridge() && loadMachines().length === 0,
  );

  useEffect(() => {
    let live = true;
    let conn: HubConnection | null = null;
    setSnapshot(EMPTY);
    lastStatus.current.clear();

    void (async () => {
      if (activeId === DEMO_MACHINE_ID) {
        conn = createMockConnection();
      } else {
        const machine = machines.find((m) => m.id === activeId);
        if (!machine) {
          setConnection(null);
          return;
        }
        const token = await getToken(machine.id).catch(() => null);
        if (!live) return;
        conn = new BridgeClient(machine.id, machine.url, token);
      }
      setConnection(conn);
      setStatus(conn.status());
      conn.onStatus(setStatus);
      conn.subscribe(setSnapshot);
    })();

    return () => {
      live = false;
      conn?.close();
    };
  }, [activeId, machines]);

  // Alert when an agent starts needing you or finishes, while the
  // window isn't focused. The "needs you" list covers the focused case.
  useEffect(() => {
    const seen = lastStatus.current;
    for (const ws of snapshot.workspaces) {
      for (const pane of ws.panes) {
        if (pane.kind !== 'agent') continue;
        const key = `${pane.machineId}/${pane.paneId}`;
        const prev = seen.get(key);
        seen.set(key, pane.status);
        if (!prev || prev === pane.status || document.hasFocus())
          continue;
        if (pane.status === 'needsYou') {
          void notify(
            `${pane.title} needs you`,
            pane.ask ?? `${ws.name} is waiting for input`,
          );
        } else if (pane.status === 'done' && prev === 'working') {
          void notify(`${pane.title} finished`, ws.name);
        }
      }
    }
  }, [snapshot]);

  // Opened as the web build a bridge serves (e.g. on a phone): that
  // bridge is the machine, no setup needed.
  useEffect(() => {
    if (!servedByBridge() || machines.length > 0) {
      setDetecting(false);
      return;
    }
    const url = bridgeOrigin();
    void fetch(`${url}/health`)
      .then((res) => (res.ok ? res.json() : null))
      .then((health: { bridge?: { hostname?: string } } | null) => {
        if (!health?.bridge) return;
        const id = (health.bridge.hostname ?? 'server')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-');
        const machine = {
          id,
          label: health.bridge.hostname ?? id,
          url,
        };
        saveMachines([machine]);
        setMachines([machine]);
        saveActiveMachine(id);
        setActiveId(id);
      })
      .catch(() => {})
      .finally(() => setDetecting(false));
    // once, on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectMachine = useCallback((id: string | null) => {
    saveActiveMachine(id);
    setActiveId(id);
  }, []);

  const saveMachine = useCallback(
    async (machine: MachineConfig, token: string | null) => {
      // Clearing a token that was never stored mustn't block a machine
      // that authenticates through Tailscale; only a real save is fatal.
      await setToken(machine.id, token).catch((error: unknown) => {
        if (token) throw error;
      });
      setMachines((prev) => {
        const next = [
          ...prev.filter((m) => m.id !== machine.id),
          machine,
        ];
        saveMachines(next);
        return next;
      });
    },
    [],
  );

  const removeMachine = useCallback(
    async (id: string) => {
      await setToken(id, null).catch(() => {});
      setMachines((prev) => {
        const next = prev.filter((m) => m.id !== id);
        saveMachines(next);
        return next;
      });
      if (activeId === id) selectMachine(null);
    },
    [activeId, selectMachine],
  );

  const value = useMemo(
    () => ({
      connection,
      snapshot,
      status,
      counts: statusCounts(snapshot),
      attention: attention(snapshot),
      machines,
      activeId,
      detecting,
      bridgeUrl: machines.find((m) => m.id === activeId)?.url ?? null,
      selectMachine,
      saveMachine,
      removeMachine,
    }),
    [
      connection,
      snapshot,
      status,
      machines,
      activeId,
      detecting,
      selectMachine,
      saveMachine,
      removeMachine,
    ],
  );

  return (
    <HubContext.Provider value={value}>
      {children}
    </HubContext.Provider>
  );
};
