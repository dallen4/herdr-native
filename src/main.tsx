import { XProvider } from '@ant-design/x';
import { App as AntApp } from 'antd';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { BootErrorBoundary } from './components/BootErrorBoundary.tsx';
import { HubProvider } from './contexts/HubContext.tsx';
import { trackViewport } from './lib/viewport.ts';
import { router } from './router.tsx';
import { antdTheme } from './theme/antd-theme.ts';
import './theme/global.css';

trackViewport();

ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
).render(
  <StrictMode>
    <BootErrorBoundary>
      <XProvider theme={antdTheme}>
        <AntApp
          style={{ height: '100%' }}
          message={{ maxCount: 3, duration: 3.5 }}
        >
          <HubProvider>
            <RouterProvider router={router} />
          </HubProvider>
        </AntApp>
      </XProvider>
    </BootErrorBoundary>
  </StrictMode>,
);
