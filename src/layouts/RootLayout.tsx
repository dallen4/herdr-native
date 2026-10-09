import { Layout } from 'antd';
import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { TopBar } from '../components/organisms/TopBar.tsx';
import { useHub } from '../contexts/HubContext.tsx';
import { UiProvider, useUi } from '../contexts/UiContext.tsx';

function Shortcuts() {
  const { open } = useUi();
  const { connection } = useHub();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (!connection) return;
        e.preventDefault();
        open({ kind: 'palette' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, connection]);
  return null;
}

export const RootLayout = () => (
  <UiProvider>
    <Shortcuts />
    <Layout style={{ height: '100%' }}>
      <TopBar />
      <main style={{ flex: 1, minHeight: 0 }}>
        <Outlet />
      </main>
    </Layout>
  </UiProvider>
);
