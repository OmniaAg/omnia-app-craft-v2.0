import { describe, expect, it } from 'vitest'
import { dashboardKeys } from '../features/dashboard/api/queries'
import {
  addWidget,
  availableWidgetKeys,
  DASHBOARD_MAX_WIDGETS,
  DASHBOARD_REGISTRY_VERSION,
  defaultDashboard,
  normalizeDashboard,
  removeWidget,
  reorderDashboard,
  resizeDashboardAtBreakpoint,
  WIDGET_REGISTRY,
  type DashboardCapabilities,
} from '../features/dashboard/model/dashboard'
import { WidgetStatus } from '../features/dashboard/widgets/widget-primitives'

const contributor: DashboardCapabilities = { canViewOpportunities: false, canViewOrganizations: false }
const crmActor: DashboardCapabilities = { canViewOpportunities: true, canViewOrganizations: true }

describe('Phase 5 dashboard contracts', () => {
  it('owns a versioned code registry with bounded unique defaults', () => {
    expect(DASHBOARD_REGISTRY_VERSION).toBe(1)
    expect(Object.keys(WIDGET_REGISTRY)).toHaveLength(8)
    const defaults = defaultDashboard(crmActor)
    expect(defaults.instances.length).toBe(4)
    expect(defaults.instances.length).toBeLessThanOrEqual(DASHBOARD_MAX_WIDGETS)
    expect(new Set(defaults.instances.map((item) => item.widgetKey)).size).toBe(defaults.instances.length)
  })

  it('omits CRM defaults and toolbox entries without capabilities', () => {
    const keys = defaultDashboard(contributor).instances.map((item) => item.widgetKey)
    expect(keys).not.toContain('crm-opportunities')
    expect(keys).not.toContain('crm-organizations')
    expect(availableWidgetKeys(contributor).every((key) => !key.startsWith('crm-'))).toBe(true)
  })

  it('provides complete single-column mobile layouts and bounded wider layouts', () => {
    const dashboard = defaultDashboard(crmActor)
    for (const breakpoint of ['desktop', 'tablet', 'mobile'] as const) {
      expect(dashboard.layouts[breakpoint]).toHaveLength(dashboard.instances.length)
      const cols = breakpoint === 'desktop' ? 12 : breakpoint === 'tablet' ? 6 : 1
      expect(dashboard.layouts[breakpoint].every((item) => item.x >= 0 && item.x + item.w <= cols)).toBe(true)
    }
    expect(dashboard.layouts.mobile.every((item) => item.x === 0 && item.w === 1)).toBe(true)
    expect(dashboard.layouts.mobile.find((item) => item.i === '51000000-0000-4000-8000-000000000002')?.h).toBe(4)
  })

  it('recovers safely from a newer registry and forbidden persisted widgets', () => {
    const defaults = defaultDashboard(crmActor)
    const newer = normalizeDashboard({ registry_version: 99, widget_instances: defaults.instances, responsive_layouts: defaults.layouts, revision: 7 }, contributor)
    expect(newer.source).toBe('recovered')
    expect(newer.revision).toBe(7)
    const persisted = { ...defaults, instances: defaults.instances.filter((item) => item.widgetKey === 'crm-opportunities') }
    const recovered = normalizeDashboard({ registry_version: 1, widget_instances: persisted.instances, responsive_layouts: { desktop: defaults.layouts.desktop.filter((item) => item.i === persisted.instances[0]?.instanceId), tablet: defaults.layouts.tablet.filter((item) => item.i === persisted.instances[0]?.instanceId), mobile: defaults.layouts.mobile.filter((item) => item.i === persisted.instances[0]?.instanceId) }, revision: 3 }, contributor)
    expect(recovered.instances.some((item) => item.widgetKey.startsWith('crm-'))).toBe(false)
  })

  it('adds and removes a widget across every breakpoint without duplicates', () => {
    const initial = removeWidget(defaultDashboard(crmActor), '51000000-0000-4000-8000-000000000007')
    const added = addWidget(initial, 'crm-opportunities')
    expect(added.instances.filter((item) => item.widgetKey === 'crm-opportunities')).toHaveLength(1)
    expect(addWidget(added, 'crm-opportunities')).toBe(added)
    for (const breakpoint of ['desktop', 'tablet', 'mobile'] as const) expect(added.layouts[breakpoint].some((item) => item.i === '51000000-0000-4000-8000-000000000007')).toBe(true)
  })

  it('keeps semantic and row-major visual order aligned after keyboard reorder', () => {
    const initial = defaultDashboard(contributor)
    const moved = reorderDashboard(initial, initial.instances[1]!.instanceId, -1)
    expect(moved.instances[0]?.widgetKey).toBe('overdue-work')
    for (const breakpoint of ['desktop', 'tablet', 'mobile'] as const) {
      const visualOrder = [...moved.layouts[breakpoint]].sort((a, b) => a.y - b.y || a.x - b.x).map((item) => item.i)
      expect(visualOrder).toEqual(moved.instances.map((item) => item.instanceId))
    }
  })

  it('resizes only the active non-mobile breakpoint', () => {
    const initial = defaultDashboard(contributor)
    const id = initial.instances[0]!.instanceId
    const resized = resizeDashboardAtBreakpoint(initial, id, 'tablet', 0, 1)
    expect(resized.layouts.tablet.find((item) => item.i === id)?.h).toBe(3)
    expect(resized.layouts.desktop).toEqual(initial.layouts.desktop)
    expect(resized.layouts.mobile).toEqual(initial.layouts.mobile)
    expect(resizeDashboardAtBreakpoint(initial, id, 'mobile', 0, 1)).toBe(initial)
  })

  it('uses live semantics for widget loading and errors', () => {
    expect(WidgetStatus({ children: 'Cargando' }).props.role).toBe('status')
    expect(WidgetStatus({ children: 'Falló', tone: 'error' }).props.role).toBe('alert')
  })

  it('separates persisted configuration and shared read-model caches', () => {
    expect(dashboardKeys.config()).not.toEqual(dashboardKeys.operational())
    expect(dashboardKeys.operational()).not.toEqual(dashboardKeys.crm())
  })
})
