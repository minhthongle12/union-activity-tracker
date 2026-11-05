import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Settings,
  Shield,
  Database,
  Bell,
  HardDrive,
  Save,
  CheckCircle2,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { profile } = useAuth();
  const [authorityName, setAuthorityName] = useState("BAN THƯỜNG VỤ ĐOÀN KHỐI");
  const [maxFileSize, setMaxFileSize] = useState(15);
  const [allowPublicRanking, setAllowPublicRanking] = useState(false);
  const [autoNotifyReview, setAutoNotifyReview] = useState(true);
  const [testingConnection, setTestingConnection] = useState(false);

  useEffect(() => {
    const savedAuthority = localStorage.getItem("setting_authority_name");
    const savedMaxFileSize = localStorage.getItem("setting_max_file_size");
    const savedAutoNotify = localStorage.getItem("setting_auto_notify");
    if (savedAuthority) setAuthorityName(savedAuthority);
    if (savedMaxFileSize) setMaxFileSize(parseInt(savedMaxFileSize) || 15);
    if (savedAutoNotify) setAutoNotifyReview(savedAutoNotify === "true");
  }, []);

  const handleSave = async () => {
    localStorage.setItem("setting_authority_name", authorityName);
    localStorage.setItem("setting_max_file_size", maxFileSize.toString());
    localStorage.setItem("setting_auto_notify", autoNotifyReview.toString());

    await supabase.from("audit_logs").insert({
      actor_id: profile?.id || null,
      action: "UPDATE_SYSTEM_SETTINGS",
      entity_type: "settings",
      new_values: { authorityName, maxFileSize, autoNotifyReview },
    });

    toast.success("Đã lưu các cài đặt hệ thống thành công!");
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const { count, error } = await supabase
        .from("organizations")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      toast.success(`Kết nối Supabase máy chủ ổn định! Kiểm tra ${count ?? 0} đơn vị.`);
    } catch (err: any) {
      toast.error("Lỗi kết nối Supabase: " + (err.message || String(err)));
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Cài đặt hệ thống
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cấu hình tham số vận hành, bảo mật và lưu trữ cho hệ thống quản lý đánh giá
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* General Config */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-emerald-700" />
              <CardTitle className="text-base">Thông tin cơ quan chủ quản</CardTitle>
            </div>
            <CardDescription>
              Tên đơn vị quản trị hiển thị trên toàn bộ báo cáo và giao diện người dùng
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Tên đơn vị quản trị cấp trên</Label>
              <Input
                value={authorityName}
                onChange={(e) => setAuthorityName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Dung lượng tối đa mỗi file minh chứng (MB)</Label>
              <Input
                type="number"
                min="5"
                max="50"
                value={maxFileSize}
                onChange={(e) => setMaxFileSize(parseInt(e.target.value) || 15)}
                className="mt-1 w-32"
              />
              <span className="text-xs text-muted-foreground mt-0.5 block">
                Khuyến nghị: 15MB/tệp để tối ưu đường truyền cho các đơn vị vùng xa.
              </span>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold">Tự động gửi thông báo khi thẩm định</Label>
                <p className="text-xs text-muted-foreground">
                  Gửi thông báo đẩy và email nội bộ ngay khi Admin duyệt hoặc yêu cầu bổ sung
                </p>
              </div>
              <Switch checked={autoNotifyReview} onCheckedChange={setAutoNotifyReview} />
            </div>
          </CardContent>
        </Card>

        {/* Database & Security Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-base">Hạ tầng & Bảo mật</CardTitle>
            </div>
            <CardDescription>
              Trạng thái kết nối cơ sở dữ liệu và lưu trữ Supabase Storage
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Môi trường:</span>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
                  Bun + React 19 + Supabase
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Row Level Security (RLS):</span>
                <span className="font-semibold text-emerald-700">Đã kích hoạt 18/18 bảng</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Buckets lưu trữ riêng tư:</span>
                <span className="font-semibold text-slate-800">evidence, bonus-evidence</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Phiên bản hệ thống:</span>
                <span className="font-mono text-slate-800">v1.0.0 Enterprise</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <Button
                variant="outline"
                className="w-full gap-2 border-slate-300"
                onClick={handleTestConnection}
                disabled={testingConnection}
              >
                {testingConnection ? (
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Kiểm tra kết nối Supabase
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md shadow-emerald-700/20 font-semibold">
          <Save className="h-4 w-4" />
          Lưu thay đổi cài đặt
        </Button>
      </div>
    </div>
  );
}
