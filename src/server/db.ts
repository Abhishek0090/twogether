import postgres from "postgres";

/**
 * Postgres connection (Supabase). Use the "Transaction pooler" connection string (port 6543):
 * serverless functions open many short connections and the pooler shares a few real ones.
 */
function getDatabaseUrl() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in (see docs/14-deployment.md).",
    );
  }

  const isSupabasePoolerUrl =
    /^postgres(?:ql)?:\/\/[^\s@]+:[^\s@]+@[^\s/]+:\d+\/[\w-]+(?:\?.*)?$/i.test(
      url,
    );
  if (!isSupabasePoolerUrl) {
    throw new Error(
      "DATABASE_URL is not a valid Supabase Postgres connection string. Use the Transaction pooler URL from Supabase > Connect > Transaction pooler (port 6543), not the project URL or a missing hostname.",
    );
  }

  return url;
}

function connect() {
  const url = getDatabaseUrl();
  return postgres(url, {
    prepare: false, // required by the transaction pooler
    max: Number(process.env.DATABASE_POOL_MAX) || 3, // connections per server instance
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
    // BIGINT (timestamps, COUNT) arrives as a string by default; our numbers fit safely in a JS number.
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (v: number) => String(v),
        parse: (v: string) => Number(v),
      },
    },
  });
}

type Sql = ReturnType<typeof connect>;
type Param = string | number | boolean | null;

// One pool per server instance. Kept on globalThis so hot reload in dev does not open new pools.
const g = globalThis as unknown as { __twogetherSql?: Sql };
const sql = () => (g.__twogetherSql ??= connect());

/** Our SQL uses `?` placeholders (easy to read); Postgres wants $1, $2, ... */
function toPg(query: string) {
  let n = 0;
  return query.replace(/\?/g, () => `$${++n}`);
}

/** Query helpers bound to a connection: the pool, or a transaction. */
function helpers(conn: { unsafe: Sql["unsafe"] }) {
  const exec = (query: string, params: Param[]) =>
    conn.unsafe(toPg(query), params as never[]);
  return {
    /** First row, or undefined. */
    async one<T>(query: string, ...params: Param[]): Promise<T | undefined> {
      return (await exec(query, params))[0] as T | undefined;
    },
    /** All rows. */
    async all<T>(query: string, ...params: Param[]): Promise<T[]> {
      return (await exec(query, params)) as unknown as T[];
    },
    /** UPDATE / DELETE / INSERT without a result. Returns the number of affected rows. */
    async run(query: string, ...params: Param[]) {
      return { changes: (await exec(query, params)).count };
    },
    /** INSERT INTO a table with an `id` column; returns the new id. */
    async insert(query: string, ...params: Param[]) {
      const rows = await exec(`${query} RETURNING id`, params);
      return Number((rows[0] as unknown as { id: number }).id);
    },
  };
}

export type Db = ReturnType<typeof helpers>;

const pool: Db = {
  one: (q, ...p) => helpers(sql()).one(q, ...p),
  all: (q, ...p) => helpers(sql()).all(q, ...p),
  run: (q, ...p) => helpers(sql()).run(q, ...p),
  insert: (q, ...p) => helpers(sql()).insert(q, ...p),
};

export const { one, all, run, insert } = pool;

/** Runs `fn` in a transaction: everything commits together, or nothing does. */
export async function tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return (await sql().begin((t) => fn(helpers(t)))) as T;
}

export async function kvGet(key: string) {
  return (
    await one<{ value: string }>("SELECT value FROM kv WHERE key = ?", key)
  )?.value;
}

export async function kvSet(key: string, value: string) {
  await run(
    "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}

/** Raw access for scripts (schema setup). */
export const rawSql = sql;
