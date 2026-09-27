import type { ReactNode } from 'react'

export function CrmPageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <header className="crm-page-header">
      <div>
        <h1 data-route-heading tabIndex={-1}>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="crm-page-header__action">{action}</div> : null}
    </header>
  )
}

export function CrmEmpty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="crm-empty">
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function CrmError({ message }: { message: string }) {
  return <div className="crm-feedback crm-feedback--error" role="alert">{message}</div>
}

export function CrmSuccess({ message }: { message: string }) {
  return <div className="crm-feedback crm-feedback--success" role="status">{message}</div>
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <span id={id} className="crm-field-error" role="alert">{message}</span> : null
}

export function StatusBadge({ value }: { value: string }) {
  const labels: Record<string, string> = {
    active_client: 'Cliente activo', active: 'Activo', inactive: 'Inactivo', archived: 'Archivado',
    planning: 'Planeación', on_hold: 'En pausa', completed: 'Completado',
    todo: 'Por hacer', in_progress: 'En curso', blocked: 'Bloqueado', done: 'Completado', cancelled: 'Cancelado',
    low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente', assigned: 'Asignado',
    open: 'Abierto', won: 'Ganada', lost: 'Perdida', prospect: 'Prospecto',
    planned: 'Planificado', available: 'Disponible', pending: 'Pendiente', accepted: 'Aceptada', rejected: 'No seleccionada',
    note: 'Nota', reminder: 'Recordatorio', project: 'Proyecto', personal: 'Personal',
    draft: 'Borrador', in_review: 'En revisión', changes_requested: 'Cambios solicitados',
    ready_for_client: 'Lista para cliente', published_to_client: 'Publicada', client_approved: 'Aprobada por cliente',
    approved: 'Aprobada', overridden: 'Omitida por Dirección',
  }
  return <span className="crm-status" data-status={value}>{labels[value] ?? value.replaceAll('_', ' ')}</span>
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const start = total === 0 ? 0 : page * pageSize + 1
  const end = Math.min(total, (page + 1) * pageSize)
  return (
    <nav className="crm-pagination" aria-label="Paginación">
      <span>{start}–{end} de {total}</span>
      <div>
        <button type="button" onClick={() => onPage(page - 1)} disabled={page === 0}>Anterior</button>
        <button type="button" onClick={() => onPage(page + 1)} disabled={end >= total}>Siguiente</button>
      </div>
    </nav>
  )
}

export function LoadingRows({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="crm-loading-row">
      <td colSpan={columns}><span role="status">Cargando registros…</span></td>
    </tr>
  )
}
