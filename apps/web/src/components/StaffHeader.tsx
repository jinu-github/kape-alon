import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { cafeConfig } from '@kape/shared';
import type { StaffUser } from '@kape/shared';
import { staffApi } from '../lib/staff';

export function StaffHeader({ user }: { user: StaffUser }) {
  const cache = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: staffApi.logout,
    onSuccess: () => {
      cache.removeQueries({ queryKey: ['staff'] });
      navigate('/');
    },
  });
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="demo-banner">Demo site with sample data</div>
      <header className="staff-header">
        <Link className="brand" to="/">
          <span className="brand-symbol" aria-hidden="true">
            ≈
          </span>
          {cafeConfig.name}
        </Link>
        <nav aria-label="Staff navigation">
          <Link to="/kitchen">Kitchen</Link>
          {user.role === 'admin' && <Link to="/admin">Admin</Link>}
          <span className="staff-role">{user.role}</span>
          <button
            className="staff-signout"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            {logout.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </nav>
      </header>
      {logout.isError && (
        <p className="error-message" role="alert">
          {logout.error.message}
        </p>
      )}
    </>
  );
}
