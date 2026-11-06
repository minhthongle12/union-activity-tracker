import {
  createBrowserRouter,
  Navigate,
  type RouteObject,
} from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { RouteErrorBoundary } from '@/components/common/RouteErrorBoundary';
import AdminLayout from '@/components/layout/AdminLayout';
import UserLayout from '@/components/layout/UserLayout';

// ============================================================
// Loading fallback
// ============================================================

function PageLoading() {
  return (
    <div className="flex h-64 w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </div>
    </div>
  );
}

function lazyPage(importFn: () => Promise<{ default: React.ComponentType }>) {
  const Component = lazy(async () => {
    try {
      return await importFn();
    } catch (error: any) {
      const msg = error?.message || '';
      const isDynamicImportError =
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('error loading dynamically imported module') ||
        msg.includes('Importing a module script failed') ||
        error?.name === 'ChunkLoadError';

      if (isDynamicImportError) {
        const lastReload = sessionStorage.getItem('chunk_reload_timestamp');
        const now = Date.now();
        // Auto reload if not reloaded within last 10s to get new build chunks
        if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
          sessionStorage.setItem('chunk_reload_timestamp', now.toString());
          window.location.reload();
          return new Promise<{ default: React.ComponentType }>(() => {});
        }
      }
      throw error;
    }
  });

  return (
    <Suspense fallback={<PageLoading />}>
      <Component />
    </Suspense>
  );
}

// ============================================================
// Lazy page imports
// ============================================================

const LoginPage = () => lazyPage(() => import('@/pages/LoginPage'));

// Admin pages
const AdminDashboard = () => lazyPage(() => import('@/pages/admin/DashboardPage'));
const AdminOrganizations = () => lazyPage(() => import('@/pages/admin/OrganizationsPage'));
const AdminUsers = () => lazyPage(() => import('@/pages/admin/UsersPage'));
const AdminPeriods = () => lazyPage(() => import('@/pages/admin/PeriodsPage'));
const AdminCriteria = () => lazyPage(() => import('@/pages/admin/CriteriaPage'));
const AdminImportExport = () => lazyPage(() => import('@/pages/admin/ImportExportPage'));
const AdminReview = () => lazyPage(() => import('@/pages/admin/ReviewPage'));
const AdminBonus = () => lazyPage(() => import('@/pages/admin/BonusPage'));
const AdminReports = () => lazyPage(() => import('@/pages/admin/ReportsPage'));
const AdminNotifications = () => lazyPage(() => import('@/pages/admin/NotificationsPage'));
const AdminAuditLogs = () => lazyPage(() => import('@/pages/admin/AuditLogsPage'));
const AdminSettings = () => lazyPage(() => import('@/pages/admin/SettingsPage'));

// User pages
const UserDashboard = () => lazyPage(() => import('@/pages/user/DashboardPage'));
const UserCriteria = () => lazyPage(() => import('@/pages/user/CriteriaPage'));
const UserEvidence = () => lazyPage(() => import('@/pages/user/EvidencePage'));
const UserBonus = () => lazyPage(() => import('@/pages/user/BonusPage'));
const UserResults = () => lazyPage(() => import('@/pages/user/ResultsPage'));
const UserNotifications = () => lazyPage(() => import('@/pages/user/NotificationsPage'));
const UserAccount = () => lazyPage(() => import('@/pages/user/AccountPage'));

// Root redirect
const RootRedirect = () => lazyPage(() => import('@/pages/RootRedirect'));

// ============================================================
// Route configuration
// ============================================================

const routes: RouteObject[] = [
  {
    path: '/login',
    element: <LoginPage />,
    errorElement: <RouteErrorBoundary />,
  },

  // ── Admin routes ──
  {
    path: '/admin',
    element: (
      <ProtectedRoute requiredRole="admin">
        <AdminLayout />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <AdminDashboard /> },
      { path: 'organizations', element: <AdminOrganizations /> },
      { path: 'users', element: <AdminUsers /> },
      { path: 'periods', element: <AdminPeriods /> },
      { path: 'criteria', element: <AdminCriteria /> },
      { path: 'import-export', element: <AdminImportExport /> },
      { path: 'review', element: <AdminReview /> },
      { path: 'bonus', element: <AdminBonus /> },
      { path: 'reports', element: <AdminReports /> },
      { path: 'notifications', element: <AdminNotifications /> },
      { path: 'audit-logs', element: <AdminAuditLogs /> },
      { path: 'settings', element: <AdminSettings /> },
    ],
  },

  // ── User routes ──
  {
    path: '/user',
    element: (
      <ProtectedRoute>
        <UserLayout />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <UserDashboard /> },
      { path: 'criteria', element: <UserCriteria /> },
      { path: 'evidence', element: <UserEvidence /> },
      { path: 'bonus', element: <UserBonus /> },
      { path: 'results', element: <UserResults /> },
      { path: 'notifications', element: <UserNotifications /> },
      { path: 'account', element: <UserAccount /> },
    ],
  },

  // ── Root redirect ──
  {
    path: '/',
    element: <RootRedirect />,
    errorElement: <RouteErrorBoundary />,
  },

  // ── Catch-all ──
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
];

export const router = createBrowserRouter(routes);
