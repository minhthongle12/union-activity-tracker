import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { AuditLog, Profile } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { History, Search, ShieldCheck, Clock, Eye, Loader2 } from "lucide-react";

async function fetchAuditLogs(): Promise<(AuditLog & { actor?: Profile | null })[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*, actor:profiles(*)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data ?? []) as any[];
}

export default function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<(AuditLog & { actor?: Profile | null }) | null>(null);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit_logs"],
    queryFn: fetchAuditLogs,
  });

  const filtered = (logs ?? []).filter((log) => {
    const q = search.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.entity_type.toLowerCase().includes(q) ||
      (log.actor?.display_name?.toLowerCase().includes(q) ?? false) ||
      (log.actor?.username?.toLowerCase().includes(q) ?? false)
    );
  });

  const getActionBadge = (action: string) => {
    if (action.includes("VERIFY")) {
      return <Badge className="bg-emerald-600 text-white text-[11px]">{action}</Badge>;
    }
    if (action.includes("REVISE") || action.includes("REVISION")) {
      return <Badge className="bg-amber-600 text-white text-[11px]">{action}</Badge>;
    }
    if (action.includes("REOPEN")) {
      return <Badge className="bg-red-600 text-white text-[11px]">{action}</Badge>;
    }
    return <Badge variant="outline" className="text-slate-700 text-[11px]">{action}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Nhật ký hoạt động
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Lịch sử ghi nhận bất biến các thao tác quản trị, thẩm định và thay đổi dữ liệu theo chuẩn PRD
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Tìm theo thao tác, người dùng..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-slate-600" />
            Nhật ký gần đây ({filtered.length})
          </CardTitle>
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
              Chưa có nhật ký hoạt động nào được ghi nhận.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Thời gian</TableHead>
                    <TableHead className="w-[150px]">Người thực hiện</TableHead>
                    <TableHead className="w-[180px]">Hành động</TableHead>
                    <TableHead className="w-[120px]">Đối tượng</TableHead>
                    <TableHead>Chi tiết thay đổi</TableHead>
                    <TableHead className="w-[80px] text-right">Xem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => (
                    <TableRow key={log.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedLog(log)}>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {new Date(log.created_at).toLocaleString("vi-VN")}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-xs text-slate-800">
                          {log.actor?.display_name || "Hệ thống"}
                        </span>
                        {log.actor?.username && (
                          <span className="text-[10px] text-muted-foreground block font-mono">
                            @{log.actor.username}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{getActionBadge(log.action)}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">
                        {log.entity_type}
                      </TableCell>
                      <TableCell className="text-xs font-mono max-w-xs truncate text-muted-foreground">
                        {log.new_values ? JSON.stringify(log.new_values) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-500 hover:text-emerald-800 hover:bg-emerald-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
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
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-emerald-700" />
              Chi tiết nhật ký hoạt động
            </DialogTitle>
            <DialogDescription>
              Mã bản ghi: <span className="font-mono text-xs">{selectedLog?.id}</span>
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4 py-2 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Người thực hiện</span>
                  <span className="font-semibold text-slate-900">
                    {selectedLog.actor?.display_name || "Hệ thống"}
                  </span>
                  {selectedLog.actor?.username && (
                    <span className="text-[10px] text-slate-500 block font-mono">
                      @{selectedLog.actor.username}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Thời gian</span>
                  <span className="font-mono text-slate-800">
                    {new Date(selectedLog.created_at).toLocaleString("vi-VN")}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Hành động</span>
                  <span className="font-mono font-bold text-emerald-800">{selectedLog.action}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Thực thể (Entity)</span>
                  <span className="font-mono text-slate-800">
                    {selectedLog.entity_type} {selectedLog.entity_id ? `(${selectedLog.entity_id})` : ""}
                  </span>
                </div>
              </div>

              {selectedLog.old_values && (
                <div>
                  <span className="font-semibold text-slate-700 block mb-1">Dữ liệu trước thay đổi (Old Values)</span>
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto font-mono text-[11px]">
                    {JSON.stringify(selectedLog.old_values, null, 2)}
                  </pre>
                </div>
              )}

              <div>
                <span className="font-semibold text-slate-700 block mb-1">Dữ liệu sau thay đổi (New Values / Details)</span>
                <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto font-mono text-[11px]">
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
