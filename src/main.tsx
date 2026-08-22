import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { env } from './shared/config/env'

void env

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('No se encontró el contenedor raíz de OMNIA Craft.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
