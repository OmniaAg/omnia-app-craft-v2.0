export type NavigationItem = { href: string; label: string; capability?: string }
export type NavigationGroup = { label: string; items: NavigationItem[] }

const internal: NavigationGroup[] = [
  { label: 'Inicio', items: [{ href: '/app', label: 'Inicio' }] },
  { label: 'Trabajo', items: [
    { href: '/app/my-space', label: 'Mi Espacio' },
    { href: '/app/projects', label: 'Proyectos' },
    { href: '/app/reviews', label: 'Mis revisiones' },
  ] },
  { label: 'Clientes', items: [
    { href: '/app/crm/accounts', label: 'Organizaciones', capability: 'organization.view' },
    { href: '/app/crm/contacts', label: 'Contactos', capability: 'contact.view' },
    { href: '/app/crm/opportunities', label: 'Oportunidades', capability: 'opportunity.view' },
  ] },
  { label: 'Contenido', items: [
    { href: '/app/editorial/calendar', label: 'Editorial' },
    { href: '/app/content-manager', label: 'Archivos' },
  ] },
  { label: 'Gestión', items: [
    { href: '/app/billing', label: 'Billing', capability: 'billing.view' },
    { href: '/app/analytics', label: 'Analytics y reportes', capability: 'analytics.view' },
    { href: '/app/automations', label: 'Automatizaciones', capability: 'automation.view' },
    { href: '/app/integrations', label: 'Integraciones', capability: 'integration.view' },
  ] },
  { label: 'Más', items: [
    { href: '/app/messages', label: 'Mensajes' },
    { href: '/app/notifications', label: 'Notificaciones' },
    { href: '/app/settings', label: 'Configuración' },
  ] },
]

export const clientNavigation: NavigationGroup[] = [
  { label: 'Resumen', items: [{ href: '/portal', label: 'Resumen' }] },
  { label: 'Proyectos', items: [{ href: '/portal/projects', label: 'Proyectos' }] },
  { label: 'Aprobaciones', items: [{ href: '/portal/approvals', label: 'Aprobaciones' }] },
  { label: 'Mensajes', items: [{ href: '/portal/messages', label: 'Mensajes' }] },
  { label: 'Más', items: [
    { href: '/portal/documents', label: 'Documentos' },
    { href: '/portal/reports', label: 'Reportes' },
    { href: '/portal/notifications', label: 'Notificaciones' },
    { href: '/portal/settings', label: 'Configuración' },
  ] },
]

export function internalNavigation(hasCapability: (key: string) => boolean, hasClientContext: boolean) {
  return internal.map(group => ({ ...group, items: group.items.filter(item => !item.capability || hasCapability(item.capability)) }))
    .filter(group => group.items.length)
    .map(group => group.label === 'Más' && hasClientContext ? { ...group, items: [...group.items, { href: '/portal', label: 'Portal cliente' }] } : group)
}
