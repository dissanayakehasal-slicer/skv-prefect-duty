import type { JwtUser } from "./jwt.js";

export function canMutateData(user: JwtUser | null): boolean {
  // Restriction removed completely: allow mutation even without auth token.
  return true;
}

export function isAdmin(user: JwtUser | null): boolean {
  return user?.role === "admin";
}
