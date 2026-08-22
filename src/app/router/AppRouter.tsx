import { useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { appRoutes } from './routes'

export function AppRouter() {
  const [router] = useState(() => createBrowserRouter(appRoutes))

  return <RouterProvider router={router} />
}
