import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="container page muted">Loading…</div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (user.role !== 'customer') {
    return (
      <div className="container page narrow">
        <h1>This site is for customers</h1>
        <p className="muted">You're signed in with a {user.role} account. Washers use the Sparkle Wash Pro app; admins use the admin dashboard.</p>
      </div>
    );
  }
  return <>{children}</>;
}
