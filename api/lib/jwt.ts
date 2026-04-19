import * as jose from "jose";

export type JwtUser = { userId: string; username: string; role: "admin" | "duty_editor" | "viewer" };

function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error("JWT_SECRET must be set (min 16 chars)");
  }
  return new TextEncoder().encode(s);
}

export async function signUserToken(user: JwtUser): Promise<string> {
  return new jose.SignJWT({ u: user.username, r: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(getSecret());
}

export async function verifyUserToken(token: string): Promise<JwtUser | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecret());
    const sub = payload.sub;
    const u = payload.u;
    const r = payload.r;
    if (typeof sub !== "string" || typeof u !== "string" || typeof r !== "string") return null;
    if (r !== "admin" && r !== "duty_editor" && r !== "viewer") return null;
    return { userId: sub, username: u, role: r };
  } catch {
    return null;
  }
}
