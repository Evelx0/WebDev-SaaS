import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AdminUser } from '../lib/api';
import { PageHeader } from '../components/PageHeader';

export function AdminPage() {
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get<AdminUser[]>('/admin/users'),
  });
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [limit, setLimit] = useState(3);

  const createUser = useMutation({
    mutationFn: () =>
      api.post<AdminUser>('/admin/users', {
        email,
        name: name || null,
        password,
        role,
        usageLimitPer24h: limit,
      }),
    onSuccess: () => {
      setEmail('');
      setName('');
      setPassword('');
      setRole('user');
      setLimit(3);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  const updateUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch<AdminUser>(`/admin/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Admin" subtitle="Create paid-user logins, manage access, and adjust generation allowances." />
      <div className="coreui-page">
        <section className="card overflow-hidden">
          <div className="coreui-card-header">
            <div>
              <h2 className="coreui-card-title">Create user</h2>
              <p className="coreui-card-subtitle">Users can only see their own leads, jobs, generated sites, and pitches.</p>
            </div>
          </div>
          <div className="p-5 grid gap-4 lg:grid-cols-[1fr_1fr_1fr_160px_160px_auto]">
            <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="input" type="password" placeholder="Temporary password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'user')}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <input className="input" type="number" min={0} max={100} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
            <button className="btn-primary" disabled={createUser.isPending} onClick={() => createUser.mutate()}>
              {createUser.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
          {createUser.isError ? <div className="px-5 pb-5 text-sm text-red-600 dark:text-red-400">{(createUser.error as Error).message}</div> : null}
        </section>

        <section className="card overflow-hidden">
          <div className="coreui-card-header">
            <div>
              <h2 className="coreui-card-title">Users</h2>
              <p className="coreui-card-subtitle">Usage limits apply only when a normal user has not supplied their own OpenRouter key. Admins are uncapped.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="coreui-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Active</th>
                  <th>24h limit</th>
                  <th>Vercel</th>
                  <th>OpenRouter</th>
                  <th>Leads</th>
                </tr>
              </thead>
              <tbody>
                {users.data?.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="font-medium text-ink-900 dark:text-ink-100">{user.email}</div>
                      <div className="text-xs text-ink-500 dark:text-ink-400">{user.name ?? 'No name'}</div>
                    </td>
                    <td>
                      <select className="input min-w-28" value={user.role} onChange={(e) => updateUser.mutate({ id: user.id, body: { role: e.target.value } })}>
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      <input type="checkbox" checked={user.isActive} onChange={(e) => updateUser.mutate({ id: user.id, body: { isActive: e.target.checked } })} />
                    </td>
                    <td>
                      <input
                        className="input w-24"
                        type="number"
                        min={0}
                        max={100}
                        value={user.usageLimitPer24h}
                        onChange={(e) => updateUser.mutate({ id: user.id, body: { usageLimitPer24h: Number(e.target.value) } })}
                      />
                    </td>
                    <td>
                      <span className={user.hasVercelConfig ? 'text-accent-700 dark:text-accent-400' : 'text-amber-700 dark:text-amber-400'}>
                        {user.hasVercelConfig ? 'Configured' : 'Missing'}
                      </span>
                      <div className="text-xs text-ink-500 dark:text-ink-400">{user.vercelProjectPrefix ?? '-'}</div>
                    </td>
                    <td>
                      <span className={user.hasOpenRouterKey || user.role === 'admin' ? 'text-accent-700 dark:text-accent-400' : 'text-ink-500 dark:text-ink-400'}>
                        {user.role === 'admin' ? 'Platform' : user.hasOpenRouterKey ? 'User key' : 'Platform capped'}
                      </span>
                    </td>
                    <td>{user.leadCount}</td>
                  </tr>
                ))}
                {users.data?.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-ink-500 dark:text-ink-400">No users found.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
