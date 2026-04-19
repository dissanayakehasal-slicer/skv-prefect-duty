import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleOp } from "./lib/ops";

function setCors(res: VercelResponse, origin?: string) {
  const o = origin && origin !== "" ? origin : "*";
  res.setHeader("Access-Control-Allow-Origin", o);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req.headers.origin as string | undefined);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = typeof req.body === "string" ? (JSON.parse(req.body) as Record<string, unknown>) : (req.body as Record<string, unknown>) || {};
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON" });
  }

  const op = String(body.op || "");
  if (!op) {
    return res.status(400).json({ ok: false, error: "Missing op" });
  }

  try {
    const data = await handleOp(op, body, req.headers.authorization);
    return res.status(200).json({ ok: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    const code = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 400;
    return res.status(code).json({ ok: false, error: msg });
  }
}

export const config = {
  runtime: "nodejs",
};
