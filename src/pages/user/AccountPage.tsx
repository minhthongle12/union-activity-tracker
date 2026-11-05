import { Card, CardContent } from "@/components/ui/card";
import { User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

export default function AccountPage() {
  const { profile } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quản lý tài khoản</h1>
        <p className="text-sm text-muted-foreground mt-1">Xem và cập nhật thông tin tài khoản</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-2xl bg-blue-100 flex items-center justify-center">
              <User className="h-8 w-8 text-blue-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">{profile?.display_name || "—"}</h3>
              <p className="text-sm text-muted-foreground">@{profile?.username || "—"}</p>
              <Badge variant="outline">
                {profile?.role === "admin" ? "Quản trị viên" : "Đoàn cơ sở"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
