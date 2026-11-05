import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

interface LoadingContextValue {
  isLoading: boolean;
  loadingMessage: string;
  startLoading: (message?: string) => void;
  stopLoading: () => void;
  withLoading: <T>(fn: () => Promise<T>, message?: string) => Promise<T>;
}

const LoadingContext = createContext<LoadingContextValue | undefined>(undefined);

function GlobalLoadingOverlay({ show, message }: { show: boolean; message: string }) {
  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] pointer-events-auto flex items-center justify-center animate-in fade-in duration-200"
      role="status"
      aria-live="polite"
    >
      {/* Top progress line running smoothly across the top */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 animate-pulse z-[100000]" />

      {/* Light subtle backdrop overlay */}
      <div className="absolute inset-0 bg-white/50 dark:bg-slate-950/50 backdrop-blur-[1.5px] transition-all" />

      {/* Center status pill */}
      <div className="relative z-10 flex items-center gap-3 px-5 py-3 rounded-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xl shadow-slate-900/10 animate-in zoom-in-95 duration-150">
        <Loader2 className="h-5 w-5 text-blue-600 animate-spin shrink-0" />
        <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 tracking-wide select-none">
          {message}
        </span>
      </div>
    </div>
  );
}

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [manualCount, setManualCount] = useState(0);
  const [customMessage, setCustomMessage] = useState<string>('');

  // Automatically track any TanStack React Query mutations in flight across the app
  const mutatingCount = useIsMutating();

  const startLoading = useCallback((message?: string) => {
    if (message) setCustomMessage(message);
    setManualCount((prev) => prev + 1);
  }, []);

  const stopLoading = useCallback(() => {
    setManualCount((prev) => {
      const next = Math.max(0, prev - 1);
      if (next === 0) setCustomMessage('');
      return next;
    });
  }, []);

  const withLoading = useCallback(
    async <T,>(fn: () => Promise<T>, message?: string): Promise<T> => {
      startLoading(message);
      try {
        return await fn();
      } finally {
        stopLoading();
      }
    },
    [startLoading, stopLoading]
  );

  const isLoading = manualCount > 0 || mutatingCount > 0;
  const message =
    customMessage ||
    (mutatingCount > 0 ? 'Đang gửi dữ liệu lên máy chủ...' : 'Đang xử lý...');

  const value = useMemo(
    () => ({
      isLoading,
      loadingMessage: message,
      startLoading,
      stopLoading,
      withLoading,
    }),
    [isLoading, message, startLoading, stopLoading, withLoading]
  );

  return (
    <LoadingContext.Provider value={value}>
      {children}
      <GlobalLoadingOverlay show={isLoading} message={message} />
    </LoadingContext.Provider>
  );
}

export function useGlobalLoading(): LoadingContextValue {
  const context = useContext(LoadingContext);
  if (!context) {
    return {
      isLoading: false,
      loadingMessage: '',
      startLoading: () => {},
      stopLoading: () => {},
      withLoading: async <T,>(fn: () => Promise<T>) => fn(),
    };
  }
  return context;
}

