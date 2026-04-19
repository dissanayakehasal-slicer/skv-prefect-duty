/** Empty string = same origin (Vercel deployment). Override for local dev pointing at `vercel dev`. */
export function getApiBase(): string {
  return import.meta.env.VITE_API_BASE_URL ?? '';
}
