import { Card, CardContent } from "@/components/ui/card";
import { Bell } from "lucide-react";

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Thông báo</h1>
        <p className="text-sm text-muted-foreground mt-1">Xem các thông báo từ hệ thống</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Bell className="h-8 w-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">Thông báo</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">Chưa có thông báo nào.</p>
        </CardContent>
      </Card>
    </div>
  );
}
