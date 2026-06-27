import { Outlet, NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Link2,
  CreditCard,
  Settings,
  LogOut,
  Plus,
  Scissors,
} from 'lucide-react'
import keycloak from '../lib/keycloak'
import type { KeycloakTokenParsed } from 'keycloak-js'

type ParsedToken = KeycloakTokenParsed & {
  name?: string
  given_name?: string
  family_name?: string
  preferred_username?: string
  email?: string
}

function getInitials(parsed: ParsedToken | undefined): string {
  if (!parsed) return '?'
  const g = parsed.given_name
  const f = parsed.family_name
  if (g && f) return (g[0] + f[0]).toUpperCase()
  const u = parsed.preferred_username ?? parsed.name
  return u ? u.slice(0, 2).toUpperCase() : '?'
}

const sidebarNavItems = [
  { to: '/', end: true,  icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { to: '/customers',    icon: <Users size={18} />,           label: 'Customers' },
  { to: '/strings',      icon: <Link2 size={18} />,           label: 'Strings' },
  { to: '/payments',     icon: <CreditCard size={18} />,      label: 'Payments' },
  { to: '/settings',     icon: <Settings size={18} />,        label: 'Settings' },
]

const mobileNavItems = [
  { to: '/', end: true,  icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
  { to: '/customers',    icon: <Users size={20} />,           label: 'Customers' },
  { to: '/jobs/new',     icon: <Plus size={20} />,            label: 'New Job' },
  { to: '/payments',     icon: <CreditCard size={20} />,      label: 'Payments' },
  { to: '/settings',     icon: <Settings size={20} />,        label: 'Settings' },
]

export default function AppShell() {
  const parsed = keycloak.tokenParsed as ParsedToken | undefined
  const displayName = parsed?.name ?? parsed?.preferred_username ?? 'Stringer'
  const email = parsed?.email
  const initials = getInitials(parsed)

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <Scissors size={16} />
          </div>
          <span className="sidebar-brand-name">StringPro</span>
        </div>

        <nav className="sidebar-nav">
          {sidebarNavItems.map(({ to, end, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              {icon}
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{displayName}</div>
              {email && <div className="sidebar-user-email">{email}</div>}
            </div>
            <button
              className="sidebar-logout"
              onClick={() => keycloak.logout()}
              title="Log out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      <nav className="mobile-nav">
        <div className="mobile-nav-inner">
          {mobileNavItems.map(({ to, end, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}
            >
              {icon}
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
