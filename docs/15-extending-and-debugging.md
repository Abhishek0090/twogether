# 15. Extending and debugging

Recipes for the changes you are most likely to make, how to find problems, and practice tasks to build confidence.

## Before and after every change

```bash
npm run dev           # keep it running while you work
npm run lint          # 0 errors
npm run typecheck     # 0 errors
```

Then test with two browser windows (normal + private), one per partner. Before deploying, `npm run build` catches anything the dev server tolerates.

## Recipe 1: add an API route

Example: a "love counter" that both partners can increase.

1. **Table** in `supabase/schema.sql`, then `npm run db:setup`:

   ```sql
   CREATE TABLE IF NOT EXISTS love_counter (
     couple_id INTEGER PRIMARY KEY REFERENCES couples(id) ON DELETE CASCADE,
     total INTEGER NOT NULL DEFAULT 0
   );
   ALTER TABLE love_counter ENABLE ROW LEVEL SECURITY;
   ```

2. **Route** `src/app/api/love/route.ts`:

   ```ts
   import { handler, requireCouple } from "@/server/api";
   import { one, run } from "@/server/db";
   import { sendToUsers } from "@/server/realtime";

   export const GET = handler(async () => {
     const { coupleId } = await requireCouple();
     const row = await one<{ total: number }>("SELECT total FROM love_counter WHERE couple_id = ?", coupleId);
     return Response.json({ total: row?.total ?? 0 });
   });

   export const POST = handler(async () => {
     const { user, partner, coupleId } = await requireCouple();
     await run(
       `INSERT INTO love_counter (couple_id, total) VALUES (?, 1)
        ON CONFLICT (couple_id) DO UPDATE SET total = love_counter.total + 1`,
       coupleId,
     );
     await sendToUsers([user.id, partner.id], { t: "refresh", what: "love" });
     return Response.json({ ok: true });
   });
   ```

3. **Event type:** add `"love"` to `RefreshTopic` in `src/lib/types.ts`. TypeScript will now show you every place that needs to know about it.
4. **UI:** in a component, load with `api("/api/love")`, send with `api("/api/love", { method: "POST" })`, and reload on the event:

   ```ts
   useEffect(() => subscribe((e) => e.t === "refresh" && e.what === "love" && void load()), [load, subscribe]);
   ```

Checklist for every route: `handler()`, `requireCouple()` / `requireUser()`, validate input with `text()`, every query `await`ed, everything filtered by `coupleId`.

## Recipe 2: add a new message type

Example: a "location" message.

1. `src/lib/types.ts`: add `"location"` to `MessageType`, and `lat` / `lng` to `MessageMeta`.
2. `src/app/api/messages/route.ts`: accept the type in `POST` (validate the numbers in `cleanMeta`).
3. `src/server/messages.ts` `previewText()` and `src/components/app/AppProvider.tsx` `previewOf()`: a preview such as "📍 Location". TypeScript complains until you do, because the `switch` covers every type.
4. `src/components/chat/MessageBubble.tsx` `Body`: a `case "location"` that renders a map link.
5. `src/components/chat/Composer.tsx`: a button that calls `navigator.geolocation.getCurrentPosition` and then `send({ type: "location", meta: { lat, lng } })`.
6. `next.config.ts`: the `Permissions-Policy` header blocks geolocation (`geolocation=()`). Change it to `geolocation=(self)`.

## Recipe 3: add a partner-to-partner live event

Example: "Sam is looking at the chat" (eyes icon).

1. `src/lib/types.ts`: add `| { t: "watching"; from: number; on: boolean }` to `PeerEvent`.
2. `AppProvider`: send it with `sendPeer({ t: "watching", from: meId, on: true })` from `setChatActive`, and handle it in `onPeer()`.
3. No server change: peer events go browser to browser on the couple channel.

## Recipe 4: password reset (a good bigger project)

There is no email service yet. Options, from simplest:

- **Partner reset:** your partner, while signed in, generates a one-time reset code for you. Needs a `reset_codes` table, two routes and a small page.
- **Email:** add a provider such as Resend, store a hashed token with an expiry, and send a link to `/reset?token=...`.

## Debugging guide

### Where to look

| Problem in... | Look at |
| --- | --- |
| Browser | DevTools **Console** (errors) and **Network** (each `/api` call: status, response `error` text) |
| API on your machine | The terminal running `npm run dev`; unexpected errors are logged by `handler()` |
| API on Vercel | Vercel, project, **Logs** (or **Deployments > Runtime Logs**) |
| Database | Supabase **Table Editor** / **SQL Editor**; **Logs > Postgres** |
| Realtime | Supabase **Realtime > Inspector**: join `u:...` or `c:...` and watch events live. The channel names are in the page data (search the page source for `"u:`). |
| Files | Supabase **Storage > media** |
| Service worker / push | DevTools **Application** tab: Service Workers, Cache Storage, Manifest |

### Common problems

| Symptom | Cause | Fix |
| --- | --- | --- |
| Buttons do nothing in dev, page looks fine | JavaScript did not load (hydration failed). On this laptop: Console Ninja with Turbopack | Use `npm run dev` (webpack). Check the Console for red errors. |
| `Hydration failed` warning | Server and browser rendered different text (dates, `localStorage`) | Use `useHydrated()` (see [07](07-frontend-architecture.md#3-usehydrated-for-browser-only-values)) |
| ESLint: "setState synchronously within an effect" | React Compiler rule | See the patterns in [07](07-frontend-architecture.md#4-adjusting-state-while-rendering) |
| A change to `.env.local` has no effect | Env is read at start; `NEXT_PUBLIC_` is baked into the bundle | Restart `npm run dev`; on Vercel, redeploy |
| `relation "xyz" does not exist` | Table not created | `npm run db:setup` |
| `bind message supplies N parameters` | A `?` inside SQL text, or wrong number of values | Count `?` and parameters; never write a literal `?` in SQL |
| Messages arrive only every ~10 s | Realtime not connected, the fallback poll is working | Check `NEXT_PUBLIC_SUPABASE_*`, Realtime enabled, project not paused |
| Push never arrives | Not https, permission denied, or app visible | Settings test button; DevTools Application > Service Workers > Push |
| Call never connects | Strict network, no TURN server | Try both phones on the same Wi-Fi; add TURN |

### Reading an API error

Every handled error comes back as JSON: `{ "error": "Message is too long (max 4000 characters)." }` with a 4xx status. A 500 means something unexpected: the real error is in the server log, and the browser only sees a generic message (on purpose, so internals do not leak).

## Practice tasks

Each one touches a different part of the app. Do them in order.

1. **Easy - text:** change the empty-chat text in `ChatView.tsx`. Find it by searching the codebase for the current sentence.
2. **Easy - data:** add 5 of your own questions to `src/lib/questions.ts`. Why does today's question change for some days when you add questions? (Hint: `questionForDay`.)
3. **Easy - style:** add a seventh wallpaper in `src/lib/wallpapers.ts`. Check it in light and dark mode.
4. **Medium - limits:** make messages editable for 30 minutes instead of 15. Which file holds the window, and why does the server check it too?
5. **Medium - API:** do Recipe 1 (love counter) and show the number on the Us page.
6. **Medium - realtime:** do Recipe 3. Use the Supabase Realtime Inspector to watch your events.
7. **Medium - database:** add a `birthday` column to `users`, editable in Settings, and show a countdown on the Us page.
8. **Hard - feature:** add "pin message": one pinned message per couple, shown under the chat header, updated live for both.
9. **Hard - security:** switch Realtime to Supabase private channels with Realtime Authorization (see [12](12-security.md)).

When you can do task 8 without looking at these docs, you know the codebase.
