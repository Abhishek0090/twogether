#!/usr/bin/env node
// One-time Supabase setup: creates the tables (supabase/schema.sql) and the private "media" storage bucket.
// Safe to run again. Reads .env.local or .env.
//   npm run db:setup
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file missing: fine
  }
}

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const missing = [!dbUrl && "DATABASE_URL", !supabaseUrl && "SUPABASE_URL", !serviceKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(", ")}. See .env.example and docs/14-deployment.md.`);
  process.exit(1);
}

console.log("1/2  Creating tables...");
const sql = postgres(dbUrl, { prepare: false, max: 1, onnotice: () => {} });
try {
  await sql.unsafe(readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
  const tables = await sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`;
  console.log(`     done (${tables[0].n} tables in the public schema)`);
} catch (err) {
  console.error("     failed:", err.message);
  console.error("     Check DATABASE_URL (use the Transaction pooler string and your database password).");
  process.exit(1);
} finally {
  await sql.end();
}

console.log('2/2  Creating the private "media" storage bucket...');
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const { error } = await supabase.storage.createBucket("media", { public: false, fileSizeLimit: 50 * 1024 * 1024 });
if (error && !/already exists/i.test(error.message)) {
  console.error("     failed:", error.message);
  process.exit(1);
}
console.log(error ? "     already there" : "     done");
console.log("\nSupabase is ready. Run  npm run dev  and open http://localhost:3000");
