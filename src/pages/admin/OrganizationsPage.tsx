import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Organization, OrganizationInsert } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Building2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================
// Data fetching
// ============================================================

async function fetchOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Organization[];
}

// ============================================================
// Component
// ============================================================

export default function OrganizationsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);

  // Form state
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    contact_name: "",
    contact_phone: "",
  });

  const { data: orgs, isLoading } = useQuery({
    queryKey: ["organizations"],
    queryFn: fetchOrganizations,
  });

  // Create / Update mutation
  const saveMutation = useMutation({
    mutationFn: async (values: OrganizationInsert & { id?: string }) => {
      if (editing) {
        const { error } = await supabase
          .from("organizations")
          .update({
            code: values.code,
            name: values.name,
            description: values.description || null,
            contact_name: values.contact_name || null,
            contact_phone: values.contact_phone || null,
          })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("organizations").insert({
          code: values.code,
          name: values.name,
          description: values.description || null,
          contact_name: values.contact_name || null,
          contact_phone: values.contact_phone || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success(editing ? "Đã cập nhật đơn vị" : "Đã thêm đơn vị mới");
      closeDialog();
    },
    onError: (err: Error) => {
      toast.error("Lỗi: " + err.message);
    },
  });

  // Toggle active status
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("organizations")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("Đã cập nhật trạng thái");
    },
    onError: (err: Error) => {
      toast.error("Lỗi: " + err.message);
    },
  });

  function openCreate() {
    setEditing(null);
    setForm({ code: "", name: "", description: "", contact_name: "", contact_phone: "" });
    setDialogOpen(true);
  }

  function openEdit(org: Organization) {
    setEditing(org);
    setForm({
      code: org.code || "",
      name: org.name,
      description: org.description || "",
      contact_name: org.contact_name || "",
      contact_phone: org.contact_phone || "",
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
  }

  function handleSave() {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Vui lòng nhập mã và tên đơn vị.");
      return;
    }
    saveMutation.mutate(form);
  }

  // Filter
  const filtered = (orgs ?? []).filter((o) => {
    const q = search.toLowerCase();
    return (
      o.name.toLowerCase().includes(q) ||
      (o.code?.toLowerCase().includes(q) ?? false) ||
      (o.contact_name?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quản lý đơn vị</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quản lý danh sách các Đoàn cơ sở tham gia đánh giá
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Thêm đơn vị
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Tìm kiếm đơn vị..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Danh sách đơn vị ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-3 text-slate-200" />
              {search
                ? "Không tìm thấy đơn vị phù hợp."
                : "Chưa có đơn vị nào. Nhấn \"Thêm đơn vị\" để bắt đầu."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Mã</TableHead>
                    <TableHead>Tên đơn vị</TableHead>
                    <TableHead className="hidden md:table-cell">Liên hệ</TableHead>
                    <TableHead className="hidden md:table-cell">SĐT</TableHead>
                    <TableHead className="w-[100px]">Trạng thái</TableHead>
                    <TableHead className="w-[80px] text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell className="font-mono text-xs">{org.code}</TableCell>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {org.contact_name || "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {org.contact_phone || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={org.is_active}
                            onCheckedChange={(checked) =>
                              toggleMutation.mutate({ id: org.id, is_active: checked })
                            }
                          />
                          <Badge variant={org.is_active ? "default" : "secondary"} className="text-xs">
                            {org.is_active ? "Hoạt động" : "Tạm khóa"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(org)}
                          title="Chỉnh sửa"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Chỉnh sửa đơn vị" : "Thêm đơn vị mới"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Cập nhật thông tin đơn vị Đoàn cơ sở."
                : "Nhập thông tin đơn vị Đoàn cơ sở mới."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="org-code" className="text-right">
                Mã <span className="text-red-500">*</span>
              </Label>
              <Input
                id="org-code"
                placeholder="VD: DCS01"
                className="col-span-3"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="org-name" className="text-right">
                Tên <span className="text-red-500">*</span>
              </Label>
              <Input
                id="org-name"
                placeholder="Tên đơn vị Đoàn cơ sở"
                className="col-span-3"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="org-desc" className="text-right pt-2">
                Mô tả
              </Label>
              <Textarea
                id="org-desc"
                placeholder="Mô tả đơn vị (tùy chọn)"
                className="col-span-3"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="org-contact" className="text-right">
                Liên hệ
              </Label>
              <Input
                id="org-contact"
                placeholder="Họ tên người liên hệ"
                className="col-span-3"
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="org-phone" className="text-right">
                SĐT
              </Label>
              <Input
                id="org-phone"
                placeholder="Số điện thoại"
                className="col-span-3"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Hủy
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Cập nhật" : "Thêm mới"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
