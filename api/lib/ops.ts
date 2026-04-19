import { randomUUID } from "node:crypto";
import type { JwtUser } from "./jwt.js";
import { signUserToken, verifyUserToken } from "./jwt.js";
import { getSql } from "./db.js";
import { hashPassword, verifyPassword } from "./passwordNode.js";
import { canMutateData, isAdmin } from "./authz.js";

const STANDINGS_SETTINGS_KEY = "standings_state";

type Sql = ReturnType<typeof getSql>;

type Ctx = { user: JwtUser | null; sql: Sql };

async function nextAssignmentSlot(sql: Sql, dutyPlaceId: string): Promise<number> {
  const rows = await sql<{ m: number }[]>`
    SELECT COALESCE(MAX(slot_index), -1) + 1 AS m FROM assignments WHERE duty_place_id = ${dutyPlaceId}::uuid
  `;
  return rows[0]?.m ?? 0;
}

function parseUser(authHeader: string | undefined): Promise<JwtUser | null> {
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer) return Promise.resolve(null);
  return verifyUserToken(bearer);
}

export async function handleOp(
  op: string,
  body: Record<string, unknown>,
  authHeader: string | undefined,
): Promise<unknown> {
  const sql = getSql();
  const user = await parseUser(authHeader);
  const ctx: Ctx = { user, sql };

  switch (op) {
    case "auth_public_config": {
      const rows = await sql`SELECT COUNT(*)::int AS c FROM app_accounts`;
      return { has_accounts: Number(rows[0].c) > 0 };
    }

    case "auth_bootstrap": {
      const count = await sql`SELECT COUNT(*)::int AS c FROM app_accounts`;
      if (Number(count[0].c) > 0) throw new Error("Accounts already exist");
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
      const row = rows[0];
      if (!row || !verifyPassword(password, row.password_hash)) {
        throw new Error("Invalid username or password");
      }
      if (row.role !== "admin" && row.role !== "duty_editor" && row.role !== "viewer") {
        throw new Error("Invalid role");
      }
      const token = await signUserToken({
        userId: row.id,
        username: row.username,
        role: row.role as JwtUser["role"],
      });
      return {
        token,
        user: { userId: row.id, username: row.username, role: row.role as JwtUser["role"] },
      };
    }

    case "auth_me": {
      if (!ctx.user) throw new Error("Unauthorized");
      return {
        userId: ctx.user.userId,
        username: ctx.user.username,
        role: ctx.user.role,
      };
    }

    case "auth_accounts_list": {
      if (!isAdmin(ctx.user)) throw new Error("Forbidden");
      const rows = await sql<{ id: string; username: string; role: string }[]>`
        SELECT id, username, role FROM app_accounts ORDER BY username
      `;
      return { accounts: rows };
    }

    case "auth_account_add": {
      if (!isAdmin(ctx.user)) throw new Error("Forbidden");
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");
      const role = String(body.role || "");
      if (username.length < 2) throw new Error("Username must be at least 2 characters");
      if (password.length < 8) throw new Error("Password must be at least 8 characters");
      if (role !== "admin" && role !== "duty_editor" && role !== "viewer") throw new Error("Invalid role");
      const id = typeof body.id === "string" && body.id.length > 0 ? body.id : randomUUID();
      const hash = hashPassword(password);
      await sql`
        INSERT INTO app_accounts (id, username, password_hash, role)
        VALUES (${id}, ${username}, ${hash}, ${role})
      `;
      return { ok: true };
    }

    case "auth_account_remove": {
      if (!isAdmin(ctx.user)) throw new Error("Forbidden");
      const userId = String(body.userId || "");
      if (!userId) throw new Error("userId required");
      const admins = await sql`SELECT COUNT(*)::int AS c FROM app_accounts WHERE role = 'admin'`;
      const target = await sql<{ role: string }[]>`
        SELECT role FROM app_accounts WHERE id = ${userId}
      `;
      if (!target[0]) throw new Error("User not found");
      if (target[0].role === "admin" && Number(admins[0].c) <= 1) {
        throw new Error("Cannot remove the last admin");
      }
      await sql`DELETE FROM app_accounts WHERE id = ${userId}`;
      return { ok: true };
    }

    case "auth_password_change": {
      if (!ctx.user) throw new Error("Unauthorized");
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");
      if (newPassword.length < 8) throw new Error("New password must be at least 8 characters");
      const rows = await sql<{ password_hash: string }[]>`
        SELECT password_hash FROM app_accounts WHERE id = ${ctx.user.userId}
      `;
      const row = rows[0];
      if (!row) throw new Error("Account not found");
      if (!verifyPassword(currentPassword, row.password_hash)) {
        throw new Error("Current password is incorrect");
      }
      const hash = hashPassword(newPassword);
      await sql`UPDATE app_accounts SET password_hash = ${hash} WHERE id = ${ctx.user.userId}`;
      return { ok: true };
    }

    case "workspace_load": {
      if (!ctx.user) throw new Error("Unauthorized");
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
        standings_value: standings[0]?.value ?? null,
      };
    }

    case "settings_upsert_standings": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const value = String(body.value ?? "");
      await sql`
        INSERT INTO settings (key, value, updated_at) VALUES (${STANDINGS_SETTINGS_KEY}, ${value}, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `;
      return { ok: true };
    }

    case "prefect_insert": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const row = body.row as Record<string, unknown>;
      const rows = await sql`
        INSERT INTO prefects (name, reg_number, grade, gender, role)
        VALUES (
          ${String(row.name)},
          ${String(row.reg_number)},
          ${Number(row.grade)},
          ${String(row.gender)},
          ${String(row.role)}::prefect_role
        )
        RETURNING *
      `;
      return rows[0];
    }

    case "prefect_update": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const id = String(body.id || "");
      const u = body.updates as Record<string, unknown>;
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
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const id = String(body.id || "");
      await sql`UPDATE prefects SET active = false WHERE id = ${id}::uuid`;
      return { ok: true };
    }

    case "prefect_batch_insert": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const rowsIn = (body.rows as Record<string, unknown>[]) || [];
      const out: unknown[] = [];
      for (const r of rowsIn) {
        const rows = await sql`
          INSERT INTO prefects (name, reg_number, grade, gender, role)
          VALUES (
            ${String(r.name)},
            ${String(r.reg_number)},
            ${Number(r.grade)},
            ${String(r.gender)},
            ${String(r.role)}::prefect_role
          )
          RETURNING *
        `;
        out.push(rows[0]);
      }
      return { rows: out };
    }

    case "section_insert": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const name = String(body.name || "").trim();
      const rows = await sql`
        INSERT INTO sections (name) VALUES (${name})
        RETURNING id, name, head_prefect_id, co_head_prefect_id
      `;
      return rows[0];
    }

    case "section_delete": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const id = String(body.id || "");
      const dpRows = await sql<{ id: string }[]>`
        SELECT id FROM duty_places WHERE section_id = ${id}::uuid
      `;
      for (const d of dpRows) {
        await sql`DELETE FROM assignments WHERE duty_place_id = ${d.id}::uuid`;
        await sql`DELETE FROM duty_places WHERE id = ${d.id}::uuid`;
      }
      await sql`
        UPDATE sections SET head_prefect_id = NULL, co_head_prefect_id = NULL WHERE id = ${id}::uuid
      `;
      await sql`DELETE FROM sections WHERE id = ${id}::uuid`;
      return { ok: true };
    }

    case "section_rename": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const id = String(body.id || "");
      const name = String(body.name || "");
      await sql`UPDATE sections SET name = ${name} WHERE id = ${id}::uuid`;
      return { ok: true };
    }

    case "section_set_head": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const sid = String(body.sectionId || "");
      const raw = body.prefectId;
      if (raw === null || raw === undefined || raw === "") {
        await sql`UPDATE sections SET head_prefect_id = NULL WHERE id = ${sid}::uuid`;
      } else {
        await sql`UPDATE sections SET head_prefect_id = ${String(raw)}::uuid WHERE id = ${sid}::uuid`;
      }
      return { ok: true };
    }

    case "section_set_co_head": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const sid = String(body.sectionId || "");
      const raw = body.prefectId;
      if (raw === null || raw === undefined || raw === "") {
        await sql`UPDATE sections SET co_head_prefect_id = NULL WHERE id = ${sid}::uuid`;
      } else {
        await sql`UPDATE sections SET co_head_prefect_id = ${String(raw)}::uuid WHERE id = ${sid}::uuid`;
      }
      return { ok: true };
    }

    case "duty_insert": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const b = body as Record<string, unknown>;
      const rows = await sql`
        INSERT INTO duty_places (
          name, section_id, type, mandatory_slots, max_prefects,
          required_gender_balance, gender_requirement, grade_requirement, same_grade_if_multiple
        )
        VALUES (
          ${String(b.name)},
          ${b.section_id ? String(b.section_id) : null},
          ${String(b.type)}::duty_place_type,
          ${Number(b.mandatory_slots)},
          ${Number(b.max_prefects)},
          ${Boolean(b.required_gender_balance)},
          ${b.gender_requirement == null || b.gender_requirement === "" ? null : String(b.gender_requirement)},
          ${b.grade_requirement == null || b.grade_requirement === "" ? null : String(b.grade_requirement)},
          ${Boolean(b.same_grade_if_multiple)}
        )
        RETURNING *
      `;
      return rows[0];
    }

    case "duty_batch_insert": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const rowsIn = (body.rows as Record<string, unknown>[]) || [];
      const out: unknown[] = [];
      for (const r of rowsIn) {
        const rows = await sql`
          INSERT INTO duty_places (
            name, section_id, type, mandatory_slots, max_prefects,
            required_gender_balance, gender_requirement, grade_requirement, same_grade_if_multiple
          )
          VALUES (
            ${String(r.name)},
            ${r.section_id ? String(r.section_id) : null},
            ${String(r.type)}::duty_place_type,
            ${Number(r.mandatory_slots)},
            ${Number(r.max_prefects)},
            ${Boolean(r.required_gender_balance)},
            ${r.gender_requirement == null || r.gender_requirement === "" ? null : String(r.gender_requirement)},
            ${r.grade_requirement == null || r.grade_requirement === "" ? null : String(r.grade_requirement)},
            ${Boolean(r.same_grade_if_multiple)}
          )
          RETURNING *
        `;
        out.push(rows[0]);
      }
      return { rows: out };
    }

    case "duty_update": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const id = String(body.id || "");
      const u = body.updates as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      if (u.name !== undefined) patch.name = u.name;
      if (u.section_id !== undefined) patch.section_id = u.section_id;
      if (u.type !== undefined) patch.type = u.type;
      if (u.mandatory_slots !== undefined) patch.mandatory_slots = u.mandatory_slots;
      if (u.max_prefects !== undefined) patch.max_prefects = u.max_prefects;
      if (u.required_gender_balance !== undefined) patch.required_gender_balance = u.required_gender_balance;
      if (u.gender_requirement !== undefined) patch.gender_requirement = u.gender_requirement;
      if (u.grade_requirement !== undefined) patch.grade_requirement = u.grade_requirement;
      if (u.same_grade_if_multiple !== undefined) patch.same_grade_if_multiple = u.same_grade_if_multiple;
      if (Object.keys(patch).length === 0) return { ok: true };
      const keys = Object.keys(patch) as (
        | "name"
        | "section_id"
        | "type"
        | "mandatory_slots"
        | "max_prefects"
        | "required_gender_balance"
        | "gender_requirement"
        | "grade_requirement"
        | "same_grade_if_multiple"
      )[];
      await sql`UPDATE duty_places SET ${sql(patch, ...keys)} WHERE id = ${id}::uuid`;
      return { ok: true };
    }

    case "duty_delete": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const id = String(body.id || "");
      await sql`DELETE FROM assignments WHERE duty_place_id = ${id}::uuid`;
      await sql`DELETE FROM duty_places WHERE id = ${id}::uuid`;
      return { ok: true };
    }

    case "assignment_insert": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const id = String(body.id || "");
      const prefect_id = String(body.prefect_id || "");
      const duty_place_id = String(body.duty_place_id || "");
      const assigned_by = String(body.assigned_by || "manual");
      const slot = await nextAssignmentSlot(ctx.sql, duty_place_id);
      await sql`
        INSERT INTO assignments (id, prefect_id, duty_place_id, slot_index, assigned_by)
        VALUES (${id}::uuid, ${prefect_id}::uuid, ${duty_place_id}::uuid, ${slot}, ${assigned_by}::assignment_method)
      `;
      return { ok: true };
    }

    case "assignment_delete": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const id = String(body.id || "");
      await sql`DELETE FROM assignments WHERE id = ${id}::uuid`;
      return { ok: true };
    }

    case "assignments_clear_all": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      await sql`DELETE FROM assignments`;
      await sql`UPDATE sections SET head_prefect_id = NULL, co_head_prefect_id = NULL`;
      return { ok: true };
    }

    case "assignments_delete_ids": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const ids = (body.ids as string[]) || [];
      for (const aid of ids) {
        await sql`DELETE FROM assignments WHERE id = ${aid}::uuid`;
      }
      return { ok: true };
    }

    case "section_clear_co_head": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const sid = String(body.sectionId || "");
      await sql`UPDATE sections SET co_head_prefect_id = NULL WHERE id = ${sid}::uuid`;
      return { ok: true };
    }

    case "section_clear_head": {
      if (!canMutateData(ctx.user)) throw new Error("Forbidden");
      const sid = String(body.sectionId || "");
      await sql`UPDATE sections SET head_prefect_id = NULL WHERE id = ${sid}::uuid`;
      return { ok: true };
    }

    default:
      throw new Error(`Unknown op: ${op}`);
  }
}
