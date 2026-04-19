const JWT_KEY = "skv_api_jwt_v1";

/** Same-origin `/api/backend` on Vercel; override for unusual setups. */
export function getBackendUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (typeof base === "string" && base.trim() !== "") {
    return base.replace(/\/$/, "");
  }
  return "/api/backend";
}

/**
 * Use Vercel Postgres + `/api/backend` (default on).
 * Set `VITE_USE_VERCEL_DB=false` for fully offline / browser-only mode during local dev.
 */
export function useVercelPostgresBackend(): boolean {
  return import.meta.env.VITE_USE_VERCEL_DB !== "false";
}

/** `vercel` when the app should call the API; `null` for offline-only builds. */
export function cloudSyncMode(): "vercel" | null {
  return useVercelPostgresBackend() ? "vercel" : null;
}

/** True when the production cloud API is enabled (same as `useVercelPostgresBackend`). */
export function isCloudBackendConfigured(): boolean {
  return useVercelPostgresBackend();
}

export function getApiJwt(): string | null {
  try {
    return sessionStorage.getItem(JWT_KEY);
  } catch {
    return null;
  }
}

export function setApiJwt(token: string | null) {
  try {
    if (!token) sessionStorage.removeItem(JWT_KEY);
    else sessionStorage.setItem(JWT_KEY, token);
  } catch {
    /* ignore */
  }
}
