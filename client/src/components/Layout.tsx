import { useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type CurrentUser } from '../lib/api';

const nav = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <path d="M5 13h6V5H5v8Zm0 6h6v-4H5v4Zm8 0h6v-8h-6v8Zm0-14v4h6V5h-6Z" />
    ),
  },
  {
    to: '/leads',
    label: 'Leads',
    icon: (
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.31 0-6 1.57-6 3.5V19h12v-1.5c0-1.93-2.69-3.5-6-3.5Zm7-2V9h-3V7h3V4h2v3h3v2h-3v3h-2Z" />
    ),
  },
  {
    to: '/jobs',
    label: 'My Jobs',
    icon: (
      <path d="M7 3h10v4h4v14H3V3h4Zm2 2H5v14h14V9h-6V5H9Zm6 .83V7h1.17L15 5.83ZM7 11h10v2H7v-2Zm0 4h7v2H7v-2Z" />
    ),
  },
  {
    to: '/emails',
    label: 'Emails',
    requiresEmailConfig: true,
    icon: (
      <path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm0 2v.23l8 4.8 8-4.8V8H4Zm16 8V10.56l-7.48 4.49a1 1 0 0 1-1.04 0L4 10.56V16h16Z" />
    ),
  },
  {
    to: '/account',
    label: 'Account',
    icon: (
      <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />
    ),
  },
  {
    to: '/admin',
    label: 'Admin',
    adminOnly: true,
    icon: (
      <path d="M12 2 4 5v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V5l-8-3Zm0 2.18L18 6.43V11c0 4.32-2.75 8.22-6 9.69C8.75 19.22 6 15.32 6 11V6.43l6-2.25Zm-1 4.82h2v6h-2V9Zm0 8h2v2h-2v-2Z" />
    ),
  },
  {
    to: '/logs',
    label: 'Logs',
    adminOnly: true,
    icon: (
      <path d="M4 4h16v2H4V4Zm0 4h10v2H4V8Zm0 4h16v2H4v-2Zm0 4h10v2H4v-2Zm13-8h3v2h-3V8Zm0 8h3v2h-3v-2Z" />
    ),
  },
];

export function Layout({
  children,
  user,
}: {
  children: ReactNode;
  user: CurrentUser;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      qc.clear();
      navigate('/login');
    },
  });

  return (
    <div className="coreui-shell">
      <aside className={`coreui-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="coreui-sidebar-header">
          <div className="flex items-center gap-3 min-w-0">
            <Logo className="w-8 h-8 text-white/95 shrink-0" />
            <div className="min-w-0">
              <span className="block text-sm font-semibold tracking-tight text-white truncate">Lead Panel</span>
              <span className="block text-[11px] text-white/50 truncate">SaaS workspace</span>
            </div>
          </div>
          <button
            className="lg:hidden text-white/70 hover:text-white"
            type="button"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            ×
          </button>
        </div>
        <nav className="coreui-sidebar-nav">
          <div className="coreui-nav-title">Operations</div>
          {nav.filter((item) => {
            if (item.adminOnly && user.role !== 'admin') return false;
            if (item.requiresEmailConfig && !user.hasEmailConfig) return false;
            return true;
          }).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `coreui-nav-link ${isActive || (item.to === '/dashboard' && location.pathname === '/') ? 'is-active' : ''}`
              }
            >
              <Icon>{item.icon}</Icon>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="coreui-sidebar-footer">
          <div className="flex items-center gap-2 min-w-0">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white">
              {(user.name ?? user.email).slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-white/90 text-sm">{user.name ?? user.email}</div>
              <div className="text-white/45 truncate text-xs">{user.role} · {user.email}</div>
            </div>
          </div>
          <button
            onClick={() => logout.mutate()}
            className="mt-3 w-full rounded-md border border-white/10 px-3 py-2 text-left text-xs text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            disabled={logout.isPending}
            data-testid="button-logout"
          >
            {logout.isPending ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </aside>
      {sidebarOpen ? <button className="coreui-sidebar-backdrop" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} /> : null}
      <div className="coreui-wrapper">
        <header className="coreui-topbar">
          <div className="flex items-center gap-3">
            <button
              className="coreui-icon-button lg:hidden"
              type="button"
              aria-label="Open sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="block h-0.5 w-5 bg-current" />
              <span className="block h-0.5 w-5 bg-current" />
              <span className="block h-0.5 w-5 bg-current" />
            </button>
            <div>
              <div className="text-sm font-semibold text-ink-900 dark:text-ink-100">Admin workspace</div>
              <div className="text-xs text-ink-500 dark:text-ink-400">Lead enrichment, demo generation, deployment</div>
            </div>
          </div>
        </header>
        <main className="coreui-main">{children}</main>
      </div>
    </div>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="coreui-nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      {children}
    </svg>
  );
}

function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-label="Lead Panel logo" fill="none" className={className}>
      <rect x="0.5" y="0.5" width="31" height="31" rx="6" stroke="currentColor" />
      <path d="M9 22V10h3v9h7v3z" fill="currentColor" />
    </svg>
  );
}
