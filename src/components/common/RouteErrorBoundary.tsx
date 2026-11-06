import { useState } from 'react';
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { RefreshCw, Home, AlertTriangle, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function RouteErrorBoundary() {
  const error = useRouteError();
  const [showDetails, setShowDetails] = useState(false);

  // Extract error message
  let errorTitle = 'Đã có bản cập nhật mới';
  let errorDescription =
    'Hệ thống vừa cập nhật tính năng mới hoặc kết nối mạng bị gián đoạn. Vui lòng tải lại trang để tiếp tục sử dụng.';
  let isDynamicImport = false;
  let detailMessage = '';

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      errorTitle = 'Không tìm thấy trang';
      errorDescription = 'Trang bạn đang truy cập không tồn tại hoặc đã được chuyển sang địa chỉ mới.';
    } else {
      errorTitle = `Lỗi hệ thống (${error.status})`;
      errorDescription = error.statusText || 'Đã có lỗi xảy ra trong quá trình xử lý yêu cầu.';
    }
    detailMessage = error.data?.message || JSON.stringify(error.data) || '';
  } else if (error instanceof Error) {
    const msg = error.message || '';
    if (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('error loading dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      error.name === 'ChunkLoadError'
    ) {
      isDynamicImport = true;
      errorTitle = 'Ứng dụng đã có phiên bản mới!';
      errorDescription =
        'Hệ thống vừa được nâng cấp lên phiên bản mới nhất. Hãy bấm "Tải lại ứng dụng" để cập nhật ngay.';
    } else {
      errorTitle = 'Đã xảy ra sự cố không mong muốn';
      errorDescription = 'Ứng dụng gặp sự cố khi hiển thị nội dung này. Bạn có thể tải lại hoặc quay về trang chủ.';
    }
    detailMessage = `${error.name}: ${error.message}\n${error.stack || ''}`;
  } else if (typeof error === 'string') {
    detailMessage = error;
  }

  const handleReload = () => {
    // Clear chunk cache timestamp and hard reload
    try {
      sessionStorage.removeItem('chunk_reload_timestamp');
      sessionStorage.removeItem('vite_preload_error_reload');
    } catch {
      // Ignore sessionStorage issues
    }
    window.location.reload();
  };

  const handleGoHome = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/80 p-6 sm:p-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Icon & Badge */}
        <div className="relative mx-auto w-20 h-20 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shadow-inner">
          {isDynamicImport ? (
            <Sparkles className="w-10 h-10 text-emerald-600 animate-pulse" />
          ) : (
            <AlertTriangle className="w-10 h-10 text-amber-500" />
          )}
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
            {errorTitle}
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            {errorDescription}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            onClick={handleReload}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-md shadow-emerald-700/20 gap-2 h-11"
          >
            <RefreshCw className="w-4 h-4" />
            Tải lại ứng dụng
          </Button>

          <Button
            onClick={handleGoHome}
            variant="outline"
            className="flex-1 border-slate-200 hover:bg-slate-100 text-slate-700 font-medium gap-2 h-11"
          >
            <Home className="w-4 h-4" />
            Về trang chủ
          </Button>
        </div>

        {/* Technical Details Toggle */}
        {detailMessage && (
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-slate-400 hover:text-slate-600 inline-flex items-center gap-1 transition-colors"
            >
              Chi tiết kỹ thuật
              {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showDetails && (
              <pre className="mt-3 p-3 bg-slate-900 text-slate-200 rounded-lg text-left text-xs font-mono overflow-x-auto max-h-48 whitespace-pre-wrap break-words">
                {detailMessage}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default RouteErrorBoundary;

