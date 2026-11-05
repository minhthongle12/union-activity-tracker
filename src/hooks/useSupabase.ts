import { supabase } from '@/lib/supabase';

/**
 * Hook đơn giản trả về instance Supabase client.
 * Tiện dùng trong các component cần truy vấn trực tiếp.
 */
export function useSupabase() {
  return supabase;
}
