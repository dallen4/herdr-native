import { App, Drawer, Empty, Spin, Splitter } from 'antd';
import type { ReactNode } from 'react';
import { useIsMobile } from '../hooks/use-mobile.ts';
import { useEffect, useMemo, useRef } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AttentionPanel } from '../components/organisms/AttentionPanel.tsx';
import { BrowserView } from '../components/organisms/BrowserView.tsx';
import { ChangesDrawer } from '../components/organisms/ChangesDrawer.tsx';
import { CommandPalette } from '../components/organisms/CommandPalette.tsx';
import { FilesDrawer } from '../components/organisms/FilesDrawer.tsx';
import { NewAgentModal } from '../components/organisms/NewAgentModal.tsx';
import { NewBrowserTabModal } from '../components/organisms/NewBrowserTabModal.tsx';
import { SessionView } from '../components/organisms/SessionView.tsx';
import { TerminalDock } from '../components/organisms/TerminalDock.tsx';
import { WorkspaceSidebar } from '../components/organisms/WorkspaceSidebar.tsx';
import { paneKey } from '@devhub/shared/hub';
import { useHub } from '../contexts/HubContext.tsx';
import { useSession } from '../hooks/use-session.ts';
import { defaultPane, findPane } from '../lib/hub/derive.ts';
import { browserPath, migrateLocalTabs } from '../lib/browser.ts';
import { useUi } from '../contexts/UiContext.tsx';
import { panePath } from '../lib/routes.ts';
import { latestPlan } from '../lib/session/turns.ts';
import { palette, space } from '../theme/tokens.ts';

export const ConsolePage = () => {
  const { snapshot, connection, activeId, status, detecting } =
    useHub();
  const { machineId, paneId, tabId } = useParams();
  const browserTabs = snapshot.browserTabs;
  const browserTab = tabId
    ? browserTabs.find((t) => t.id === tabId)
    : undefined;
  const ref = machineId && paneId ? { machineId, paneId } : undefined;
  const hit = ref ? findPane(snapshot, ref) : undefined;
  const session = useSession(
    connection && hit?.pane.kind === 'agent' ? hit.pane : null,
  );
  const plan = useMemo(
    () => latestPlan(session.messages),
    [session.messages],
  );
  const { setView, navOpen, setNavOpen, sheetOpen, setSheetOpen } =
    useUi();
  const isMobile = useIsMobile();

  // Navigating anywhere closes the phone drawers.
  useEffect(() => {
    setNavOpen(false);
    setSheetOpen(false);
  }, [machineId, paneId, tabId, setNavOpen, setSheetOpen]);
  const navigate = useNavigate();
  const { message } = App.useApp();

  // Tabs saved on this device by earlier builds move to the bridge.
  useEffect(() => {
    if (connection && status === 'online') {
      void migrateLocalTabs(connection).catch(() => {});
    }
  }, [connection, status]);

  // A tab an agent opened (`devhub open …`) shows up beside that agent
  // if you're looking at it; otherwise it's announced.
  const seenTabs = useRef<Set<string> | null>(null);
  useEffect(() => {
    seenTabs.current = null;
  }, [connection]);
  useEffect(() => {
    // wait for real hub data before deciding what's already there
    if (snapshot.machines.length === 0) return;
    const ids = new Set(browserTabs.map((t) => t.id));
    if (seenTabs.current === null) {
      seenTabs.current = ids;
      return;
    }
    for (const tab of browserTabs) {
      if (seenTabs.current.has(tab.id) || tab.createdBy !== 'cli')
        continue;
      if (Date.now() - tab.createdAt > 60_000) continue;
      if (
        hit?.pane.kind === 'agent' &&
        tab.anchor?.paneId === hit.pane.paneId
      ) {
        setView(paneKey(hit.pane), { mode: 'Split', right: tab.id });
      } else {
        message.info({
          content: (
            <span>
              Opened <b>{tab.title}</b>
              {tab.anchor
                ? ` in ${tab.anchor.workspaceName}`
                : ''} ·{' '}
              <a onClick={() => navigate(browserPath(tab.id))}>
                Show
              </a>
            </span>
          ),
          duration: 6,
        });
      }
    }
    seenTabs.current = ids;
  }, [
    browserTabs,
    snapshot.machines.length,
    hit,
    setView,
    message,
    navigate,
  ]);

  if (detecting) {
    return <Spin style={{ display: 'block', marginTop: 120 }} />;
  }
  if (!activeId) return <Navigate to="/machines" replace />;
  if (!connection) return null;

  const overlays = (
    <>
      <CommandPalette workspace={hit?.workspace} />
      <NewAgentModal />
      <NewBrowserTabModal />
      <FilesDrawer />
      <ChangesDrawer />
    </>
  );

  // Phone: the active pane fills the screen; the sidebar and the
  // activity panel are drawers.
  const mobileShell = (
    main: ReactNode,
    sidebar: ReactNode,
    activity: ReactNode,
  ) => (
    <>
      <div style={{ height: '100%', minHeight: 0 }}>{main}</div>
      <Drawer
        placement="left"
        open={navOpen}
        onClose={() => setNavOpen(false)}
        size="88%"
        closable={false}
        styles={{ body: { padding: 0 } }}
      >
        {sidebar}
      </Drawer>
      <Drawer
        placement="bottom"
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        size="72%"
        title="Activity"
        styles={{ body: { padding: 0 } }}
      >
        {activity}
      </Drawer>
      {overlays}
    </>
  );

  // A browser tab takes the whole center column; there's no dock to
  // compete with the page.
  if (tabId) {
    if (!browserTab) return <Navigate to="/" replace />;
    if (isMobile) {
      return mobileShell(
        <BrowserView tab={browserTab} compact />,
        <WorkspaceSidebar browserTabId={browserTab.id} />,
        <AttentionPanel plan={[]} />,
      );
    }
    return (
      <>
        <Splitter style={{ height: '100%' }}>
          <Splitter.Panel
            defaultSize={288}
            min={232}
            max={380}
            collapsible
          >
            <WorkspaceSidebar browserTabId={browserTab.id} />
          </Splitter.Panel>
          <Splitter.Panel min={520}>
            <BrowserView tab={browserTab} />
          </Splitter.Panel>
          <Splitter.Panel
            defaultSize={312}
            min={248}
            max={400}
            collapsible
          >
            <AttentionPanel plan={[]} />
          </Splitter.Panel>
        </Splitter>
        {overlays}
      </>
    );
  }

  if (!hit) {
    if (snapshot.workspaces.length === 0) {
      return status === 'online' ? (
        <>
          <Empty
            style={{ marginTop: 120 }}
            description="No workspaces on this machine yet."
          />
          <NewAgentModal />
        </>
      ) : (
        <Spin style={{ display: 'block', marginTop: 120 }} />
      );
    }
    const fallback =
      defaultPane(snapshot) ?? snapshot.workspaces[0]?.panes[0];
    return fallback ? (
      <Navigate to={panePath(fallback)} replace />
    ) : null;
  }

  if (isMobile) {
    return mobileShell(
      <SessionView
        key={panePath(hit.pane)}
        pane={hit.pane}
        workspace={hit.workspace}
        session={session}
      />,
      <WorkspaceSidebar selected={ref} workspace={hit.workspace} />,
      <AttentionPanel plan={plan} />,
    );
  }

  return (
    <>
      <Splitter style={{ height: '100%' }}>
        <Splitter.Panel
          defaultSize={288}
          min={232}
          max={380}
          collapsible
        >
          <WorkspaceSidebar
            selected={ref}
            workspace={hit.workspace}
          />
        </Splitter.Panel>

        <Splitter.Panel min={520}>
          <Splitter orientation="vertical">
            <Splitter.Panel min={280}>
              <SessionView
                key={panePath(hit.pane)}
                pane={hit.pane}
                workspace={hit.workspace}
                session={session}
              />
            </Splitter.Panel>
            <Splitter.Panel
              defaultSize={220}
              min={120}
              collapsible
              style={{ borderTop: `1px solid ${palette.border}` }}
            >
              <TerminalDock
                workspace={hit.workspace}
                exclude={paneKey(hit.pane)}
              />
            </Splitter.Panel>
          </Splitter>
        </Splitter.Panel>

        <Splitter.Panel
          defaultSize={312}
          min={248}
          max={400}
          collapsible
        >
          <AttentionPanel plan={plan} />
        </Splitter.Panel>
      </Splitter>

      {overlays}
      {status !== 'online' && (
        <div
          style={{
            position: 'fixed',
            bottom: space.lg,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: `${space.xs}px ${space.md}px`,
            borderRadius: 999,
            background: palette.card,
            border: `1px solid ${palette.borderStrong}`,
            color: palette.textMuted,
            fontSize: 12,
          }}
        >
          {status === 'connecting'
            ? 'Connecting…'
            : 'Offline. Reconnecting…'}
        </div>
      )}
    </>
  );
};
