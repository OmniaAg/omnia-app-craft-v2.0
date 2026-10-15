import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { NavigationGroup } from './navigation'
import './navigation.css'

export function GroupedNavigation({ groups, label, notificationBadge }: { groups: NavigationGroup[]; label: string; notificationBadge?: ReactNode }) {
  const id = useId()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const triggers = useRef(new Map<string, HTMLButtonElement>())
  const active = (href: string) => href === '/app' || href === '/portal' ? location.pathname === href : location.pathname === href || location.pathname.startsWith(`${href}/`)

  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(null); setMobileOpen(false) } }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])

  const close = () => { setOpen(null); setMobileOpen(false) }
  return <div className="grouped-navigation" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(null)
  }} onKeyDown={event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (open) { triggers.current.get(open)?.focus(); setOpen(null) }
      else if (mobileOpen) { setMobileOpen(false); toggle.current?.focus() }
    }
  }}>
    <button className="grouped-navigation__toggle" ref={toggle} type="button" aria-expanded={mobileOpen} aria-controls={id} onClick={() => { setMobileOpen(value => !value); setOpen(null) }}>{mobileOpen ? 'Cerrar menú' : 'Menú'}</button>
    <nav id={id} className="grouped-navigation__list" data-open={mobileOpen} aria-label={label}>
      {groups.map((group, index) => group.items.length === 1 ? <NavLink key={group.label} to={group.items[0].href} end={group.items[0].href === '/app' || group.items[0].href === '/portal'} onClick={close} className={({isActive})=>isActive?'is-active':undefined}>{group.items[0].label}</NavLink> : <div className="navigation-group" key={group.label}>
        <button ref={node => { if(node) triggers.current.set(group.label,node);else triggers.current.delete(group.label) }} type="button" aria-expanded={open === group.label} aria-controls={`${id}-${index}`} className={group.items.some(item=>active(item.href))?'is-active':undefined} onClick={()=>setOpen(current=>current===group.label?null:group.label)} onKeyDown={event=>{
          if(event.key==='ArrowDown') { event.preventDefault();setOpen(group.label);requestAnimationFrame(()=>document.getElementById(`${id}-${index}`)?.querySelector<HTMLAnchorElement>('a')?.focus()) }
        }}>{group.label}<svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m2 4 4 4 4-4" /></svg>{group.items.some(item=>item.href.endsWith('/notifications'))?notificationBadge:null}</button>
        <div id={`${id}-${index}`} className="navigation-group__panel" hidden={open !== group.label}>
          {group.items.map(item=><NavLink key={item.href} to={item.href} onClick={close} className={({isActive})=>isActive?'is-active':undefined}>{item.label}</NavLink>)}
        </div>
      </div>)}
    </nav>
  </div>
}
