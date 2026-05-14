import { Navigate, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type CurrentUser } from './lib/api';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { LeadsPage } from './pages/LeadsPage';
import { AddLeadPage } from './pages/AddLeadPage';
import { LeadDetailPage } from './pages/LeadDetailPage';
import { JobsPage } from './pages/JobsPage';
import { JobDetailPage } from './pages/JobDetailPage';
import { AccountPage } from './pages/AccountPage';
import { AdminPage } from './pages/AdminPage';
import { LogsPage } from './pages/LogsPage';
import { EmailsPage } from './pages/EmailsPage';

function useMe() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<CurrentUser>('/auth/me'),
    retry: false,
  });
}

function ProtectedShell({
  children,
  adminOnly = false,
  emailOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
  emailOnly?: boolean;
}) {
  const me = useMe();
  if (me.isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-ink-500 text-sm">
        Loading...
      </div>
    );
  }
  if (me.isError || !me.data) return <Navigate to="/login" replace />;
  if (adminOnly && me.data.role !== 'admin') return <Navigate to="/dashboard" replace />;
  if (emailOnly && !me.data.hasEmailConfig) return <Navigate to="/account" replace />;
  return <Layout user={me.data}>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/account"
        element={
          <ProtectedShell>
            <AccountPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/emails"
        element={
          <ProtectedShell emailOnly>
            <EmailsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedShell adminOnly>
            <AdminPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/logs"
        element={
          <ProtectedShell adminOnly>
            <LogsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedShell>
            <Navigate to="/dashboard" replace />
          </ProtectedShell>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedShell>
            <DashboardPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/leads"
        element={
          <ProtectedShell>
            <LeadsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/leads/new"
        element={
          <ProtectedShell>
            <AddLeadPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/leads/:leadId"
        element={
          <ProtectedShell>
            <LeadDetailPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/jobs"
        element={
          <ProtectedShell>
            <JobsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/jobs/:jobId"
        element={
          <ProtectedShell>
            <JobDetailPage />
          </ProtectedShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
