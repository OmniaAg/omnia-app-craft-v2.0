import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getPublicEnv } from './shared/config/env'

getPublicEnv()

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('No se encontró el contenedor raíz de OMNIA Craft.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
