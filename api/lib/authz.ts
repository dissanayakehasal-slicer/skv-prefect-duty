import type { JwtUser } from "./jwt.js";

export function canMutateData(user: JwtUser | null): boolean {
  // Restriction removed: allow all authenticated users to mutate duty data.
  return !!user;
}

export function isAdmin(user: JwtUser | null): boolean {
  return user?.role === "admin";
}
