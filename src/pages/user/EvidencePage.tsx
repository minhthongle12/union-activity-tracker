import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { EvidenceItem, EvidenceType } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  FolderOpen,
  Search,
  FileText,
  Globe,
  ExternalLink,
  Eye,
  Download,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { getEvidenceSignedUrl } from "@/lib/storage";

async function fetchUserEvidenceRepository(orgId?: string | null) {
  if (!orgId) return [];

  // Query all submissions for this org
  const { data: orgPeriods } = await supabase
    .from("organization_periods")
    .select("id, period_id")
    .eq("organization_id", orgId);

  const orgPeriodIds = (orgPeriods ?? []).map((op) => op.id);
  if (orgPeriodIds.length === 0) return [];

  const { data: subs } = await supabase
    .from("submissions")
    .select(`
      id,
      organization_period_id,
      period_criteria_id,
      period_criterion:period_criteria(id, period_id, code_snapshot, title_snapshot)
    `)
    .in("organization_period_id", orgPeriodIds);

  const subIds = (subs ?? []).map((s) => s.id);

  const { data: revs } = await supabase
    .from("submission_revisions")
    .select("id, submission_id")
    .in("submission_id", subIds.length ? subIds : ["00000000-0000-0000-0000-000000000000"]);

  const revIds = (revs ?? []).map((r) => r.id);

  const { data: items, error } = await supabase
    .from("evidence_items")
    .select("*")
    .in("revision_id", revIds.length ? revIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });

  if (error) throw error;

  // Map criterion info
  return (items ?? []).map((item: any) => {
    const rev = revs?.find((r) => r.id === item.revision_id);
    const sub: any = subs?.find((s) => s.id === rev?.submission_id);
    const op = (orgPeriods ?? []).find((o) => o.id === sub?.organization_period_id);
    return {
      ...item,
      periodId: sub?.period_criterion?.period_id || op?.period_id,
      criterionId: sub?.period_criteria_id,
      criterionCode: sub?.period_criterion?.code_snapshot || "—",
      criterionTitle: sub?.period_criterion?.title_snapshot || "—",
    };
  });
}

export default function EvidencePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const { data: evidenceList, isLoading } = useQuery({
    queryKey: ["user_evidence_repository", profile?.organization_id],
    queryFn: () => fetchUserEvidenceRepository(profile?.organization_id),
    enabled: !!profile?.organization_id,
  });

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadFile = async (item: any) => {
    if (!item.storage_path) {
      toast.error("Không tìm thấy đường dẫn lưu trữ của tệp.");
      return;
    }
    setDownloadingId(item.id);
    try {
      const signedUrl = await getEvidenceSignedUrl("evidence", item.storage_path);
      const a = document.createElement("a");
      a.href = signedUrl;
      a.download = item.file_name || "minh_chung";
      a.target = "_blank";
      a.rel = "noreferrer";
      a.click();
      toast.success(`Đang mở tải tệp ${item.file_name}`);
    } catch (err) {
      toast.error("Lỗi khi tải tệp: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDownloadingId(null);
    }
  };

  const filtered = (evidenceList ?? []).filter((item: any) => {
    const q = search.toLowerCase();
    const matchSearch =
      item.file_name?.toLowerCase().includes(q) ||
      item.criterionCode?.toLowerCase().includes(q) ||
      item.criterionTitle?.toLowerCase().includes(q);
    const matchType = filterType === "all" || item.evidence_type === filterType;
    return matchSearch && matchType;
  });

  const getTypeBadge = (type: EvidenceType) => {
    switch (type) {
      case "doc1":
        return <Badge variant="secondary" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]">1. Văn bản triển khai</Badge>;
      case "doc2":
        return <Badge variant="secondary" className="bg-teal-50 text-teal-800 border-teal-200 text-[10px]">2. Báo cáo kết quả</Badge>;
      case "link3":
        return <Badge variant="secondary" className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px]">3. Tin bài hoạt động</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Kho minh chứng
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Lưu trữ tập trung và quản lý toàn bộ tệp tài liệu, văn bản, báo cáo và đường dẫn tin bài đã tải lên
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên tệp hoặc mã tiêu chí..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Loại minh chứng" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả loại minh chứng</SelectItem>
            <SelectItem value="doc1">Văn bản triển khai</SelectItem>
            <SelectItem value="doc2">Báo cáo kết quả</SelectItem>
            <SelectItem value="link3">Tin bài hoạt động</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-emerald-200 shadow-2xs rounded-2xl overflow-hidden">
        <CardHeader className="pb-3 border-b border-emerald-50 bg-white">
          <CardTitle className="text-base font-bold text-slate-950 flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-emerald-700" />
            Tất cả minh chứng ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-slate-600 space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-emerald-700" />
              <p>Đang tải kho minh chứng...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center text-sm text-slate-600">
              <FolderOpen className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              Chưa có minh chứng nào trong kho.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-emerald-50/70 border-b border-emerald-200">
                  <TableRow>
                    <TableHead className="w-[120px] font-bold text-slate-950">Tiêu chí</TableHead>
                    <TableHead className="font-bold text-slate-950">Tên tệp / Tiêu đề liên kết</TableHead>
                    <TableHead className="w-[180px] font-bold text-slate-950">Loại minh chứng</TableHead>
                    <TableHead className="w-[120px] font-bold text-slate-950">Dung lượng</TableHead>
                    <TableHead className="w-[140px] font-bold text-slate-950">Ngày nộp</TableHead>
                    <TableHead className="w-[110px] text-right font-bold text-slate-950">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item: any) => (
                    <TableRow key={item.id} className="hover:bg-emerald-50/30">
                      <TableCell>
                        {item.periodId && item.criterionCode !== "—" ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/user/criteria?period=${item.periodId}&search=${encodeURIComponent(item.criterionCode)}`
                              )
                            }
                            className="font-mono text-xs font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2 py-1 rounded-md flex items-center gap-1 transition-all cursor-pointer group shadow-2xs"
                            title={`Xem tiêu chí [${item.criterionCode}] ${item.criterionTitle}`}
                          >
                            <span>[{item.criterionCode}]</span>
                            <ArrowRight className="h-3 w-3 text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
                          </button>
                        ) : (
                          <span className="font-mono text-xs font-semibold text-slate-500">[{item.criterionCode}]</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {item.external_url ? (
                            <Globe className="h-4 w-4 text-emerald-700 shrink-0" />
                          ) : (
                            <FileText className="h-4 w-4 text-emerald-700 shrink-0" />
                          )}
                          <span className="font-bold text-xs text-slate-950 line-clamp-1">
                            {item.file_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{getTypeBadge(item.evidence_type)}</TableCell>
                      <TableCell className="text-xs text-slate-600 font-medium">
                        {item.file_size ? `${Math.round(item.file_size / 1024)} KB` : "URL Link"}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 font-mono">
                        {new Date(item.created_at).toLocaleDateString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {item.external_url ? (
                            <a
                              href={item.external_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex p-1.5 text-slate-700 hover:text-emerald-800 rounded-md hover:bg-emerald-50 transition-colors"
                              title="Mở liên kết"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-700 hover:text-emerald-800 hover:bg-emerald-50"
                              onClick={() => handleDownloadFile(item)}
                              disabled={downloadingId === item.id}
                              title="Tải tệp"
                            >
                              {downloadingId === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                          )}

                          {item.periodId && item.criterionCode !== "—" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50"
                              onClick={() =>
                                navigate(
                                  `/user/criteria?period=${item.periodId}&search=${encodeURIComponent(item.criterionCode)}`
                                )
                              }
                              title={`Chuyển tới tiêu chí ${item.criterionCode}`}
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          )}
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
    </div>
  );
}
