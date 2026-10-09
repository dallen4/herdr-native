import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// App-level overlays (drawers, palette, modals), opened from anywhere:
// the top bar, the sidebar, a tool step, the command palette.

export type Overlay =
  | { kind: 'palette' }
  | { kind: 'newAgent'; workspaceId?: string }
  | { kind: 'files'; cwd: string; path?: string }
  | { kind: 'changes'; cwd: string }
  | { kind: 'newBrowser'; workspaceId?: string; paneId?: string }
  | null;

export type SessionMode = 'Chat' | 'Terminal' | 'Split';

/** How a pane is shown: chat, terminal, or chat with something beside
 * it (its terminal, or a browser tab by id). */
export interface PaneView {
  mode: SessionMode;
  right: 'terminal' | string;
}

const DEFAULT_VIEW: PaneView = { mode: 'Chat', right: 'terminal' };

interface UiContextValue {
  overlay: Overlay;
  open(overlay: Exclude<Overlay, null>): void;
  close(): void;
  /** The shell shown in the terminal dock (a paneKey). */
  dockPane: string | null;
  showInDock(paneKey: string | null): void;
  viewOf(paneKey: string): PaneView;
  setView(paneKey: string, view: Partial<PaneView>): void;
  /** Phone layout: the sidebar drawer and the activity sheet. */
  navOpen: boolean;
  setNavOpen(open: boolean): void;
  sheetOpen: boolean;
  setSheetOpen(open: boolean): void;
}

const UiContext = createContext<UiContextValue | null>(null);

export const useUi = () => {
  const value = useContext(UiContext);
  if (!value) throw new Error('useUi must be used inside UiProvider');
  return value;
};

export const UiProvider = ({ children }: { children: ReactNode }) => {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [dockPane, setDockPane] = useState<string | null>(null);
  const [views, setViews] = useState<Record<string, PaneView>>({});
  const [navOpen, setNavOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const value = useMemo(
    () => ({
      overlay,
      open: (o: Exclude<Overlay, null>) => setOverlay(o),
      close: () => setOverlay(null),
      dockPane,
      showInDock: setDockPane,
      viewOf: (key: string) => views[key] ?? DEFAULT_VIEW,
      setView: (key: string, view: Partial<PaneView>) =>
        setViews((v) => ({
          ...v,
          [key]: { ...(v[key] ?? DEFAULT_VIEW), ...view },
        })),
      navOpen,
      setNavOpen,
      sheetOpen,
      setSheetOpen,
    }),
    [overlay, dockPane, views, navOpen, sheetOpen],
  );
  return (
    <UiContext.Provider value={value}>{children}</UiContext.Provider>
  );
};
