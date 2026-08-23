import { Suspense, useRef, useState } from 'react'
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor, type Layout, type ResponsiveLayouts } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import type { DashboardBreakpoint, DashboardDocument, DashboardLayouts } from '../model/dashboard'
import { WIDGET_REGISTRY } from '../model/dashboard'
import { WidgetErrorBoundary } from './WidgetErrorBoundary'

type Props = {
  document: DashboardDocument
  editing: boolean
  busy: boolean
  onLayoutCommit: (layouts: DashboardLayouts) => void
  onRemove: (instanceId: string) => void
  onMove: (instanceId: string, direction: -1 | 1) => void
  onResize: (instanceId: string, breakpoint: DashboardBreakpoint, widthDelta: -1 | 0 | 1, heightDelta: -1 | 0 | 1) => void
}

function ControlIcon({ name }: { name: 'menu' | 'drag' | 'previous' | 'next' | 'narrower' | 'wider' | 'shorter' | 'taller' | 'remove' }) {
  const paths = {
    menu: <><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></>,
    drag: <><path d="M8 5h8M8 12h8M8 19h8"/></>,
    previous: <path d="m15 18-6-6 6-6"/>,
    next: <path d="m9 18 6-6-6-6"/>,
    narrower: <><path d="M9 7 4 12l5 5M15 7l5 5-5 5"/><path d="M4 12h16"/></>,
    wider: <><path d="m7 7-5 5 5 5M17 7l5 5-5 5"/><path d="M2 12h20"/></>,
    shorter: <><path d="m7 9 5-5 5 5M7 15l5 5 5-5"/><path d="M12 4v16"/></>,
    taller: <><path d="m7 7 5-5 5 5M7 17l5 5 5-5"/><path d="M12 2v20"/></>,
    remove: <><path d="M5 7h14M9 7V4h6v3M8 7l1 13h6l1-13"/></>,
  }
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill={name === 'menu' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function cleanLayouts(layouts: ResponsiveLayouts<DashboardBreakpoint>): DashboardLayouts {
  return Object.fromEntries((['desktop', 'tablet', 'mobile'] as const).map((key) => [key, (layouts[key] ?? []).map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))])) as DashboardLayouts
}

export default function DashboardGrid({ document, editing, busy, onLayoutCommit, onRemove, onMove, onResize }: Props) {
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true, initialWidth: 1180 })
  const [breakpoint, setBreakpoint] = useState<DashboardBreakpoint>('desktop')
  const pendingLayouts = useRef<DashboardLayouts>(document.layouts)
  const layouts = Object.fromEntries((['desktop', 'tablet', 'mobile'] as const).map((key) => [key, document.layouts[key].map((item) => {
    const instance = document.instances.find((candidate) => candidate.instanceId === item.i)!
    const size = WIDGET_REGISTRY[instance.widgetKey].size
    const cols = key === 'desktop' ? 12 : key === 'tablet' ? 6 : 1
    return { ...item, minW: key === 'mobile' ? 1 : Math.min(size.minW, cols), maxW: key === 'mobile' ? 1 : Math.min(size.maxW, cols), minH: size.minH, maxH: size.maxH, static: !editing || key === 'mobile' }
  })])) as ResponsiveLayouts<DashboardBreakpoint>

  const commitPending = () => onLayoutCommit(pendingLayouts.current)

  return <div ref={containerRef} className="dashboard-grid-wrap">
    {mounted ? <ResponsiveGridLayout<DashboardBreakpoint>
      width={width}
      layouts={layouts}
      breakpoints={{ desktop: 980, tablet: 620, mobile: 0 }}
      cols={{ desktop: 12, tablet: 6, mobile: 1 }}
      rowHeight={76}
      margin={{ desktop: [16, 16], tablet: [14, 14], mobile: [0, 14] }}
      containerPadding={null}
      compactor={verticalCompactor}
      dragConfig={{ enabled: editing && !busy && breakpoint !== 'mobile', bounded: true, handle: '.dashboard-widget__drag-handle', cancel: 'button,a', threshold: 4 }}
      resizeConfig={{ enabled: editing && !busy && breakpoint !== 'mobile', handles: ['se'] }}
      onBreakpointChange={(next) => setBreakpoint(next)}
      onLayoutChange={(_layout: Layout, next) => { pendingLayouts.current = cleanLayouts(next) }}
      onDragStop={commitPending}
      onResizeStop={commitPending}
    >
      {document.instances.map((instance, index) => {
        const definition = WIDGET_REGISTRY[instance.widgetKey]
        const Widget = definition.component
        return <section key={instance.instanceId} className="dashboard-widget" data-accent={definition.accent} aria-labelledby={`widget-${instance.instanceId}`}>
          <header className="dashboard-widget__header">
            <div><h2 id={`widget-${instance.instanceId}`}>{definition.title}</h2><p>{definition.description}</p></div>
            {editing ? <div className="dashboard-widget__edit-tools">
              {breakpoint !== 'mobile' && !busy ? <span className="dashboard-widget__drag-handle" aria-hidden="true" title={`Arrastrar ${definition.title}`}><ControlIcon name="drag" /></span> : null}
              <details className="dashboard-widget__control-menu">
                <summary aria-label={`Opciones de ${definition.title}`}><ControlIcon name="menu" /></summary>
                <div className="dashboard-widget__controls" role="group" aria-label={`Editar ${definition.title}`}>
                  <button type="button" disabled={busy || index === 0} onClick={() => onMove(instance.instanceId, -1)} aria-label={`Mover ${definition.title} antes`}><ControlIcon name="previous" /></button>
                  <button type="button" disabled={busy || index === document.instances.length - 1} onClick={() => onMove(instance.instanceId, 1)} aria-label={`Mover ${definition.title} después`}><ControlIcon name="next" /></button>
                  {breakpoint !== 'mobile' ? <>
                    <button type="button" disabled={busy} onClick={() => onResize(instance.instanceId, breakpoint, -1, 0)} aria-label={`Hacer ${definition.title} más angosto`}><ControlIcon name="narrower" /></button>
                    <button type="button" disabled={busy} onClick={() => onResize(instance.instanceId, breakpoint, 1, 0)} aria-label={`Hacer ${definition.title} más ancho`}><ControlIcon name="wider" /></button>
                    <button type="button" disabled={busy} onClick={() => onResize(instance.instanceId, breakpoint, 0, -1)} aria-label={`Hacer ${definition.title} más bajo`}><ControlIcon name="shorter" /></button>
                    <button type="button" disabled={busy} onClick={() => onResize(instance.instanceId, breakpoint, 0, 1)} aria-label={`Hacer ${definition.title} más alto`}><ControlIcon name="taller" /></button>
                  </> : null}
                  <button type="button" disabled={busy} onClick={() => onRemove(instance.instanceId)} aria-label={`Quitar ${definition.title}`}><ControlIcon name="remove" /></button>
                </div>
              </details>
            </div> : null}
          </header>
          <div className="dashboard-widget__body">
            <WidgetErrorBoundary title={definition.title}><Suspense fallback={<p className="dashboard-widget__status" role="status">Preparando widget…</p>}><Widget config={instance.config} widgetKey={instance.widgetKey} /></Suspense></WidgetErrorBoundary>
          </div>
        </section>
      })}
    </ResponsiveGridLayout> : <p className="dashboard-loading">Midiendo tu espacio…</p>}
  </div>
}
