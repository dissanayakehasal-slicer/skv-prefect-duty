import type { JwtUser } from "./jwt.js";

export function canMutateData(user: JwtUser | null): boolean {
  return user?.role === "admin" || user?.role === "duty_editor";
}

export function isAdmin(user: JwtUser | null): boolean {
  return user?.role === "admin";
}
