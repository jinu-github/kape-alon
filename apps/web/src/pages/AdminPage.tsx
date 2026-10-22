import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { StaffGate } from '../components/StaffGate';
import { StaffHeader } from '../components/StaffHeader';
import { AsyncState } from '../components/AsyncState';
import { staffApi } from '../lib/staff';
import { retryRead } from '../lib/api';
import type { StaffUser } from '@kape/shared';
export function AdminPage() {
  return (
    <StaffGate role="admin">{(user) => <AdminEntry user={user} />}</StaffGate>
  );
}
function AdminEntry({ user }: { user: StaffUser }) {
  const access = useQuery({
    queryKey: ['staff', 'admin-access'],
    queryFn: staffApi.admin,
    retry: retryRead,
  });
  return (
    <>
      <StaffHeader user={user} />
      <main id="main" className="state-panel">
        {access.isPending ? (
          <AsyncState loading />
        ) : access.isError ? (
          <AsyncState
            error={access.error}
            onRetry={() => {
              void access.refetch();
            }}
          />
        ) : (
          <>
            <p className="eyebrow">ADMIN ACCESS CONFIRMED</p>
            <h1>You’re signed in.</h1>
            <p>
              Menu management, order history, dashboard and QR codes are planned
              for the next phase. You can use the kitchen board now.
            </p>
            <Link className="button" to="/kitchen">
              Open kitchen board
            </Link>
          </>
        )}
      </main>
    </>
  );
}
