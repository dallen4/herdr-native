import { createBrowserRouter } from 'react-router-dom';
import { RouteError } from './components/BootErrorBoundary.tsx';
import { appBase } from './lib/base.ts';
import { RootLayout } from './layouts/RootLayout.tsx';
import { ConsolePage } from './routes/Console.tsx';
import { MachinesPage } from './routes/Machines.tsx';

export const router = createBrowserRouter(
  [
    {
      element: <RootLayout />,
      errorElement: <RouteError />,
      children: [
        { path: '/', element: <ConsolePage /> },
        { path: '/m/:machineId/p/:paneId', element: <ConsolePage /> },
        { path: '/b/:tabId', element: <ConsolePage /> },
        { path: '/machines', element: <MachinesPage /> },
      ],
    },
  ],
  { basename: appBase() || undefined },
);
