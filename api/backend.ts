import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes, pbkdf2Sync, timingSafeEqual, randomUUID } from "node:crypto";
import * as jose from "jose";
import postgres from "postgres";

type JwtUser = { userId: string; username: string; role: "admin" | "duty_editor" | "viewer" };

let client: ReturnType<typeof postgres> | null = null;

function getSql() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("POSTGRES_URL or DATABASE_URL is not set");
  if (!client) {
    client = postgres(url, { max: 1, idle_timeout: 20, connect_timeout: 10 });
  }
  return client;
}

function getJwtSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET must be set (min 16 chars)");
  return new TextEncoder().encode(s);
}

async function signUserToken(user: JwtUser): Promise<string> {
  return new jose.SignJWT({ u: user.username, r: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(getJwtSecret());
}

async function verifyUserToken(token: string): Promise<JwtUser | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getJwtSecret());
    const sub = payload.sub;
    const u = (payload as any).u;
    const r = (payload as any).r;
    if (typeof sub !== "string" || typeof u !== "string" || typeof r !== "string") return null;
    if (r !== "admin" && r !== "duty_editor" && r !== "viewer") return null;
    return { userId: sub, username: u, role: r };
  } catch {
    return null;
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
  return `pbkdf2:${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  if (!stored.startsWith("pbkdf2:")) return false;
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const [, saltHex, hashHex] = parts;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const hash = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
    if (expected.length !== hash.length) return false;
    return timingSafeEqual(expected, hash);
  } catch {
    return false;
  }
}

function isAdmin(user: JwtUser | null): boolean {
  return user?.role === "admin";
}

async function parseUser(authHeader: string | undefined): Promise<JwtUser | null> {
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer) return null;
  return verifyUserToken(bearer);
}

const STANDINGS_SETTINGS_KEY = "standings_state";

type Sql = ReturnType<typeof getSql>;

async function nextAssignmentSlot(sql: Sql, dutyPlaceId: string): Promise<number> {
  const rows = await sql<{ m: number }[]>`
    SELECT COALESCE(MAX(slot_index), -1) + 1 AS m FROM assignments WHERE duty_place_id = ${dutyPlaceId}::uuid
  `;
  return rows[0]?.m ?? 0;
}

async function handleOp(op: string, body: Record<string, unknown>, authHeader: string | undefined): Promise<unknown> {
  const sql = getSql();
  const user = await parseUser(authHeader);

  switch (op) {
    case "auth_public_config": {
      const rows = await sql`SELECT COUNT(*)::int AS c FROM app_accounts`;
      return { has_accounts: Number((rows as any)[0].c) > 0 };
    }

    case "auth_bootstrap": {
      const count = await sql`SELECT COUNT(*)::int AS c FROM app_accounts`;
      if (Number((count as any)[0].c) > 0) throw new Error("Accounts already exist");
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (username.length < 2) throw new Error("Username must be at least 2 characters");
      if (password.length < 8) throw new Error("Password must be at least 8 characters");
      const id = typeof body.id === "string" && body.id.length > 0 ? body.id : randomUUID();
      const hash = hashPassword(password);
      await sql`
        INSERT INTO app_accounts (id, username, password_hash, role)
        VALUES (${id}, ${username}, ${hash}, 'admin')
      `;
      const token = await signUserToken({ userId: id, username, role: "admin" });
      return { token, user: { userId: id, username, role: "admin" as const } };
    }

    case "auth_login": {
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");
      const rows = await sql<{ id: string; username: string; password_hash: string; role: string }[]>`
        SELECT id, username, password_hash, role FROM app_accounts WHERE username = ${username}
      `;
      const row = (rows as any)[0] as { id: string; username: string; password_hash: string; role: string } | undefined;
      if (!row || !verifyPassword(password, row.password_hash)) throw new Error("Invalid username or password");
      if (row.role !== "admin" && row.role !== "duty_editor" && row.role !== "viewer") throw new Error("Invalid role");
      const token = await signUserToken({ userId: row.id, username: row.username, role: row.role as JwtUser["role"] });
      return { token, user: { userId: row.id, username: row.username, role: row.role as JwtUser["role"] } };
    }

    case "auth_me": {
      if (!user) throw new Error("Unauthorized");
      return { userId: user.userId, username: user.username, role: user.role };
    }

    case "auth_accounts_list": {
      if (!isAdmin(user)) throw new Error("Forbidden");
      const rows = await sql<{ id: string; username: string; role: string }[]>`
        SELECT id, username, role FROM app_accounts ORDER BY username
      `;
      return { accounts: rows };
    }

    case "auth_account_add": {
      if (!isAdmin(user)) throw new Error("Forbidden");
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");
      const role = String(body.role || "");
      if (username.length < 2) throw new Error("Username must be at least 2 characters");
      if (password.length < 8) throw new Error("Password must be at least 8 characters");
      if (role !== "admin" && role !== "duty_editor" && role !== "viewer") throw new Error("Invalid role");
      const id = typeof body.id === "string" && body.id.length > 0 ? body.id : randomUUID();
      const hash = hashPassword(password);
      await sql`INSERT INTO app_accounts (id, username, password_hash, role) VALUES (${id}, ${username}, ${hash}, ${role})`;
      return { ok: true };
    }

    case "auth_account_remove": {
      if (!isAdmin(user)) throw new Error("Forbidden");
      const userId = String(body.userId || "");
      if (!userId) throw new Error("userId required");
      const admins = await sql`SELECT COUNT(*)::int AS c FROM app_accounts WHERE role = 'admin'`;
      const target = await sql<{ role: string }[]>`SELECT role FROM app_accounts WHERE id = ${userId}`;
      if (!(target as any)[0]) throw new Error("User not found");
      if ((target as any)[0].role === "admin" && Number((admins as any)[0].c) <= 1) throw new Error("Cannot remove the last admin");
      await sql`DELETE FROM app_accounts WHERE id = ${userId}`;
      return { ok: true };
    }

    case "auth_password_change": {
      if (!user) throw new Error("Unauthorized");
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");
      if (newPassword.length < 8) throw new Error("New password must be at least 8 characters");
      const rows = await sql<{ password_hash: string }[]>`SELECT password_hash FROM app_accounts WHERE id = ${user.userId}`;
      const row = (rows as any)[0] as { password_hash: string } | undefined;
      if (!row) throw new Error("Account not found");
      if (!verifyPassword(currentPassword, row.password_hash)) throw new Error("Current password is incorrect");
      const hash = hashPassword(newPassword);
      await sql`UPDATE app_accounts SET password_hash = ${hash} WHERE id = ${user.userId}`;
      return { ok: true };
    }

    case "workspace_load": {
      // Allow workspace reads even if not signed in (user asked to just make it work).
      const [prefects, sections, dutyPlaces, assignments, standings] = await Promise.all([
        sql`SELECT * FROM prefects WHERE active = true`,
        sql`SELECT * FROM sections`,
        sql`SELECT * FROM duty_places`,
        sql`SELECT * FROM assignments`,
        sql`SELECT value FROM settings WHERE key = ${STANDINGS_SETTINGS_KEY}`,
      ]);
      return {
        prefects,
        sections,
        duty_places: dutyPlaces,
        assignments,
        standings_value: (standings as any)[0]?.value ?? null,
      };
    }

    case "settings_upsert_standings": {
      const value = String(body.value ?? "");
      await sql`
        INSERT INTO settings (key, value, updated_at) VALUES (${STANDINGS_SETTINGS_KEY}, ${value}, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `;
      return { ok: true };
    }

    case "prefect_insert": {
      const row = (body.row || {}) as Record<string, unknown>;
      const rows = await sql`
        INSERT INTO prefects (name, reg_number, grade, gender, role)
        VALUES (${String(row.name)}, ${String(row.reg_number)}, ${Number(row.grade)}, ${String(row.gender)}, ${String(row.role)}::prefect_role)
        RETURNING *
      `;
      return (rows as any)[0];
    }

    case "prefect_update": {
      const id = String(body.id || "");
      const u = (body.updates || {}) as Record<string, unknown>;
      if (!id) throw new Error("id required");
      const patch: Record<string, unknown> = {};
      if (u.name !== undefined) patch.name = u.name;
      if (u.reg_number !== undefined) patch.reg_number = u.reg_number;
      if (u.grade !== undefined) patch.grade = u.grade;
      if (u.gender !== undefined) patch.gender = u.gender;
      if (u.role !== undefined) patch.role = u.role;
      if (Object.keys(patch).length === 0) return { ok: true };
      const keys = Object.keys(patch) as ("name" | "reg_number" | "grade" | "gender" | "role")[];
      await sql`UPDATE prefects SET ${sql(patch, ...keys)} WHERE id = ${id}::uuid`;
      return { ok: true };
    }

    case "prefect_deactivate": {
      const id = String(body.id || "");
      await sql`UPDATE prefects SET active = false WHERE id = ${id}::uuid`;
      return { ok: true };
    }

    case "prefect_batch_insert": {
      const rowsIn = (body.rows as Record<string, unknown>[]) || [];
      const out: unknown[] = [];
      for (const r of rowsIn) {
        const rows = await sql`
          INSERT INTO prefects (name, reg_number, grade, gender, role)
          VALUES (${String(r.name)}, ${String(r.reg_number)}, ${Number(r.grade)}, ${String(r.gender)}, ${String(r.role)}::prefect_role)
          RETURNING *
        `;
        out.push((rows as any)[0]);
      }
      return { rows: out };
    }

    case "section_insert": {
      const name = String(body.name || "").trim();
      const rows = await sql`INSERT INTO sections (name) VALUES (${name}) RETURNING id, name, head_prefect_id, co_head_prefect_id`;
      return (rows as any)[0];
    }

    case "section_delete": {
      const id = String(body.id || "");
      const dpRows = await sql<{ id: string }[]>`SELECT id FROM duty_places WHERE section_id = ${id}::uuid`;
      for (const d of dpRows as any[]) {
        await sql`DELETE FROM assignments WHERE duty_place_id = ${(d as any).id}::uuid`;
        await sql`DELETE FROM duty_places WHERE id = ${(d as any).id}::uuid`;
      }
      await sql`UPDATE sections SET head_prefect_id = NULL, co_head_prefect_id = NULL WHERE id = ${id}::uuid`;
      await sql`DELETE FROM sections WHERE id = ${id}::uuid`;
      return { ok: true };
    }

    case "section_rename": {
      const id = String(body.id || "");
      const name = String(body.name || "");
      await sql`UPDATE sections SET name = ${name} WHERE id = ${id}::uuid`;
      return { ok: true };
    }

    case "section_set_head": {
      const sid = String(body.sectionId || "");
      const raw = (body as any).prefectId;
      if (raw === null || raw === undefined || raw === "") await sql`UPDATE sections SET head_prefect_id = NULL WHERE id = ${sid}::uuid`;
      else await sql`UPDATE sections SET head_prefect_id = ${String(raw)}::uuid WHERE id = ${sid}::uuid`;
      return { ok: true };
    }

    case "section_set_co_head": {
      const sid = String(body.sectionId || "");
      const raw = (body as any).prefectId;
      if (raw === null || raw === undefined || raw === "") await sql`UPDATE sections SET co_head_prefect_id = NULL WHERE id = ${sid}::uuid`;
      else await sql`UPDATE sections SET co_head_prefect_id = ${String(raw)}::uuid WHERE id = ${sid}::uuid`;
      return { ok: true };
    }

    case "duty_insert": {
      const b = body as Record<string, unknown>;
      const rows = await sql`
        INSERT INTO duty_places (
          name, section_id, type, mandatory_slots, max_prefects,
          required_gender_balance, gender_requirement, grade_requirement, same_grade_if_multiple
        )
        VALUES (
          ${String(b.name)},
          ${(b as any).section_id ? String((b as any).section_id) : null},
          ${String((b as any).type)}::duty_place_type,
          ${Number((b as any).mandatory_slots)},
          ${Number((b as any).max_prefects)},
          ${Boolean((b as any).required_gender_balance)},
          ${(b as any).gender_requirement == null || (b as any).gender_requirement === "" ? null : String((b as any).gender_requirement)},
          ${(b as any).grade_requirement == null || (b as any).grade_requirement === "" ? null : String((b as any).grade_requirement)},
          ${Boolean((b as any).same_grade_if_multiple)}
        )
        RETURNING *
      `;
      return (rows as any)[0];
    }

    case "duty_batch_insert": {
      const rowsIn = (body.rows as Record<string, unknown>[]) || [];
      const out: unknown[] = [];
      for (const r of rowsIn) {
        const rows = await sql`
          INSERT INTO duty_places (
            name, section_id, type, mandatory_slots, max_prefects,
            required_gender_balance, gender_requirement, grade_requirement, same_grade_if_multiple
          )
          VALUES (
            ${String((r as any).name)},
            ${(r as any).section_id ? String((r as any).section_id) : null},
            ${String((r as any).type)}::duty_place_type,
            ${Number((r as any).mandatory_slots)},
            ${Number((r as any).max_prefects)},
            ${Boolean((r as any).required_gender_balance)},
            ${(r as any).gender_requirement == null || (r as any).gender_requirement === "" ? null : String((r as any).gender_requirement)},
            ${(r as any).grade_requirement == null || (r as any).grade_requirement === "" ? null : String((r as any).grade_requirement)},
            ${Boolean((r as any).same_grade_if_multiple)}
          )
          RETURNING *
        `;
        out.push((rows as any)[0]);
      }
      return { rows: out };
    }

    case "duty_update": {
      const id = String(body.id || "");
      const u = (body.updates || {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      if (u.name !== undefined) patch.name = u.name;
      if ((u as any).section_id !== undefined) patch.section_id = (u as any).section_id;
      if ((u as any).type !== undefined) patch.type = (u as any).type;
      if ((u as any).mandatory_slots !== undefined) patch.mandatory_slots = (u as any).mandatory_slots;
      if ((u as any).max_prefects !== undefined) patch.max_prefects = (u as any).max_prefects;
      if ((u as any).required_gender_balance !== undefined) patch.required_gender_balance = (u as any).required_gender_balance;
      if ((u as any).gender_requirement !== undefined) patch.gender_requirement = (u as any).gender_requirement;
      if ((u as any).grade_requirement !== undefined) patch.grade_requirement = (u as any).grade_requirement;
      if ((u as any).same_grade_if_multiple !== undefined) patch.same_grade_if_multiple = (u as any).same_grade_if_multiple;
      if (Object.keys(patch).length === 0) return { ok: true };
      const keys = Object.keys(patch) as any[];
      await sql`UPDATE duty_places SET ${sql(patch, ...keys)} WHERE id = ${id}::uuid`;
      return { ok: true };
    }

    case "duty_delete": {
      const id = String(body.id || "");
      await sql`DELETE FROM assignments WHERE duty_place_id = ${id}::uuid`;
      await sql`DELETE FROM duty_places WHERE id = ${id}::uuid`;
      return { ok: true };
    }

    case "assignment_insert": {
      const id = String(body.id || "");
      const prefect_id = String((body as any).prefect_id || "");
      const duty_place_id = String((body as any).duty_place_id || "");
      const assigned_by = String((body as any).assigned_by || "manual");
      const slot = await nextAssignmentSlot(sql, duty_place_id);
      await sql`
        INSERT INTO assignments (id, prefect_id, duty_place_id, slot_index, assigned_by)
        VALUES (${id}::uuid, ${prefect_id}::uuid, ${duty_place_id}::uuid, ${slot}, ${assigned_by}::assignment_method)
      `;
      return { ok: true };
    }

    case "assignment_delete": {
      const id = String(body.id || "");
      await sql`DELETE FROM assignments WHERE id = ${id}::uuid`;
      return { ok: true };
    }

    case "assignments_clear_all": {
      await sql`DELETE FROM assignments`;
      await sql`UPDATE sections SET head_prefect_id = NULL, co_head_prefect_id = NULL`;
      return { ok: true };
    }

    case "assignments_delete_ids": {
      const ids = ((body as any).ids as string[]) || [];
      for (const aid of ids) await sql`DELETE FROM assignments WHERE id = ${aid}::uuid`;
      return { ok: true };
    }

    case "section_clear_co_head": {
      const sid = String((body as any).sectionId || "");
      await sql`UPDATE sections SET co_head_prefect_id = NULL WHERE id = ${sid}::uuid`;
      return { ok: true };
    }

    case "section_clear_head": {
      const sid = String((body as any).sectionId || "");
      await sql`UPDATE sections SET head_prefect_id = NULL WHERE id = ${sid}::uuid`;
      return { ok: true };
    }

    default:
      throw new Error(`Unknown op: ${op}`);
  }
}

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
