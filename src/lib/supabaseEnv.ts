/** True when Vite env points at a Supabase project (cloud sync possible). */
export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return typeof url === 'string' && url.trim().length > 0 && typeof key === 'string' && key.trim().length > 0;
}
