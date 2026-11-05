import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { AuditLog, Profile } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  History,
  Search,
  Clock,
  Eye,
  Loader2,
  Laptop,
  Smartphone,
  Tablet,
  Monitor,
  Globe,
  Compass,
  Layers,
  Shield,
  Activity,
  Filter,
} from "lucide-react";

async function fetchAuditLogs(): Promise<(AuditLog & { actor?: Profile | null })[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*, actor:profiles(*)")
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) throw error;
  return (data ?? []) as any[];
}

export default function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [deviceFilter, setDeviceFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<(AuditLog & { actor?: Profile | null }) | null>(null);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit_logs"],
    queryFn: fetchAuditLogs,
  });

  // Extract device info helper
  const getDeviceInfo = (log: AuditLog) => {
    const nv = log.new_values as any;
    if (nv?._device) {
      return nv._device;
    }
    return null;
  };

  const getLogSummary = (log: AuditLog): string => {
    const nv = log.new_values as any;
    if (nv?._summary) return nv._summary;
    if (log.action === "SUBMIT_CRITERION") return "Nộp minh chứng tiêu chí";
    if (log.action === "SAVE_DRAFT_CRITERION") return "Lưu nháp minh chứng tiêu chí";
    if (log.action === "SUBMIT_BONUS") return "Gửi đề xuất điểm thưởng thi đua";
    if (log.action === "VERIFY_CRITERION") return `Xác thực điểm: ${nv?.admin_score ?? ""}đ`;
    if (log.action === "REQUEST_REVISION") return "Yêu cầu bổ sung minh chứng";
    if (log.action === "CREATE_PERIOD") return `Tạo đợt đánh giá: ${nv?.name ?? ""}`;
    if (log.action === "CREATE_CRITERION") return `Tạo tiêu chí [${nv?.code ?? ""}]: ${nv?.title ?? ""}`;
    if (log.action === "UPDATE_SYSTEM_SETTINGS") return "Cập nhật tham số cài đặt hệ thống";
    return log.new_values ? JSON.stringify(log.new_values).slice(0, 80) : "—";
  };

  const filtered = useMemo(() => {
    return (logs ?? []).filter((log) => {
      const q = search.toLowerCase();
      const dev = getDeviceInfo(log);
      const summary = getLogSummary(log).toLowerCase();

      const matchSearch =
        log.action.toLowerCase().includes(q) ||
        (log.entity_type && log.entity_type.toLowerCase().includes(q)) ||
        summary.includes(q) ||
        (log.actor?.display_name?.toLowerCase().includes(q) ?? false) ||
        (log.actor?.username?.toLowerCase().includes(q) ?? false);

      const matchDevice =
        deviceFilter === "all" ||
        (deviceFilter === "Desktop" && (!dev || dev.type === "Desktop")) ||
        (deviceFilter === "Mobile" && dev?.type === "Mobile") ||
        (deviceFilter === "Tablet" && dev?.type === "Tablet");

      const matchAction =
        actionFilter === "all" ||
        (actionFilter === "SUBMIT" && log.action.includes("SUBMIT")) ||
        (actionFilter === "REVIEW" && (log.action.includes("VERIFY") || log.action.includes("REVISION") || log.action.includes("REOPEN"))) ||
        (actionFilter === "PERIOD" && log.action.includes("PERIOD")) ||
        (actionFilter === "CRITERION" && log.action.includes("CRITERION")) ||
        (actionFilter === "BONUS" && log.action.includes("BONUS"));

      return matchSearch && matchDevice && matchAction;
    });
  }, [logs, search, deviceFilter, actionFilter]);

  const getActionBadge = (action: string) => {
    if (action.includes("VERIFY")) {
      return <Badge className="bg-emerald-700 text-white text-[11px] font-bold">✓ Xác thực</Badge>;
    }
    if (action.includes("SUBMIT")) {
      return <Badge className="bg-lime-700 text-white text-[11px] font-bold">↑ Nộp bài</Badge>;
    }
    if (action.includes("REVISE") || action.includes("REVISION")) {
      return <Badge className="bg-amber-600 text-white text-[11px] font-bold">! Bổ sung</Badge>;
    }
    if (action.includes("CREATE")) {
      return <Badge className="bg-emerald-800 text-white text-[11px] font-bold">+ Tạo mới</Badge>;
    }
    if (action.includes("REOPEN")) {
      return <Badge className="bg-red-600 text-white text-[11px] font-bold">↻ Mở lại</Badge>;
    }
    return <Badge variant="outline" className="text-slate-700 font-mono text-[10px]">{action}</Badge>;
  };

  const renderDeviceBadge = (log: AuditLog) => {
    const dev = getDeviceInfo(log);
    if (!dev) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
          <Monitor className="h-3 w-3 text-slate-400 shrink-0" />
          <span>Desktop</span>
        </span>
      );
    }

    const Icon = dev.type === "Mobile" ? Smartphone : dev.type === "Tablet" ? Tablet : Laptop;

    return (
      <div className="flex flex-col text-left">
        <span className="inline-flex items-center gap-1 font-semibold text-xs text-slate-800">
          <Icon className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
          <span>{dev.type}</span>
          <span className="text-slate-400 font-normal">•</span>
          <span className="text-slate-700">{dev.os}</span>
        </span>
        <span className="text-[10px] text-slate-500 truncate max-w-[150px]">
          {dev.browser} • {dev.screen}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Nhật ký hoạt động hệ thống
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Theo dõi toàn bộ lịch sử thao tác, thiết bị sử dụng (Mobile/Desktop/Tablet), hệ điều hành và chi tiết thay đổi dữ liệu
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo người dùng, nội dung, thao tác..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        {/* Device Filter */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Select value={deviceFilter} onValueChange={setDeviceFilter}>
            <SelectTrigger className="h-9 text-xs font-semibold w-[150px] bg-white">
              <SelectValue placeholder="Thiết bị" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Tất cả thiết bị</SelectItem>
              <SelectItem value="Desktop" className="text-xs">💻 Máy tính (Desktop)</SelectItem>
              <SelectItem value="Mobile" className="text-xs">📱 Điện thoại (Mobile)</SelectItem>
              <SelectItem value="Tablet" className="text-xs">📟 Máy tính bảng</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Action Filter */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-9 text-xs font-semibold w-[150px] bg-white">
              <SelectValue placeholder="Hành động" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Tất cả hành động</SelectItem>
              <SelectItem value="SUBMIT" className="text-xs">Nộp minh chứng</SelectItem>
              <SelectItem value="REVIEW" className="text-xs">Thẩm định / Chấm điểm</SelectItem>
              <SelectItem value="PERIOD" className="text-xs">Đợt đánh giá</SelectItem>
              <SelectItem value="CRITERION" className="text-xs">Tiêu chí</SelectItem>
              <SelectItem value="BONUS" className="text-xs">Điểm thưởng</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card className="border-emerald-200/80 shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="pb-3 border-b border-emerald-100 bg-white">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-950">
              <History className="h-4 w-4 text-emerald-800" />
              Lịch sử ghi nhận ({filtered.length} bản ghi)
            </CardTitle>
            <span className="text-xs text-muted-foreground font-medium">
              Tự động lưu thiết bị, trình duyệt & độ phân giải
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-emerald-700" />
              <p>Đang tải nhật ký hoạt động...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center text-sm text-muted-foreground">
              <History className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              Không tìm thấy nhật ký hoạt động nào phù hợp.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/70">
                    <TableHead className="w-[145px]">Thời gian</TableHead>
                    <TableHead className="w-[160px]">Người thực hiện</TableHead>
                    <TableHead className="w-[180px]">Thiết bị & Trình duyệt</TableHead>
                    <TableHead className="w-[110px]">Hành động</TableHead>
                    <TableHead>Nội dung thao tác</TableHead>
                    <TableHead className="w-[60px] text-right">Chi tiết</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => (
                    <TableRow
                      key={log.id}
                      className="hover:bg-emerald-50/30 cursor-pointer transition-colors"
                      onClick={() => setSelectedLog(log)}
                    >
                      <TableCell className="text-xs text-slate-600">
                        <span className="flex items-center gap-1 font-mono text-[11px]">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {new Date(log.created_at).toLocaleString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-xs text-slate-900 block truncate max-w-[150px]">
                          {log.actor?.display_name || "Hệ thống"}
                        </span>
                        {log.actor?.username && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            @{log.actor.username}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{renderDeviceBadge(log)}</TableCell>
                      <TableCell>{getActionBadge(log.action)}</TableCell>
                      <TableCell className="text-xs text-slate-800">
                        <p className="font-medium line-clamp-1">{getLogSummary(log)}</p>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-500 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                        >
                          <Eye className="h-4 w-4" />
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

      {/* Log Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-emerald-800" />
              <DialogTitle className="text-base font-bold text-slate-950">
                Chi tiết nhật ký hoạt động
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500">
              Mã bản ghi: <span className="font-mono text-[11px]">{selectedLog?.id}</span>
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4 py-1 text-xs">
              {/* Summary Header Card */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-emerald-900 uppercase font-bold block">
                    Nội dung thao tác
                  </span>
                  <p className="font-bold text-sm text-slate-950">
                    {getLogSummary(selectedLog)}
                  </p>
                </div>
                {getActionBadge(selectedLog.action)}
              </div>

              {/* Actor & Time */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Người thực hiện</span>
                  <span className="font-bold text-slate-950 text-xs">
                    {selectedLog.actor?.display_name || "Hệ thống"}
                  </span>
                  {selectedLog.actor?.username && (
                    <span className="text-[10px] text-slate-500 block font-mono">
                      @{selectedLog.actor.username} ({selectedLog.actor.role === "admin" ? "Admin" : "Liên đội"})
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Thời gian</span>
                  <span className="font-mono text-slate-900 text-xs font-semibold">
                    {new Date(selectedLog.created_at).toLocaleString("vi-VN")}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Thực thể (Entity)</span>
                  <span className="font-mono text-slate-900 text-xs">
                    {selectedLog.entity_type || "—"} {selectedLog.entity_id ? `(${selectedLog.entity_id.slice(0, 8)}...)` : ""}
                  </span>
                </div>
              </div>

              {/* Device & Environment Card */}
              {(() => {
                const dev = getDeviceInfo(selectedLog);
                return (
                  <div className="p-3 bg-white border border-emerald-200 rounded-xl space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                        <Monitor className="h-4 w-4 text-emerald-700" />
                        Thông tin thiết bị & Môi trường truy cập
                      </span>
                      {dev ? (
                        <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 font-bold text-[10px]">
                          {dev.type}
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-slate-400">Desktop cơ bản</span>
                      )}
                    </div>

                    {dev ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                        <div className="p-2 bg-slate-50 rounded-lg">
                          <span className="text-[10px] text-slate-500 block">Hệ điều hành</span>
                          <span className="font-bold text-slate-900">{dev.os}</span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg">
                          <span className="text-[10px] text-slate-500 block">Trình duyệt</span>
                          <span className="font-bold text-slate-900">{dev.browser}</span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg">
                          <span className="text-[10px] text-slate-500 block">Độ phân giải</span>
                          <span className="font-mono text-slate-900 text-[11px]">{dev.screen}</span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg">
                          <span className="text-[10px] text-slate-500 block">Trang thao tác</span>
                          <span className="font-mono text-emerald-800 text-[11px] truncate block" title={dev.url}>
                            {dev.url}
                          </span>
                        </div>
                        {dev.userAgent && (
                          <div className="col-span-2 sm:col-span-4 p-2 bg-slate-900 text-slate-200 rounded-lg">
                            <span className="text-[10px] text-slate-400 block font-sans">User Agent chuỗi nhận diện:</span>
                            <span className="font-mono text-[10px] break-all leading-relaxed block">
                              {dev.userAgent}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-500 text-xs italic py-1">
                        Bản ghi cũ không lưu thông tin chi tiết thiết bị (mới áp dụng từ các thao tác gần đây).
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Data Changed */}
              {selectedLog.old_values && (
                <div>
                  <span className="font-bold text-slate-900 block mb-1">Dữ liệu trước thay đổi (Old Values)</span>
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl overflow-x-auto font-mono text-[11px] leading-relaxed">
                    {JSON.stringify(selectedLog.old_values, null, 2)}
                  </pre>
                </div>
              )}

              <div>
                <span className="font-bold text-slate-900 block mb-1">Chi tiết dữ liệu (Payload / Values)</span>
                <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl overflow-x-auto font-mono text-[11px] leading-relaxed">
                  {selectedLog.new_values ? JSON.stringify(selectedLog.new_values, null, 2) : "Không có"}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
