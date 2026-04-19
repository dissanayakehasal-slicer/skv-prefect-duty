import postgres from "postgres";

let client: ReturnType<typeof postgres> | null = null;

export function getSql() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("POSTGRES_URL or DATABASE_URL is not set");
  if (!client) {
    client = postgres(url, { max: 1, idle_timeout: 20, connect_timeout: 10 });
  }
  return client;
}
