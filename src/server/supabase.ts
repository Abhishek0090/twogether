import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Storage bucket for every upload. Private: files are only reachable through short-lived signed links. */
export const BUCKET = "media";

function env() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set. See .env.example and docs/14-deployment.md.");
  }
  return { url: url.replace(/\/$/, ""), key };
}

const g = globalThis as unknown as { __twogetherSupabase?: SupabaseClient };

/** Server-only client with the secret key. Never send this key to the browser. */
export function admin() {
  if (!g.__twogetherSupabase) {
    const { url, key } = env();
    g.__twogetherSupabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return g.__twogetherSupabase;
}

const storage = () => admin().storage.from(BUCKET);

/** A one-time link the browser uploads the file to directly (bypasses Vercel's 4.5 MB request limit). */
export async function signedUploadUrl(path: string) {
  const { data, error } = await storage().createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Storage upload link failed: ${error?.message}`);
  return data.signedUrl;
}

/** A link that shows or downloads a private file for `seconds`. */
export async function signedDownloadUrl(path: string, seconds: number, downloadName?: string) {
  const { data, error } = await storage().createSignedUrl(path, seconds, downloadName ? { download: downloadName } : undefined);
  if (error || !data) throw new Error(`Storage link failed: ${error?.message}`);
  return data.signedUrl;
}

export async function removeFiles(paths: string[]) {
  if (!paths.length) return;
  const { error } = await storage().remove(paths);
  if (error) console.warn("[storage] remove failed:", error.message);
}

/**
 * Sends broadcast messages through Supabase Realtime's REST endpoint.
 * Browsers listening on these channels (topics) receive them instantly.
 */
export async function broadcast(messages: { topic: string; event: string; payload: unknown }[]) {
  if (!messages.length) return;
  const { url, key } = env();
  const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ messages: messages.map((m) => ({ ...m, private: false })) }),
  });
  if (!res.ok) console.warn("[realtime] broadcast failed:", res.status, await res.text().catch(() => ""));
}
