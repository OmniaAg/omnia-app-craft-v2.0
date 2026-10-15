import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { z } from 'zod'

export const DASHBOARD_REGISTRY_VERSION = 1
export const DASHBOARD_MAX_WIDGETS = 12
export const DASHBOARD_BREAKPOINTS = ['desktop', 'tablet', 'mobile'] as const

export type DashboardBreakpoint = (typeof DASHBOARD_BREAKPOINTS)[number]
export type DashboardLayoutItem = { i: string; x: number; y: number; w: number; h: number }
export type DashboardLayouts = Record<DashboardBreakpoint, DashboardLayoutItem[]>
export type WidgetConfig = { maxItems?: number }
export type WidgetInstance = {
  instanceId: string
  widgetKey: WidgetKey
  widgetVersion: 1
  config: WidgetConfig
  enabled: boolean
}
export type DashboardDocument = {
  registryVersion: number
  instances: WidgetInstance[]
  layouts: DashboardLayouts
  revision: number
  source: 'default' | 'saved' | 'recovered'
}
export type DashboardCapabilities = {
  canViewOpportunities: boolean
  canViewOrganizations: boolean
}

export type WidgetKey =
  | 'my-work-summary'
  | 'overdue-work'
  | 'today-work'
  | 'upcoming-work'
  | 'projects'
  | 'crm-opportunities'
  | 'crm-organizations'
  | 'quick-actions'

export type WidgetRenderProps = { config: WidgetConfig; widgetKey: WidgetKey }
export type WidgetDefinition = {
  key: WidgetKey
  title: string
  description: string
  accent: 'purple' | 'blue' | 'crimson' | 'yellow'
  component: LazyExoticComponent<ComponentType<WidgetRenderProps>>
  requiredCapability?: 'opportunity.view' | 'organization.view'
  defaultConfig: WidgetConfig
  size: { minW: number; maxW: number; minH: number; maxH: number }
  dataStrategy: 'operational-summary' | 'crm-summary' | 'local'
  mobileBehavior: 'stack'
  maxInstances: 1
}

const SummaryWidget = lazy(() => import('../widgets/SummaryWidget'))
const WorkListWidget = lazy(() => import('../widgets/WorkListWidget'))
const ProjectsWidget = lazy(() => import('../widgets/ProjectsWidget'))
const CrmWidget = lazy(() => import('../widgets/CrmWidget'))
const QuickActionsWidget = lazy(() => import('../widgets/QuickActionsWidget'))

export const WIDGET_REGISTRY: Record<WidgetKey, WidgetDefinition> = {
  'my-work-summary': {
    key: 'my-work-summary', title: 'Mi trabajo', description: 'Pulso de pendientes personales y asignados.', accent: 'purple',
    component: SummaryWidget, defaultConfig: { maxItems: 4 }, size: { minW: 4, maxW: 12, minH: 2, maxH: 4 },
    dataStrategy: 'operational-summary', mobileBehavior: 'stack', maxInstances: 1,
  },
  'overdue-work': {
    key: 'overdue-work', title: 'Vencidos', description: 'Trabajo abierto que requiere atención.', accent: 'crimson',
    component: WorkListWidget, defaultConfig: { maxItems: 4 }, size: { minW: 3, maxW: 6, minH: 2, maxH: 4 },
    dataStrategy: 'operational-summary', mobileBehavior: 'stack', maxInstances: 1,
  },
  'today-work': {
    key: 'today-work', title: 'Para hoy', description: 'Compromisos con vencimiento hoy.', accent: 'yellow',
    component: WorkListWidget, defaultConfig: { maxItems: 4 }, size: { minW: 3, maxW: 6, minH: 2, maxH: 4 },
    dataStrategy: 'operational-summary', mobileBehavior: 'stack', maxInstances: 1,
  },
  'upcoming-work': {
    key: 'upcoming-work', title: 'Próximos', description: 'Siguiente trabajo por fecha.', accent: 'blue',
    component: WorkListWidget, defaultConfig: { maxItems: 4 }, size: { minW: 3, maxW: 6, minH: 2, maxH: 4 },
    dataStrategy: 'operational-summary', mobileBehavior: 'stack', maxInstances: 1,
  },
  projects: {
    key: 'projects', title: 'Proyectos', description: 'Proyectos autorizados y señales de atención.', accent: 'yellow',
    component: ProjectsWidget, defaultConfig: { maxItems: 5 }, size: { minW: 4, maxW: 12, minH: 3, maxH: 6 },
    dataStrategy: 'operational-summary', mobileBehavior: 'stack', maxInstances: 1,
  },
  'crm-opportunities': {
    key: 'crm-opportunities', title: 'Oportunidades', description: 'Pipeline comercial dentro de tu alcance.', accent: 'crimson',
    component: CrmWidget, requiredCapability: 'opportunity.view', defaultConfig: { maxItems: 4 }, size: { minW: 3, maxW: 12, minH: 2, maxH: 5 },
    dataStrategy: 'crm-summary', mobileBehavior: 'stack', maxInstances: 1,
  },
  'crm-organizations': {
    key: 'crm-organizations', title: 'Organizaciones', description: 'Cuentas autorizadas de CRM.', accent: 'blue',
    component: CrmWidget, requiredCapability: 'organization.view', defaultConfig: { maxItems: 4 }, size: { minW: 3, maxW: 12, minH: 2, maxH: 5 },
    dataStrategy: 'crm-summary', mobileBehavior: 'stack', maxInstances: 1,
  },
  'quick-actions': {
    key: 'quick-actions', title: 'Accesos', description: 'Atajos a las áreas operativas.', accent: 'purple',
    component: QuickActionsWidget, defaultConfig: {}, size: { minW: 3, maxW: 6, minH: 2, maxH: 3 },
    dataStrategy: 'local', mobileBehavior: 'stack', maxInstances: 1,
  },
}

const widgetConfigSchema = z.object({ maxItems: z.number().int().min(1).max(6).optional() }).strict()
const quickConfigSchema = z.object({}).strict()
const layoutItemSchema = z.object({
  i: z.string().uuid(), x: z.number().int().nonnegative(), y: z.number().int().nonnegative(),
  w: z.number().int().positive(), h: z.number().int().positive(),
}).strict()
const layoutsSchema = z.object({
  desktop: z.array(layoutItemSchema), tablet: z.array(layoutItemSchema), mobile: z.array(layoutItemSchema),
}).strict()

const DEFAULT_IDS: Record<WidgetKey, string> = {
  'my-work-summary': '51000000-0000-4000-8000-000000000001',
  'overdue-work': '51000000-0000-4000-8000-000000000002',
  'today-work': '51000000-0000-4000-8000-000000000003',
  'upcoming-work': '51000000-0000-4000-8000-000000000004',
  projects: '51000000-0000-4000-8000-000000000005',
  'quick-actions': '51000000-0000-4000-8000-000000000006',
  'crm-opportunities': '51000000-0000-4000-8000-000000000007',
  'crm-organizations': '51000000-0000-4000-8000-000000000008',
}

export function isWidgetAllowed(key: WidgetKey, capabilities: DashboardCapabilities) {
  const requirement = WIDGET_REGISTRY[key].requiredCapability
  return requirement === undefined || (requirement === 'opportunity.view' ? capabilities.canViewOpportunities : capabilities.canViewOrganizations)
}

export function availableWidgetKeys(capabilities: DashboardCapabilities) {
  return (Object.keys(WIDGET_REGISTRY) as WidgetKey[]).filter((key) => isWidgetAllowed(key, capabilities))
}

export function createWidgetInstance(key: WidgetKey): WidgetInstance {
  return { instanceId: DEFAULT_IDS[key], widgetKey: key, widgetVersion: 1, config: { ...WIDGET_REGISTRY[key].defaultConfig }, enabled: true }
}

function mobileHeight(key: WidgetKey) {
  if (key === 'projects' || key.startsWith('crm-')) return 5
  if (key === 'overdue-work' || key === 'today-work' || key === 'upcoming-work') return 4
  if (key === 'quick-actions') return 3
  return 2
}

function sequentialMobile(instances: WidgetInstance[]): DashboardLayoutItem[] {
  let y = 0
  return instances.map((instance) => {
    const h = mobileHeight(instance.widgetKey)
    const item = { i: instance.instanceId, x: 0, y, w: 1, h }
    y += h
    return item
  })
}

export function defaultDashboard(capabilities: DashboardCapabilities): DashboardDocument {
  const keys: WidgetKey[] = ['my-work-summary', 'overdue-work', 'projects', 'quick-actions'].filter(key => isWidgetAllowed(key as WidgetKey, capabilities)) as WidgetKey[]
  const instances = keys.map(createWidgetInstance)
  const byKey = Object.fromEntries(instances.map((instance) => [instance.widgetKey, instance.instanceId])) as Record<WidgetKey, string>
  const desktop: DashboardLayoutItem[] = [
    { i: byKey['my-work-summary'], x: 0, y: 0, w: 4, h: 2 },
    { i: byKey['overdue-work'], x: 4, y: 0, w: 4, h: 2 },
    { i: byKey.projects, x: 0, y: 2, w: 8, h: 3 },
    { i: byKey['quick-actions'], x: 8, y: 0, w: 4, h: 2 },
  ]
  const tablet: DashboardLayoutItem[] = [
    { i: byKey['my-work-summary'], x: 0, y: 0, w: 6, h: 2 },
    { i: byKey['overdue-work'], x: 0, y: 2, w: 3, h: 2 },
    { i: byKey['quick-actions'], x: 3, y: 2, w: 3, h: 2 },
    { i: byKey.projects, x: 0, y: 4, w: 6, h: 3 },
  ]
  for (const key of ['crm-opportunities', 'crm-organizations'] as const) {
    if (byKey[key]) {
      desktop.push({ i: byKey[key], x: key === 'crm-opportunities' ? 0 : 6, y: 6, w: 6, h: 3 })
      tablet.push({ i: byKey[key], x: 0, y: key === 'crm-opportunities' ? 9 : 12, w: 6, h: 3 })
    }
  }
  return { registryVersion: DASHBOARD_REGISTRY_VERSION, instances, layouts: { desktop, tablet, mobile: sequentialMobile(instances) }, revision: 0, source: 'default' }
}

type StoredDashboard = { registry_version: number; widget_instances: unknown; responsive_layouts: unknown; revision: number }

function normalizeLayout(raw: unknown, instances: WidgetInstance[], breakpoint: DashboardBreakpoint) {
  const parsed = z.array(layoutItemSchema).safeParse(raw)
  if (!parsed.success) return null
  const enabled = new Set(instances.map((instance) => instance.instanceId))
  const items = parsed.data.filter((item) => enabled.has(item.i))
  if (items.length !== enabled.size || new Set(items.map((item) => item.i)).size !== items.length) return null
  const cols = breakpoint === 'desktop' ? 12 : breakpoint === 'tablet' ? 6 : 1
  for (const item of items) {
    const instance = instances.find((candidate) => candidate.instanceId === item.i)!
    const size = WIDGET_REGISTRY[instance.widgetKey].size
    if (item.x + item.w > cols || item.h < size.minH || item.h > size.maxH) return null
    if (breakpoint === 'mobile' ? item.x !== 0 || item.w !== 1 : item.w < Math.min(size.minW, cols) || item.w > Math.min(size.maxW, cols)) return null
  }
  return items
}

export function normalizeDashboard(raw: StoredDashboard | null, capabilities: DashboardCapabilities): DashboardDocument {
  const fallback = defaultDashboard(capabilities)
  if (!raw) return fallback
  if (!Number.isInteger(raw.registry_version) || raw.registry_version > DASHBOARD_REGISTRY_VERSION) return { ...fallback, revision: raw.revision, source: 'recovered' }
  if (!Array.isArray(raw.widget_instances) || raw.widget_instances.length > DASHBOARD_MAX_WIDGETS) return { ...fallback, revision: raw.revision, source: 'recovered' }

  const seen = new Set<WidgetKey>()
  const instances: WidgetInstance[] = []
  for (const candidate of raw.widget_instances) {
    if (!candidate || typeof candidate !== 'object') continue
    const value = candidate as Record<string, unknown>
    const key = value.widgetKey
    if (typeof key !== 'string' || !(key in WIDGET_REGISTRY) || seen.has(key as WidgetKey)) continue
    const widgetKey = key as WidgetKey
    if (!isWidgetAllowed(widgetKey, capabilities) || value.enabled !== true || value.widgetVersion !== 1 || typeof value.instanceId !== 'string') continue
    const config = (widgetKey === 'quick-actions' ? quickConfigSchema : widgetConfigSchema).safeParse(value.config)
    if (!config.success || !z.string().uuid().safeParse(value.instanceId).success) continue
    seen.add(widgetKey)
    instances.push({ instanceId: value.instanceId, widgetKey, widgetVersion: 1, config: config.data, enabled: true })
  }
  if (!instances.length) return { ...fallback, revision: raw.revision, source: 'recovered' }
  const layoutsResult = layoutsSchema.safeParse(raw.responsive_layouts)
  if (!layoutsResult.success) return { ...fallback, revision: raw.revision, source: 'recovered' }
  const layouts = Object.fromEntries(DASHBOARD_BREAKPOINTS.map((breakpoint) => [breakpoint, normalizeLayout(layoutsResult.data[breakpoint], instances, breakpoint)])) as Record<DashboardBreakpoint, DashboardLayoutItem[] | null>
  if (DASHBOARD_BREAKPOINTS.some((breakpoint) => layouts[breakpoint] === null)) return { ...fallback, revision: raw.revision, source: 'recovered' }
  return { registryVersion: DASHBOARD_REGISTRY_VERSION, instances, layouts: layouts as DashboardLayouts, revision: raw.revision, source: 'saved' }
}

export function addWidget(document: DashboardDocument, key: WidgetKey): DashboardDocument {
  if (document.instances.length >= DASHBOARD_MAX_WIDGETS || document.instances.some((item) => item.widgetKey === key)) return document
  const instance = createWidgetInstance(key)
  const layouts = structuredClone(document.layouts)
  for (const breakpoint of DASHBOARD_BREAKPOINTS) {
    const definition = WIDGET_REGISTRY[key]
    const cols = breakpoint === 'desktop' ? 12 : breakpoint === 'tablet' ? 6 : 1
    const w = breakpoint === 'mobile' ? 1 : Math.min(definition.size.maxW, cols, key === 'projects' ? cols : breakpoint === 'desktop' ? 4 : 3)
    const y = layouts[breakpoint].reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0)
    layouts[breakpoint].push({ i: instance.instanceId, x: 0, y, w, h: breakpoint === 'mobile' ? mobileHeight(key) : definition.size.minH })
  }
  return { ...document, instances: [...document.instances, instance], layouts }
}

export function removeWidget(document: DashboardDocument, instanceId: string): DashboardDocument {
  return { ...document, instances: document.instances.filter((item) => item.instanceId !== instanceId), layouts: Object.fromEntries(DASHBOARD_BREAKPOINTS.map((key) => [key, document.layouts[key].filter((item) => item.i !== instanceId)])) as DashboardLayouts }
}

function packBreakpoint(instances: WidgetInstance[], current: DashboardLayoutItem[], breakpoint: DashboardBreakpoint) {
  if (breakpoint === 'mobile') return sequentialMobile(instances)
  const cols = breakpoint === 'desktop' ? 12 : 6
  let x = 0
  let y = 0
  let rowHeight = 0
  return instances.map((instance) => {
    const existing = current.find((item) => item.i === instance.instanceId)
    const size = WIDGET_REGISTRY[instance.widgetKey].size
    const w = Math.max(Math.min(size.minW, cols), Math.min(Math.min(size.maxW, cols), existing?.w ?? size.minW))
    const h = Math.max(size.minH, Math.min(size.maxH, existing?.h ?? size.minH))
    if (x + w > cols) {
      x = 0
      y += rowHeight
      rowHeight = 0
    }
    const item = { i: instance.instanceId, x, y, w, h }
    x += w
    rowHeight = Math.max(rowHeight, h)
    return item
  })
}

export function reorderDashboard(document: DashboardDocument, instanceId: string, direction: -1 | 1) {
  const index = document.instances.findIndex((item) => item.instanceId === instanceId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= document.instances.length) return document
  const instances = [...document.instances]
  ;[instances[index], instances[target]] = [instances[target], instances[index]]
  const layouts = Object.fromEntries(DASHBOARD_BREAKPOINTS.map((breakpoint) => [breakpoint, packBreakpoint(instances, document.layouts[breakpoint], breakpoint)])) as DashboardLayouts
  return { ...document, instances, layouts }
}

export function resizeDashboardAtBreakpoint(
  document: DashboardDocument,
  instanceId: string,
  breakpoint: DashboardBreakpoint,
  widthDelta: -1 | 0 | 1,
  heightDelta: -1 | 0 | 1,
) {
  if (breakpoint === 'mobile') return document
  const instance = document.instances.find((item) => item.instanceId === instanceId)
  if (!instance) return document
  const size = WIDGET_REGISTRY[instance.widgetKey].size
  const cols = breakpoint === 'desktop' ? 12 : 6
  const changed = document.layouts[breakpoint].map((item) => item.i === instanceId ? {
    ...item,
    w: Math.max(Math.min(size.minW, cols), Math.min(Math.min(size.maxW, cols), item.w + widthDelta)),
    h: Math.max(size.minH, Math.min(size.maxH, item.h + heightDelta)),
  } : item)
  return { ...document, layouts: { ...document.layouts, [breakpoint]: packBreakpoint(document.instances, changed, breakpoint) } }
}
