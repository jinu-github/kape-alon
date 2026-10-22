import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CafeShell } from '../components/CafeShell';
import { staffApi } from '../lib/staff';
import { ApiError } from '../lib/api';

export function LoginPage() {
  const [params] = useSearchParams();
  const role = params.get('role') === 'admin' ? 'admin' : 'kitchen';
  return <LoginForm key={role} role={role} />;
}
function LoginForm({ role }: { role: 'admin' | 'kitchen' }) {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const demo = useQuery({
    queryKey: ['demo-access', role],
    queryFn: () => staffApi.demo(role),
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (demo.data) {
      setEmail(demo.data.email);
      setPassword(demo.data.password);
    }
  }, [demo.data]);
  const login = useMutation({
    mutationFn: async () => {
      await staffApi.login(email, password);
      try {
        return await staffApi.me();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401)
          throw new Error(
            'Your browser did not keep the sign-in cookie. Cross-site cookie blocking may be enabled; the deployed demo may need a same-site API.',
          );
        throw error;
      }
    },
    onSuccess: (user) => {
      cache.removeQueries({ queryKey: ['staff'] });
      cache.setQueryData(['staff', 'me'], user);
      navigate(role === 'admin' ? '/admin' : '/kitchen', { replace: true });
    },
  });
  return (
    <CafeShell>
      <main id="main" className="login-main">
        <p className="eyebrow">BEHIND THE COUNTER</p>
        <h1>{role === 'admin' ? 'Admin sign in' : 'Kitchen sign in'}</h1>
        <p className="muted">A little teamwork. A lot of good coffee.</p>
        <form
          className="login-card"
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate();
          }}
        >
          <p className="fine-print" role="status">
            {demo.isPending
              ? 'Loading the demo login…'
              : demo.data
                ? 'Demo credentials are filled in. Sign in to try the ' +
                  role +
                  ' experience.'
                : 'Enter your staff credentials. Demo autofill is unavailable.'}
          </p>
          {demo.isError && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                void demo.refetch();
              }}
            >
              Retry demo autofill
            </button>
          )}
          <label htmlFor="staff-email">Email</label>
          <input
            id="staff-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label htmlFor="staff-password">Password</label>
          <input
            id="staff-password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            maxLength={72}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {login.isError && (
            <p className="error-message" role="alert">
              {login.error.message}
            </p>
          )}
          <button
            className="button full"
            disabled={login.isPending || !email || !password}
          >
            {login.isPending ? 'Signing in…' : 'Sign in'}
            <span aria-hidden="true">↗</span>
          </button>
        </form>
        <Link className="back-to-menu" to="/">
          ← Back to the cafe
        </Link>
      </main>
    </CafeShell>
  );
}
