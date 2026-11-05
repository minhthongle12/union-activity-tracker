import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types/database';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Nếu chỉ định, chỉ cho phép role cụ thể truy cập */
  requiredRole?: UserRole;
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { session, profile, isLoading } = useAuth();

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    );
  }

  // ── Not authenticated ──
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // ── Role check ──
  if (requiredRole && profile?.role !== requiredRole) {
    // Redirect user to their appropriate dashboard
    const fallback = profile?.role === 'admin' ? '/admin' : '/user';
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
