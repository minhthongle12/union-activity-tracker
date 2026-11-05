import { Card, CardContent } from "@/components/ui/card";
import { CheckSquare } from "lucide-react";

export default function ReviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Thẩm định & xác thực</h1>
        <p className="text-sm text-muted-foreground mt-1">Xem xét minh chứng, chấm điểm và xác thực tiêu chí</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <CheckSquare className="h-8 w-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">Thẩm định</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">Tính năng đang được phát triển. Vui lòng quay lại sau.</p>
        </CardContent>
      </Card>
    </div>
  );
}
