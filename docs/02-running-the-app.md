# 2. Running the app

## Requirements

- **Node.js 20.9 or newer** (Next.js 16's minimum). Check with `node -v`.
- A **Supabase** project (free). The app has no local database of its own; development uses the same Supabase project (or a second free one, see below).

## First run

```bash
npm install
cp .env.example .env.local      # then fill in the 5 Supabase values (see 14-deployment.md, step 3)
npm run db:setup                # creates the tables and the storage bucket
npm run dev                     # http://localhost:3000
```

## Scripts

| Command | Runs | When to use |
| --- | --- | --- |
| `npm run dev` | `next dev --webpack` | Daily development, hot reload |
| `npm run dev:turbo` | `next dev` (Turbopack) | Faster dev builds, **if** the Console Ninja extension is not active (see below) |
| `npm run dev:lan` | `next dev --webpack -H 0.0.0.0` | Open the dev server from a phone on the same Wi-Fi |
| `npm run build` | `next build` | Production build (Vercel runs this) |
| `npm start` | `next start` | Run the production build locally |
| `npm run lint` | `eslint` | Must pass with 0 errors |
| `npm run typecheck` | `tsc --noEmit` | TypeScript errors only |
| `npm run db:setup` | `node scripts/db-setup.mjs` | Create or update tables and the bucket |
| `npm run share` | `node scripts/make-share.mjs` | Rebuild the copy-paste setup/update scripts |

Run lint and typecheck before you consider a change done.

### Why `dev` uses webpack: the Console Ninja problem

Next.js 16 uses **Turbopack** for `next dev` by default. On this laptop, the VS Code extension **Console Ninja** edits `node_modules/next/dist/server/lib/start-server.js` to inject a "build hook" that is active only with Turbopack. With it active, Turbopack wrote cut-off JavaScript files, the page never became interactive, and buttons did nothing. With `--webpack` the hook stays off and everything works. Production builds are not affected.

If you do not use Console Ninja (or pause it for this workspace), `npm run dev:turbo` is faster.

## Environment variables

Local: `.env.local` (git-ignored). Vercel: Project, Settings, Environment Variables. Same names in both places.

| Variable | Required | Used in |
| --- | --- | --- |
| `DATABASE_URL` | yes | `src/server/db.ts`: Supabase **Transaction pooler** string (port 6543). `POSTGRES_URL` also works. |
| `SUPABASE_URL` | yes | `src/server/supabase.ts`: storage links, realtime broadcast |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Same. Secret: server only. `SUPABASE_SECRET_KEY` also works. |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `src/lib/client/supabase.ts`: Realtime in the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Same. Public key. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` also works. |
| `VAPID_SUBJECT` | no | `src/server/push.ts`: contact for push services |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | no | Fixed push keys; otherwise generated once and stored in `kv` |
| `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | no | `src/app/api/rtc/route.ts`: relay server for calls |
| `DATABASE_POOL_MAX` | no | Connections per server instance (default 3) |
| `ALLOWED_DEV_ORIGINS` | no | `next.config.ts`: extra hostnames for the dev server |

`NEXT_PUBLIC_` values are baked into the browser bundle at build time. After changing them on Vercel, **redeploy**.

### Separate dev and production data (optional)

Create a second free Supabase project for development and put its values in `.env.local`, while Vercel uses the production project. That way testing never touches your real chat. The free plan allows two active projects.

## Trying it with two people on one computer

1. Open `http://localhost:3000` in a normal window and a private window (separate cookies, separate users).
2. Create an account in each. Passwords need 8+ characters.
3. Window A: **Get my invite code**. Window B: **I have a code**, enter it, **Connect**.
4. Put the windows side by side: typing, ticks and the online dot change live.

## Testing on a phone

- **Easiest:** deploy to Vercel (it is https) and open the link on the phone.
- **Local:** `npm run dev:lan`, then open `http://<your-computer-ip>:3000` on the same Wi-Fi. Chat works, but browsers block the camera, microphone, notifications and installing the app on plain `http` (they need `https` or `localhost`). For https locally:

  ```bash
  npx cloudflared tunnel --url http://localhost:3000
  ```

  `*.trycloudflare.com` is already allowed in `next.config.ts`.

## Regenerating icons

`node scripts/make-icons.mjs` redraws `public/icons/*.png` and `src/app/apple-icon.png` pixel by pixel with Node's `zlib`. Change colours or shapes in that script for a new icon.

Continue with [03-database.md](03-database.md).
