import type { RouteObject } from 'react-router-dom'
import { AuthGate } from '../../features/auth/routing/AuthGate'
import { RootResolution } from '../../features/auth/routing/RootResolution'
import { RouteErrorPage } from '../../shared/ui/RouteErrorPage'
import { RouteFocusManager } from './RouteFocusManager'

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    errorElement: <RouteErrorPage />,
    element: <RouteFocusManager />,
    children: [
      {
        index: true,
        element: <RootResolution />,
      },
      {
        element: <AuthGate context="agency" />,
        children: [
          {
            path: 'app',
            lazy: () => import('../shells/InternalAppShell'),
            children: [
              {
                index: true,
                lazy: () => import('../../features/foundation/InternalHome'),
              },
              {
                path: 'crm/accounts',
                lazy: () => import('../../features/crm/screens/AccountsScreen'),
              },
              {
                path: 'crm/accounts/:organizationId',
                lazy: () => import('../../features/crm/screens/OrganizationDetailScreen'),
              },
              {
                path: 'crm/contacts',
                lazy: () => import('../../features/crm/screens/ContactsScreen'),
              },
              {
                path: 'crm/opportunities',
                lazy: () => import('../../features/crm/screens/OpportunitiesScreen'),
              },
            ],
          },
        ],
      },
      {
        element: <AuthGate context="client" />,
        children: [
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
        ],
      },
      {
        path: 'login',
        lazy: () => import('../../features/auth/screens/LoginScreen'),
      },
      {
        path: 'forgot-password',
        lazy: () => import('../../features/auth/screens/ForgotPasswordScreen'),
      },
      {
        path: 'reset-password',
        lazy: () => import('../../features/auth/screens/ResetPasswordScreen'),
      },
      {
        path: 'accept-invite',
        lazy: () => import('../../features/auth/screens/AcceptInviteScreen'),
      },
      {
        path: 'forbidden',
        lazy: () => import('../../features/auth/screens/ForbiddenScreen'),
      },
      {
        path: '*',
        lazy: () => import('../../features/foundation/NotFoundPlaceholder'),
      },
    ],
  },
]
