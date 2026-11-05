import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

const routeNames: Record<string, string> = {
  admin: "Quản trị",
  user: "Liên đội",
  organizations: "Quản lý đơn vị",
  users: "Quản lý tài khoản",
  periods: "Đợt đánh giá",
  criteria: "Bộ tiêu chí",
  "import-export": "Import / Export",
  review: "Thẩm định & xác thực",
  bonus: "Điểm cộng",
  reports: "Báo cáo & thống kê",
  notifications: "Thông báo",
  "audit-logs": "Nhật ký hoạt động",
  settings: "Cài đặt hệ thống",
  evidence: "Kho minh chứng",
  results: "Kết quả đánh giá",
  account: "Tài khoản",
};

export function Breadcrumbs() {
  const location = useLocation();
  const pathnames = location.pathname.split("/").filter((x) => x);

  return (
    <nav className="flex items-center space-x-1 text-xs sm:text-sm text-muted-foreground min-w-0" aria-label="Breadcrumb">
      <Link
        to={pathnames[0] === "admin" ? "/admin" : "/user"}
        className="flex items-center hover:text-foreground transition-colors shrink-0"
      >
        <Home className="h-4 w-4" />
      </Link>
      {pathnames.map((value, index) => {
        const to = `/${pathnames.slice(0, index + 1).join("/")}`;
        const isLast = index === pathnames.length - 1;
        let name = routeNames[value] || value;
        if (value === "criteria" && pathnames[0] === "user") {
          name = "Đợt đánh giá";
        }

        return (
          <div key={to} className="flex items-center space-x-1 min-w-0">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
            {isLast ? (
              <span className="font-medium text-foreground truncate max-w-[130px] sm:max-w-xs">{name}</span>
            ) : (
              <Link to={to} className="hover:text-foreground transition-colors truncate max-w-[90px] sm:max-w-xs">
                {name}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}

