import { getApiJwt, getBackendUrl } from "@/lib/backendEnv";

export async function backendRpc<T = unknown>(
  op: string,
  payload: Record<string, unknown> = {},
  token?: string | null,
): Promise<T> {
  const t = token === undefined ? getApiJwt() : token;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(getBackendUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify({ op, ...payload }),
  });
  let json: { ok?: boolean; data?: T; error?: string };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    const bodyText = await res.text().catch(() => "");
    const snippet = bodyText.slice(0, 160).trim();
    throw new Error(
      snippet
        ? `Invalid server response (${res.status}): ${snippet}`
        : `Invalid server response (${res.status})`,
    );
  }
  if (!json.ok) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return json.data as T;
}
