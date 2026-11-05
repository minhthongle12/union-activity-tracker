import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  Building2,
  Users,
  Calendar,
  ClipboardList,
  FileSpreadsheet,
  CheckSquare,
  Award,
  BarChart3,
  Bell,
  History,
  Settings,
  Menu,
  X,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Breadcrumbs } from "./Breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/admin", icon: LayoutDashboard, label: "Tổng quan", end: true },
  { to: "/admin/organizations", icon: Building2, label: "Quản lý đơn vị" },
  { to: "/admin/users", icon: Users, label: "Quản lý tài khoản" },
  { to: "/admin/periods", icon: Calendar, label: "Đợt đánh giá" },
  { to: "/admin/criteria", icon: ClipboardList, label: "Bộ tiêu chí" },
  { to: "/admin/import-export", icon: FileSpreadsheet, label: "Import / Export Excel" },
  { to: "/admin/review", icon: CheckSquare, label: "Thẩm định & xác thực" },
  { to: "/admin/bonus", icon: Award, label: "Điểm cộng" },
  { to: "/admin/reports", icon: BarChart3, label: "Báo cáo & thống kê" },
  { to: "/admin/notifications", icon: Bell, label: "Thông báo" },
  { to: "/admin/audit-logs", icon: History, label: "Nhật ký hoạt động" },
  { to: "/admin/settings", icon: Settings, label: "Cài đặt hệ thống" },
];

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  const { data: unreadCount } = useQuery({
    queryKey: ["unread_notifications_admin", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", profile.id)
        .eq("is_read", false);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!profile?.id,
    refetchInterval: 30000,
  });

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-100 flex flex-col transition-transform duration-200 ease-in-out md:static md:translate-x-0 shadow-lg",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-red-600 flex items-center justify-center font-bold text-white shadow">
              Đ
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm tracking-wide text-white leading-tight">
                CÔNG TÁC ĐOÀN
              </span>
              <span className="text-[10px] text-slate-400">Hệ thống Quản lý</span>
            </div>
          </div>
          <button
            className="md:hidden text-slate-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Quản trị hệ thống
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                    isActive
                      ? "bg-slate-800 text-white shadow-sm"
                      : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-white" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </div>

        {/* Sidebar footer user badge */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8 border border-slate-700 bg-slate-800 text-white">
              <AvatarFallback className="bg-slate-800 text-xs font-medium">
                {profile?.display_name ? profile.display_name.slice(0, 2).toUpperCase() : "AD"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {profile?.display_name || "Quản trị viên"}
              </p>
              <Badge variant="outline" className="text-[10px] py-0 px-1 border-slate-700 text-emerald-400">
                <ShieldCheck className="h-3 w-3 mr-0.5 inline" /> Admin
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-400 hover:bg-slate-800 h-8 w-8"
              title="Đăng xuất"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content wrapper */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <Breadcrumbs />
          </div>

          <div className="flex items-center gap-3">
            <NavLink to="/admin/notifications">
              <Button variant="ghost" size="icon" className="relative text-slate-600 hover:text-slate-900">
                <Bell className="h-5 w-5" />
                {(unreadCount ?? 0) > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow-xs">
                    {unreadCount! > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Button>
            </NavLink>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 pl-2 pr-3 h-9">
                  <Avatar className="h-7 w-7 bg-slate-900 text-white text-xs">
                    <AvatarFallback className="bg-slate-800 text-white">
                      {profile?.display_name ? profile.display_name.slice(0, 2).toUpperCase() : "AD"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-slate-700 hidden sm:inline">
                    {profile?.display_name || "Admin"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Tài khoản Quản trị</DropdownMenuLabel>
                <div className="px-2 py-1 text-xs text-muted-foreground">
                  @{profile?.username || "admin"}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/admin/settings")}>
                  <Settings className="h-4 w-4 mr-2" />
                  Cài đặt hệ thống
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="h-4 w-4 mr-2" />
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page body */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
export default AdminLayout;

