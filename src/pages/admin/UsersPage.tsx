import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Profile, Organization, UserRole } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Search,
  Pencil,
  Users,
  KeyRound,
  Loader2,
  ShieldCheck,
  Building,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================
// Data fetching
// ============================================================

async function fetchProfiles(): Promise<(Profile & { organization?: Organization | null })[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*, organization:organizations(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as (Profile & { organization?: Organization | null })[];
}

async function fetchOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Organization[];
}

// ============================================================
// Component
// ============================================================

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterOrg, setFilterOrg] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState("");

  // Form
  const [form, setForm] = useState({
    username: "",
    password: "",
    display_name: "",
    role: "user" as UserRole,
    organization_id: "",
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: fetchProfiles,
  });

  const { data: orgs } = useQuery({
    queryKey: ["organizations-active"],
    queryFn: fetchOrganizations,
  });

  // Create user mutation
  const createMutation = useMutation({
    mutationFn: async (values: typeof form) => {
      // 1. Create auth user via Supabase Admin (this would ideally be an Edge Function)
      //    For now, create with email pattern
      const email = `${values.username.trim().toLowerCase()}@union.internal`;
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: values.password,
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error("Không thể tạo tài khoản");

      // 2. Create profile
      const { error: profileError } = await supabase.from("profiles").insert({
        id: authData.user.id,
        username: values.username.trim().toLowerCase(),
        display_name: values.display_name.trim(),
        role: values.role,
        organization_id: values.role === "user" ? values.organization_id : null,
      });
      if (profileError) throw profileError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Đã tạo tài khoản mới");
      closeDialog();
    },
    onError: (err: Error) => {
      toast.error("Lỗi: " + err.message);
    },
  });

  // Toggle active
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Đã cập nhật trạng thái");
    },
    onError: (err: Error) => toast.error("Lỗi: " + err.message),
  });

  // Reset password (would normally use an Edge Function)
  const resetMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      // This requires admin privileges via Edge Function in production
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        password,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Đã đặt lại mật khẩu");
      setResetDialogOpen(false);
      setNewPassword("");
    },
    onError: (err: Error) => toast.error("Lỗi: " + err.message),
  });

  function openCreate() {
    setForm({ username: "", password: "", display_name: "", role: "user", organization_id: "" });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
  }

  function openResetPassword(user: Profile) {
    setSelectedUser(user);
    setNewPassword("");
    setResetDialogOpen(true);
  }

  function handleCreate() {
    if (!form.username.trim() || !form.password || !form.display_name.trim()) {
      toast.error("Vui lòng điền đầy đủ thông tin bắt buộc.");
      return;
    }
    if (form.role === "user" && !form.organization_id) {
      toast.error("Người dùng phải thuộc một đơn vị.");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }
    createMutation.mutate(form);
  }

  // Filter
  const filtered = (users ?? []).filter((u) => {
    const q = search.toLowerCase();
    const matchesSearch =
      u.username.toLowerCase().includes(q) ||
      u.display_name.toLowerCase().includes(q);
    const matchesRole = filterRole === "all" || u.role === filterRole;
    const matchesOrg =
      filterOrg === "all" ||
      u.organization_id === filterOrg ||
      (filterOrg === "none" && !u.organization_id);
    return matchesSearch && matchesRole && matchesOrg;
  });

  const roleLabel = (role: UserRole) =>
    role === "admin" ? "Quản trị viên" : "Đoàn cơ sở";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quản lý tài khoản</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quản lý tài khoản người dùng trong hệ thống
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Thêm tài khoản
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên đăng nhập hoặc họ tên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Vai trò" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả vai trò</SelectItem>
            <SelectItem value="admin">Quản trị viên</SelectItem>
            <SelectItem value="user">Đoàn cơ sở</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterOrg} onValueChange={setFilterOrg}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Đơn vị" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả đơn vị</SelectItem>
            <SelectItem value="none">Không có đơn vị</SelectItem>
            {(orgs ?? []).map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Danh sách tài khoản ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {usersLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 text-slate-200" />
              {search || filterRole !== "all" || filterOrg !== "all"
                ? "Không tìm thấy tài khoản phù hợp."
                : "Chưa có tài khoản nào."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên đăng nhập</TableHead>
                    <TableHead>Họ tên</TableHead>
                    <TableHead className="hidden md:table-cell">Đơn vị</TableHead>
                    <TableHead>Vai trò</TableHead>
                    <TableHead className="w-[120px]">Trạng thái</TableHead>
                    <TableHead className="w-[100px] text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-mono text-xs">@{user.username}</TableCell>
                      <TableCell className="font-medium">{user.display_name}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {(user as any).organization?.name || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.role === "admin" ? "default" : "outline"}
                          className="text-xs"
                        >
                          {user.role === "admin" ? (
                            <><ShieldCheck className="h-3 w-3 mr-1" />{roleLabel(user.role)}</>
                          ) : (
                            <><Building className="h-3 w-3 mr-1" />{roleLabel(user.role)}</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={user.is_active}
                            onCheckedChange={(checked) =>
                              toggleMutation.mutate({ id: user.id, is_active: checked })
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            {user.is_active ? "Hoạt động" : "Khóa"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openResetPassword(user)}
                            title="Đặt lại mật khẩu"
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Thêm tài khoản mới</DialogTitle>
            <DialogDescription>
              Tạo tài khoản người dùng mới cho hệ thống.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">
                Tên đăng nhập <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="VD: doancoso01"
                className="col-span-3"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">
                Mật khẩu <span className="text-red-500">*</span>
              </Label>
              <Input
                type="password"
                placeholder="Tối thiểu 6 ký tự"
                className="col-span-3"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">
                Họ tên <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="Họ và tên hiển thị"
                className="col-span-3"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Vai trò</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as UserRole })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Đoàn cơ sở</SelectItem>
                  <SelectItem value="admin">Quản trị viên</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role === "user" && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">
                  Đơn vị <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={form.organization_id}
                  onValueChange={(v) => setForm({ ...form, organization_id: v })}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Chọn đơn vị" />
                  </SelectTrigger>
                  <SelectContent>
                    {(orgs ?? []).map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.code} – {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Hủy
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Tạo tài khoản
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={(open) => !open && setResetDialogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Đặt lại mật khẩu</DialogTitle>
            <DialogDescription>
              Đặt mật khẩu mới cho tài khoản{" "}
              <span className="font-semibold">@{selectedUser?.username}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Label>Mật khẩu mới</Label>
            <Input
              type="password"
              placeholder="Tối thiểu 6 ký tự"
              className="mt-2"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={() => {
                if (!selectedUser || newPassword.length < 6) {
                  toast.error("Mật khẩu phải có ít nhất 6 ký tự.");
                  return;
                }
                resetMutation.mutate({ userId: selectedUser.id, password: newPassword });
              }}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
