import { Link } from 'react-router-dom'
import type { WidgetRenderProps } from '../model/dashboard'

export default function QuickActionsWidget(_props: WidgetRenderProps) {
  return <nav className="dashboard-quick-actions" aria-label="Accesos del dashboard"><Link to="/app/my-space">Abrir mi espacio</Link><Link to="/app/projects">Explorar proyectos</Link></nav>
}
