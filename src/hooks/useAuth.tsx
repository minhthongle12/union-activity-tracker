import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

// ============================================================
// Types
// ============================================================

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  /** Đăng nhập bằng username & password */
  login: (username: string, password: string) => Promise<void>;
  /** Đăng xuất */
  logout: () => Promise<void>;
}

// ============================================================
// Context
// ============================================================

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ============================================================
// Provider
// ============================================================

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Không thể tải hồ sơ người dùng:', error.message);
    return null;
  }

  return data as Profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    profile: null,
    isLoading: true,
  });

  // ── Bootstrap: restore session & listen for auth changes ──
  useEffect(() => {
    let mounted = true;

    // 1. Get current session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;

      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        if (mounted) {
          setState({ session, profile, isLoading: false });
        }
      } else {
        setState({ session: null, profile: null, isLoading: false });
      }
    });

    // 2. Listen for auth state changes (token refresh, sign-out, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !session) {
        setState({ session: null, profile: null, isLoading: false });
        return;
      }

      // On sign-in or token refresh, fetch profile
      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'INITIAL_SESSION'
      ) {
        const profile = session.user
          ? await fetchProfile(session.user.id)
          : null;
        if (mounted) {
          setState({ session, profile, isLoading: false });
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ── Login ──
  const login = useCallback(async (username: string, password: string) => {
    const normalizedUsername = username.trim().toLowerCase();

    // Attempt 1: Call Supabase Edge Function for username-based login
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'auth-login',
        {
          body: { username: normalizedUsername, password },
        },
      );

      if (!fnError && fnData?.access_token) {
        // Set session from Edge Function response
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: fnData.access_token,
          refresh_token: fnData.refresh_token,
        });

        if (!sessionError) return;
        // If setSession failed, fall through to fallback
      }
    } catch {
      // Edge Function not available – fall through to fallback
    }

    // Attempt 2: Fallback to email-based auth using username@union.internal
    const email = `${normalizedUsername}@union.internal`;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(mapAuthError(error));
    }
  }, []);

  // ── Logout ──
  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Lỗi khi đăng xuất:', error.message);
    }
  }, []);

  // ── Context value ──
  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
    }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================
// Hook
// ============================================================

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth phải được sử dụng bên trong AuthProvider');
  }
  return context;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Dịch lỗi Supabase Auth sang thông báo chung chung
 * để không tiết lộ username có tồn tại hay không.
 */
function mapAuthError(_error: AuthError): string {
  // Intentionally vague to prevent username enumeration
  return 'Tên đăng nhập hoặc mật khẩu không đúng.';
}
