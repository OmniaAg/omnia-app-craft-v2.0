import { redirect, type RouteObject } from 'react-router-dom'
import { RouteErrorPage } from '../../shared/ui/RouteErrorPage'

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        loader: () => redirect('/app'),
      },
      {
        path: 'app',
        lazy: () => import('../shells/InternalAppShell'),
        children: [
          {
            index: true,
            lazy: () => import('../../features/foundation/InternalHome'),
          },
        ],
      },
      {
        path: 'portal',
        lazy: () => import('../shells/ClientPortalShell'),
        children: [
          {
            index: true,
            lazy: () => import('../../features/foundation/PortalHome'),
          },
        ],
      },
      {
        path: 'login',
        lazy: () => import('../../features/foundation/LoginPlaceholder'),
      },
      {
        path: 'forbidden',
        lazy: () => import('../../features/foundation/ForbiddenPlaceholder'),
      },
      {
        path: '*',
        lazy: () => import('../../features/foundation/NotFoundPlaceholder'),
      },
    ],
  },
]
