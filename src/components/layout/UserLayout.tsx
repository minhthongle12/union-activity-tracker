import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  ClipboardList,
  FolderOpen,
  Award,
  Trophy,
  Bell,
  User,
  Menu,
  X,
  LogOut,
  Building,
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
  { to: "/user", icon: LayoutDashboard, label: "Tổng quan", end: true },
  { to: "/user/criteria", icon: ClipboardList, label: "Bộ tiêu chí đánh giá" },
  { to: "/user/evidence", icon: FolderOpen, label: "Kho minh chứng" },
  { to: "/user/bonus", icon: Award, label: "Điểm cộng" },
  { to: "/user/results", icon: Trophy, label: "Kết quả đánh giá" },
  { to: "/user/notifications", icon: Bell, label: "Thông báo" },
  { to: "/user/account", icon: User, label: "Tài khoản" },
];

export function UserLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  const { data: unreadCount } = useQuery({
    queryKey: ["unread_notifications_user", profile?.id],
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
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow">
              Đ
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm tracking-wide text-white leading-tight">
                ĐOÀN CƠ SỞ
              </span>
              <span className="text-[10px] text-slate-400">Đánh giá & Minh chứng</span>
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
            Menu Đoàn viên
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
              <AvatarFallback className="bg-blue-900 text-xs font-medium text-blue-200">
                {profile?.display_name ? profile.display_name.slice(0, 2).toUpperCase() : "ĐS"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {profile?.display_name || "Đoàn cơ sở"}
              </p>
              <Badge variant="outline" className="text-[10px] py-0 px-1 border-slate-700 text-blue-300">
                <Building className="h-3 w-3 mr-0.5 inline" /> Đơn vị
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
            <NavLink to="/user/notifications">
              <Button variant="ghost" size="icon" className="relative text-slate-600 hover:text-slate-900">
                <Bell className="h-5 w-5" />
                {(unreadCount ?? 0) > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white shadow-xs">
                    {unreadCount! > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Button>
            </NavLink>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 pl-2 pr-3 h-9">
                  <Avatar className="h-7 w-7 bg-blue-700 text-white text-xs">
                    <AvatarFallback className="bg-blue-700 text-white">
                      {profile?.display_name ? profile.display_name.slice(0, 2).toUpperCase() : "ĐS"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-slate-700 hidden sm:inline">
                    {profile?.display_name || "Đoàn cơ sở"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Tài khoản Đơn vị</DropdownMenuLabel>
                <div className="px-2 py-1 text-xs text-muted-foreground">
                  @{profile?.username || "user"}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/user/account")}>
                  <User className="h-4 w-4 mr-2" />
                  Hồ sơ tài khoản
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
export default UserLayout;

