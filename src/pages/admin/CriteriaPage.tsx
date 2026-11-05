import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  CriterionLibrary,
  CriteriaCategory,
  CriterionLibraryInsert,
  CriteriaCategoryInsert,
} from "@/types/database";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Search,
  Pencil,
  ClipboardList,
  FolderTree,
  Loader2,
  FileText,
  FileCheck2,
  Globe,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================
// Data Fetchers
// ============================================================

async function fetchCategories(): Promise<CriteriaCategory[]> {
  const { data, error } = await supabase
    .from("criteria_categories")
    .select("*")
    .not("code", "like", "BONUS_%")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CriteriaCategory[];
}

async function fetchCriteria(): Promise<(CriterionLibrary & { category?: CriteriaCategory | null })[]> {
  const { data, error } = await supabase
    .from("criteria_library")
    .select("*, category:criteria_categories(*)")
    .order("code", { ascending: true });
  if (error) throw error;
  return data as (CriterionLibrary & { category?: CriteriaCategory | null })[];
}

// ============================================================
// Main Component
// ============================================================

export default function CriteriaPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"criteria" | "categories">("criteria");

  // Filter & Search
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // Dialog states
  const [criterionDialogOpen, setCriterionDialogOpen] = useState(false);
  const [editingCriterion, setEditingCriterion] = useState<CriterionLibrary | null>(null);

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CriteriaCategory | null>(null);

  // Form states for Criterion
  const [criterionForm, setCriterionForm] = useState({
    code: "",
    title: "",
    category_id: "",
    description: "",
    scoring_guidelines: "",
    max_score: 1,
    req_doc1: true,
    req_doc2: true,
    req_link3: false,
    responsible_unit: "",
    deadline: "",
    sort_order: 1,
    is_active: true,
  });

  // Form states for Category
  const [categoryForm, setCategoryForm] = useState({
    code: "",
    name: "",
    description: "",
    sort_order: 1,
  });

  // Queries
  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ["criteria_categories"],
    queryFn: fetchCategories,
  });

  const { data: criteria, isLoading: criteriaLoading } = useQuery({
    queryKey: ["criteria_library"],
    queryFn: fetchCriteria,
  });

  // ============================================================
  // Criterion Mutations
  // ============================================================

  const saveCriterionMutation = useMutation({
    mutationFn: async (values: typeof criterionForm) => {
      const payload: CriterionLibraryInsert = {
        code: values.code.trim(),
        title: values.title.trim(),
        category_id: values.category_id || null,
        description: values.description || null,
        scoring_guidelines: values.scoring_guidelines || null,
        max_score: Number(values.max_score) || 0,
        req_doc1: values.req_doc1,
        req_doc2: values.req_doc2,
        req_link3: values.req_link3,
        responsible_unit: values.responsible_unit || null,
        deadline: values.deadline ? new Date(values.deadline).toISOString() : null,
        sort_order: Number(values.sort_order) || 0,
        is_active: values.is_active,
      };

      if (editingCriterion) {
        const { error } = await supabase
          .from("criteria_library")
          .update(payload)
          .eq("id", editingCriterion.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("criteria_library").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria_library"] });
      toast.success(editingCriterion ? "Đã cập nhật tiêu chí" : "Đã thêm tiêu chí mới");
      setCriterionDialogOpen(false);
      setEditingCriterion(null);
    },
    onError: (err: Error) => toast.error("Lỗi: " + err.message),
  });

  const toggleCriterionStatus = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("criteria_library")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria_library"] });
      queryClient.invalidateQueries({ queryKey: ["user_period_criteria"] });
      queryClient.invalidateQueries({ queryKey: ["user_master_library_preview"] });
      queryClient.invalidateQueries({ queryKey: ["admin_review_queue"] });
      queryClient.invalidateQueries({ queryKey: ["user_results_criteria"] });
      toast.success("Đã cập nhật trạng thái tiêu chí");
    },
    onError: (err: Error) => toast.error("Lỗi: " + err.message),
  });

  const deleteCriterionMutation = useMutation({
    mutationFn: async (id: string) => {
      // 1. Also clean up any period_criteria referencing this criterion
      await supabase.from("period_criteria").delete().eq("source_criteria_id", id);
      // 2. Delete from criteria_library
      const { error } = await supabase.from("criteria_library").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria_library"] });
      queryClient.invalidateQueries({ queryKey: ["user_period_criteria"] });
      queryClient.invalidateQueries({ queryKey: ["user_master_library_preview"] });
      queryClient.invalidateQueries({ queryKey: ["admin_review_queue"] });
      queryClient.invalidateQueries({ queryKey: ["user_results_criteria"] });
      toast.success("Đã xóa tiêu chí khỏi hệ thống");
    },
    onError: (err: Error) => {
      toast.error("Không thể xóa tiêu chí này. Vui lòng chuyển sang Tạm khóa.");
    },
  });

  // ============================================================
  // Category Mutations
  // ============================================================

  const saveCategoryMutation = useMutation({
    mutationFn: async (values: typeof categoryForm) => {
      const payload: CriteriaCategoryInsert = {
        code: values.code.trim() || null,
        name: values.name.trim(),
        description: values.description || null,
        sort_order: Number(values.sort_order) || 0,
      };

      if (editingCategory) {
        const { error } = await supabase
          .from("criteria_categories")
          .update(payload)
          .eq("id", editingCategory.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("criteria_categories").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria_categories"] });
      queryClient.invalidateQueries({ queryKey: ["criteria_library"] });
      toast.success(editingCategory ? "Đã cập nhật nhóm tiêu chí" : "Đã thêm nhóm tiêu chí mới");
      setCategoryDialogOpen(false);
      setEditingCategory(null);
    },
    onError: (err: Error) => toast.error("Lỗi: " + err.message),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("criteria_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria_categories"] });
      toast.success("Đã xóa nhóm tiêu chí");
    },
    onError: (err: Error) => toast.error("Lỗi: " + err.message),
  });

  // ============================================================
  // Handlers
  // ============================================================

  function openCreateCriterion() {
    setEditingCriterion(null);
    setCriterionForm({
      code: "",
      title: "",
      category_id: categories?.[0]?.id || "",
      description: "",
      scoring_guidelines: "",
      max_score: 1,
      req_doc1: true,
      req_doc2: true,
      req_link3: false,
      responsible_unit: "",
      deadline: "",
      sort_order: (criteria?.length || 0) + 1,
      is_active: true,
    });
    setCriterionDialogOpen(true);
  }

  function openEditCriterion(item: CriterionLibrary) {
    setEditingCriterion(item);
    setCriterionForm({
      code: item.code,
      title: item.title,
      category_id: item.category_id || "",
      description: item.description || "",
      scoring_guidelines: item.scoring_guidelines || "",
      max_score: item.max_score,
      req_doc1: item.req_doc1,
      req_doc2: item.req_doc2,
      req_link3: item.req_link3,
      responsible_unit: item.responsible_unit || "",
      deadline: item.deadline ? item.deadline.slice(0, 10) : "",
      sort_order: item.sort_order || 1,
      is_active: item.is_active,
    });
    setCriterionDialogOpen(true);
  }

  function openCreateCategory() {
    setEditingCategory(null);
    setCategoryForm({
      code: "",
      name: "",
      description: "",
      sort_order: (categories?.length || 0) + 1,
    });
    setCategoryDialogOpen(true);
  }

  function openEditCategory(cat: CriteriaCategory) {
    setEditingCategory(cat);
    setCategoryForm({
      code: cat.code || "",
      name: cat.name,
      description: cat.description || "",
      sort_order: cat.sort_order || 1,
    });
    setCategoryDialogOpen(true);
  }

  // Filter and natural sort criteria list by code (e.g. 1.1, 1.2, 1.10, 2.1)
  const filteredCriteria = useMemo(() => {
    const list = (criteria ?? []).filter((item) => {
      const q = search.toLowerCase();
      const matchSearch =
        item.code.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        (item.responsible_unit?.toLowerCase().includes(q) ?? false);
      const matchCat = selectedCategory === "all" || item.category_id === selectedCategory;
      const matchStatus =
        selectedStatus === "all" ||
        (selectedStatus === "active" && item.is_active) ||
        (selectedStatus === "inactive" && !item.is_active);
      return matchSearch && matchCat && matchStatus;
    });

    return list.sort((a, b) =>
      (a.code || "").localeCompare(b.code || "", undefined, { numeric: true, sensitivity: "base" })
    );
  }, [criteria, search, selectedCategory, selectedStatus]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quản lý bộ tiêu chí</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Thiết lập thư viện tiêu chí gốc, nhóm tiêu chí và quy định minh chứng
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeTab === "criteria" ? (
            <Button onClick={openCreateCriterion}>
              <Plus className="h-4 w-4 mr-2" />
              Thêm tiêu chí
            </Button>
          ) : (
            <Button onClick={openCreateCategory}>
              <Plus className="h-4 w-4 mr-2" />
              Thêm nhóm tiêu chí
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full sm:w-[400px] grid-cols-2">
          <TabsTrigger value="criteria" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Thư viện tiêu chí ({criteria?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            Nhóm tiêu chí ({categories?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/* TAB 1: CRITERIA LIBRARY */}
        {/* ============================================================ */}
        <TabsContent value="criteria" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm mã hoặc tên tiêu chí..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Nhóm tiêu chí" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả nhóm</SelectItem>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                <SelectItem value="active">Đang áp dụng</SelectItem>
                <SelectItem value="inactive">Tạm ngưng</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Criteria Table */}
          <Card>
            <CardContent className="p-0">
              {criteriaLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredCriteria.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  <ClipboardList className="h-10 w-10 mx-auto mb-3 text-slate-200" />
                  {search || selectedCategory !== "all" || selectedStatus !== "all"
                    ? "Không tìm thấy tiêu chí phù hợp."
                    : "Chưa có tiêu chí nào. Nhấn \"Thêm tiêu chí\" hoặc Import từ Excel."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">
                          <span className="font-semibold text-slate-800">Mã tiêu chí</span>
                        </TableHead>
                        <TableHead>Nội dung tiêu chí</TableHead>
                        <TableHead className="w-[180px]">Nhóm</TableHead>
                        <TableHead className="w-[90px] text-center">Điểm tối đa</TableHead>
                        <TableHead className="w-[160px]">Minh chứng yêu cầu</TableHead>
                        <TableHead className="w-[110px]">Trạng thái</TableHead>
                        <TableHead className="w-[100px] text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCriteria.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-xs font-semibold text-slate-900">
                            {item.code}
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-slate-900 line-clamp-2">{item.title}</p>
                            {item.responsible_unit && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Đơn vị phụ trách: {item.responsible_unit}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.category?.name || "—"}
                          </TableCell>
                          <TableCell className="text-center font-bold text-slate-950">
                            {item.max_score}đ
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.req_doc1 && (
                                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 gap-1 bg-amber-50 text-amber-700 border-amber-200">
                                  <FileText className="h-3 w-3" /> VB
                                </Badge>
                              )}
                              {item.req_doc2 && (
                                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 gap-1 bg-teal-50 text-teal-800 border-teal-200">
                                  <FileCheck2 className="h-3 w-3" /> BC
                                </Badge>
                              )}
                              {item.req_link3 && (
                                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 gap-1 bg-emerald-50 text-emerald-700 border-emerald-200">
                                  <Globe className="h-3 w-3" /> Tin
                                </Badge>
                              )}
                              {!item.req_doc1 && !item.req_doc2 && !item.req_link3 && (
                                <span className="text-[11px] text-slate-400 italic">Không yêu cầu</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={item.is_active}
                                onCheckedChange={(checked) =>
                                  toggleCriterionStatus.mutate({ id: item.id, is_active: checked })
                                }
                              />
                              <span className="text-xs text-muted-foreground">
                                {item.is_active ? "Áp dụng" : "Khóa"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditCriterion(item)}
                                title="Chỉnh sửa"
                              >
                                <Pencil className="h-4 w-4 text-slate-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm(`Bạn có chắc muốn xóa tiêu chí [${item.code}]?`)) {
                                    deleteCriterionMutation.mutate(item.id);
                                  }
                                }}
                                title="Xóa"
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
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
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB 2: CATEGORIES */}
        {/* ============================================================ */}
        <TabsContent value="categories" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-muted-foreground" />
                Danh sách nhóm tiêu chí
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {categoriesLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (categories ?? []).length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  <FolderTree className="h-10 w-10 mx-auto mb-3 text-slate-200" />
                  Chưa có nhóm tiêu chí nào. Nhấn "Thêm nhóm tiêu chí" để bắt đầu.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Mã nhóm</TableHead>
                      <TableHead>Tên nhóm tiêu chí</TableHead>
                      <TableHead>Mô tả</TableHead>
                      <TableHead className="w-[100px] text-center">Thứ tự</TableHead>
                      <TableHead className="w-[100px] text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(categories ?? []).map((cat) => (
                      <TableRow key={cat.id}>
                        <TableCell className="font-mono text-xs">{cat.code || "—"}</TableCell>
                        <TableCell className="font-semibold text-slate-900">{cat.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {cat.description || "—"}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs">
                          {cat.sort_order || 0}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditCategory(cat)}
                              title="Chỉnh sửa"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm(`Bạn có chắc muốn xóa nhóm "${cat.name}"?`)) {
                                  deleteCategoryMutation.mutate(cat.id);
                                }
                              }}
                              title="Xóa"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============================================================ */}
      {/* DIALOG: CREATE / EDIT CRITERION */}
      {/* ============================================================ */}
      <Dialog open={criterionDialogOpen} onOpenChange={(open) => !open && setCriterionDialogOpen(false)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCriterion ? "Chỉnh sửa tiêu chí" : "Thêm tiêu chí mới"}</DialogTitle>
            <DialogDescription>
              Cấu hình nội dung, nguyên tắc chấm điểm và yêu cầu minh chứng cho tiêu chí.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="c-code">
                  Mã tiêu chí <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="c-code"
                  placeholder="VD: 1.1, 2.6..."
                  className="mt-1"
                  value={criterionForm.code}
                  onChange={(e) => setCriterionForm({ ...criterionForm, code: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="c-cat">Nhóm tiêu chí</Label>
                <Select
                  value={criterionForm.category_id}
                  onValueChange={(v) => setCriterionForm({ ...criterionForm, category_id: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Chọn nhóm" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="c-title">
                Tên / Nội dung tiêu chí <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="c-title"
                placeholder="Nhập nội dung đầy đủ của tiêu chí"
                className="mt-1"
                rows={3}
                value={criterionForm.title}
                onChange={(e) => setCriterionForm({ ...criterionForm, title: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="c-max-score">
                  Điểm tối đa <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="c-max-score"
                  type="number"
                  step="0.25"
                  min="0"
                  className="mt-1"
                  value={criterionForm.max_score}
                  onChange={(e) => setCriterionForm({ ...criterionForm, max_score: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label htmlFor="c-unit">Đơn vị / Ban phụ trách</Label>
                <Input
                  id="c-unit"
                  placeholder="VD: Hội đồng Đội, Ban Thiếu nhi, Tổng phụ trách..."
                  className="mt-1"
                  value={criterionForm.responsible_unit}
                  onChange={(e) => setCriterionForm({ ...criterionForm, responsible_unit: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="c-guidelines">Nguyên tắc chấm điểm / Hướng dẫn</Label>
              <Textarea
                id="c-guidelines"
                placeholder="Mô tả cách tính điểm, thang điểm chi tiết..."
                className="mt-1"
                rows={2}
                value={criterionForm.scoring_guidelines}
                onChange={(e) => setCriterionForm({ ...criterionForm, scoring_guidelines: e.target.value })}
              />
            </div>

            {/* Evidence Requirements */}
            <div className="border rounded-lg p-4 bg-slate-50/50 space-y-3">
              <Label className="text-sm font-semibold text-slate-800">
                Yêu cầu minh chứng (PRD Chuẩn)
              </Label>
              <p className="text-xs text-muted-foreground">
                Tích chọn các loại minh chứng bắt buộc đối với tiêu chí này:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <label className="flex items-center space-x-2 p-2 border rounded-md bg-white hover:bg-slate-50 cursor-pointer">
                  <Checkbox
                    checked={criterionForm.req_doc1}
                    onCheckedChange={(c) => setCriterionForm({ ...criterionForm, req_doc1: !!c })}
                  />
                  <span className="text-xs font-medium">1. Văn bản triển khai</span>
                </label>
                <label className="flex items-center space-x-2 p-2 border rounded-md bg-white hover:bg-slate-50 cursor-pointer">
                  <Checkbox
                    checked={criterionForm.req_doc2}
                    onCheckedChange={(c) => setCriterionForm({ ...criterionForm, req_doc2: !!c })}
                  />
                  <span className="text-xs font-medium">2. Báo cáo kết quả</span>
                </label>
                <label className="flex items-center space-x-2 p-2 border rounded-md bg-white hover:bg-slate-50 cursor-pointer">
                  <Checkbox
                    checked={criterionForm.req_link3}
                    onCheckedChange={(c) => setCriterionForm({ ...criterionForm, req_link3: !!c })}
                  />
                  <span className="text-xs font-medium">3. Tin bài hoạt động</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 items-center">
              <div>
                <Label htmlFor="c-sort">Thứ tự hiển thị</Label>
                <Input
                  id="c-sort"
                  type="number"
                  className="mt-1"
                  value={criterionForm.sort_order}
                  onChange={(e) => setCriterionForm({ ...criterionForm, sort_order: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="flex items-center space-x-2 pt-6">
                <Switch
                  id="c-active"
                  checked={criterionForm.is_active}
                  onCheckedChange={(c) => setCriterionForm({ ...criterionForm, is_active: c })}
                />
                <Label htmlFor="c-active" className="cursor-pointer">
                  Kích hoạt áp dụng
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCriterionDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={() => {
                if (!criterionForm.code.trim() || !criterionForm.title.trim()) {
                  toast.error("Vui lòng nhập mã và nội dung tiêu chí.");
                  return;
                }
                saveCriterionMutation.mutate(criterionForm);
              }}
              disabled={saveCriterionMutation.isPending}
            >
              {saveCriterionMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingCriterion ? "Cập nhật" : "Tạo tiêu chí"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: CREATE / EDIT CATEGORY */}
      {/* ============================================================ */}
      <Dialog open={categoryDialogOpen} onOpenChange={(open) => !open && setCategoryDialogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Chỉnh sửa nhóm tiêu chí" : "Thêm nhóm tiêu chí mới"}</DialogTitle>
            <DialogDescription>
              Tổ chức các tiêu chí theo từng nhóm/lĩnh vực công tác.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-3">
            <div>
              <Label htmlFor="cat-code">Mã nhóm</Label>
              <Input
                id="cat-code"
                placeholder="VD: N01, CTĐ..."
                className="mt-1"
                value={categoryForm.code}
                onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="cat-name">
                Tên nhóm tiêu chí <span className="text-red-500">*</span>
              </Label>
              <Input
                id="cat-name"
                placeholder="VD: Công tác tuyên truyền giáo dục..."
                className="mt-1"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="cat-desc">Mô tả</Label>
              <Textarea
                id="cat-desc"
                placeholder="Mô tả nhóm tiêu chí (tùy chọn)"
                className="mt-1"
                rows={2}
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="cat-sort">Thứ tự hiển thị</Label>
              <Input
                id="cat-sort"
                type="number"
                className="mt-1"
                value={categoryForm.sort_order}
                onChange={(e) => setCategoryForm({ ...categoryForm, sort_order: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={() => {
                if (!categoryForm.name.trim()) {
                  toast.error("Vui lòng nhập tên nhóm tiêu chí.");
                  return;
                }
                saveCategoryMutation.mutate(categoryForm);
              }}
              disabled={saveCategoryMutation.isPending}
            >
              {saveCategoryMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingCategory ? "Cập nhật" : "Tạo nhóm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
