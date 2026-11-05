import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, X, Share, PlusSquare, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // 1. Check if already installed / running in standalone PWA mode
    const isStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes("android-app://");

    setIsStandalone(isStandaloneMode);
    if (isStandaloneMode) return;

    // 2. Check if user dismissed recently (within 5 days)
    const dismissedAt = localStorage.getItem("pwa_install_dismissed_at");
    if (dismissedAt) {
      const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
      if (Date.now() - Number(dismissedAt) < fiveDaysMs) {
        return;
      }
    }

    // 3. Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    const isSafari =
      userAgent.includes("safari") &&
      !userAgent.includes("crios") &&
      !userAgent.includes("fxios");

    if (isIosDevice && isSafari && !isStandaloneMode) {
      setIsIOS(true);
      // Delay showing on iOS so it doesn't interrupt initial page load
      const timer = setTimeout(() => setShowPrompt(true), 2500);
      return () => clearTimeout(timer);
    }

    // 4. Android / Chrome / Chromium `beforeinstallprompt`
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Wait a moment before showing
      setTimeout(() => setShowPrompt(true), 2000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa_install_dismissed_at", Date.now().toString());
  };

  if (isStandalone || !showPrompt) return null;

  return (
    <div className="fixed bottom-16 md:bottom-5 left-3 right-3 sm:left-auto sm:right-5 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-slate-700/80 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 shadow-md">
              <img
                src="/huy-hieu-doan.png"
                alt="Huy hiệu Đoàn"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-white flex items-center gap-1.5">
                Cài đặt ứng dụng Công tác Đoàn
              </h4>
              <p className="text-xs text-slate-300 mt-0.5 line-clamp-2">
                Trải nghiệm mượt mà như app gốc, mở nhanh và nhận thông báo tức thì.
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
            title="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Action content */}
        {isIOS ? (
          <div className="bg-slate-800/90 rounded-xl p-2.5 text-xs text-slate-200 border border-slate-700/50 space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium text-blue-300">
              <Smartphone className="h-3.5 w-3.5" /> Hướng dẫn cài trên iPhone/iPad:
            </div>
            <div className="text-[11px] leading-relaxed text-slate-300 pl-5 space-y-1">
              <p className="flex items-center gap-1">
                1. Bấm nút <b>Chia sẻ</b> (<Share className="h-3 w-3 inline text-blue-400" />) ở thanh dưới Safari.
              </p>
              <p className="flex items-center gap-1">
                2. Cuộn xuống chọn <b>"Thêm vào MH chính"</b> (<PlusSquare className="h-3 w-3 inline text-emerald-400" /> Add to Home Screen).
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="text-xs text-slate-400 hover:text-white hover:bg-slate-800 h-8 px-3"
            >
              Để sau
            </Button>
            <Button
              size="sm"
              onClick={handleInstallClick}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-3.5 gap-1.5 shadow-md font-medium"
            >
              <Download className="h-3.5 w-3.5" />
              Cài đặt ngay
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

