import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";

export default function CriteriaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bộ tiêu chí đánh giá</h1>
        <p className="text-sm text-muted-foreground mt-1">Xem danh sách tiêu chí, nộp minh chứng và tự chấm điểm</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <ClipboardList className="h-8 w-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">Tiêu chí đánh giá</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">Tính năng đang được phát triển. Vui lòng quay lại sau.</p>
        </CardContent>
      </Card>
    </div>
  );
}
