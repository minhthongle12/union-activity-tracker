import { Card, CardContent } from "@/components/ui/card";
import { FileSpreadsheet } from "lucide-react";

export default function ImportExportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Import / Export Excel</h1>
        <p className="text-sm text-muted-foreground mt-1">Nhập danh sách tiêu chí từ Excel và xuất báo cáo</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <FileSpreadsheet className="h-8 w-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">Import / Export</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">Tính năng đang được phát triển. Vui lòng quay lại sau.</p>
        </CardContent>
      </Card>
    </div>
  );
}
