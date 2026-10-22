import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router';
import type { ReactNode } from 'react';
import type { StaffUser } from '@kape/shared';
import { staffApi } from '../lib/staff';
import { ApiError, retryRead } from '../lib/api';
import { AsyncState } from './AsyncState';
import { CafeShell } from './CafeShell';

export function StaffGate({
  role,
  children,
}: {
  role: 'admin' | 'kitchen';
  children: (user: StaffUser) => ReactNode;
}) {
  const session = useQuery({
    queryKey: ['staff', 'me'],
    queryFn: staffApi.me,
    retry: retryRead,
    refetchInterval: 60000,
  });
  if (session.error instanceof ApiError && session.error.status === 401)
    return <Navigate replace to={'/login?role=' + role} />;
  if (session.isPending)
    return (
      <CafeShell>
        <main id="main">
          <AsyncState loading />
        </main>
      </CafeShell>
    );
  if (session.isError || !session.data)
    return (
      <CafeShell>
        <main id="main">
          <AsyncState
            error={session.error}
            onRetry={() => {
              void session.refetch();
            }}
          />
        </main>
      </CafeShell>
    );
  if (role === 'admin' && session.data.role !== 'admin')
    return (
      <CafeShell>
        <main id="main" className="state-panel">
          <h1>Admin access required</h1>
          <p>This account can use the kitchen board.</p>
          <Link className="button" to="/login?role=admin">
            Sign in as admin
          </Link>
        </main>
      </CafeShell>
    );
  return children(session.data);
}
