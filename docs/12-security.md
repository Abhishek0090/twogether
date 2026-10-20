# 12. Security

What protects the app today, where it lives in the code, and what to keep in mind when you change things.

## What is in place

| Risk | Protection | Where |
| --- | --- | --- |
| Stolen database reveals passwords | scrypt hashes with random salt, constant-time compare | `src/server/auth.ts` |
| Stolen database reveals sessions | Only SHA-256 of session tokens is stored | `src/server/auth.ts` |
| JavaScript stealing the session | Cookie is `httpOnly` | `setSessionCookie()` in `src/server/api.ts` |
| Other sites acting as you (CSRF) | `SameSite=Lax` cookie, plus `Origin` check on every non-GET API call | `handler()` in `src/server/api.ts` |
| SQL injection | Every query uses `?` parameters | All of `src/server/` |
| Reading someone else's chat | Every message route checks `row.couple_id === coupleId` from your session | `src/app/api/messages/**` |
| Reading someone else's files | `/api/media/[id]` only serves files uploaded by you or your partner | `src/app/api/media/[id]/route.ts` |
| View-once files leaking | URL hidden in all responses, normal file route refuses them, `/open` works once for the receiver | `hydrate()`, `/open` route |
| Uploaded HTML/SVG running scripts | Those types are stored as `application/octet-stream`; non-media files are served as downloads; files live on Supabase's domain, not ours | `src/app/api/media/route.ts`, `src/app/api/media/[id]/route.ts` |
| Guessing file links | The bucket is private; links are signed and expire (1 hour, 60 s for view once) | `src/server/supabase.ts` |
| XSS through messages | Text is rendered as React text, never `innerHTML`; links get `rel="noopener noreferrer nofollow"` | `MessageText.tsx` |
| Password guessing, code guessing | Rate limits on register, login and join, stored in the `rate_limits` table | `rateLimit()` in `src/server/api.ts` |
| Open redirect after sign-in | `next` must start with a single `/` | `safeNext()` in `AuthForm.tsx` |
| Clickjacking, sniffing | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` | `next.config.ts` |
| Listening to someone's live events | Realtime channel names contain 24 random bytes, handed only to that user (or couple) after sign-in | `newChannelKey()` in `src/server/realtime.ts` |
| Reading tables through Supabase's public API | Row Level Security on every table, with no policies | `supabase/schema.sql` |
| Leaking the Supabase secret key | Only used in `src/server/`, never in a `NEXT_PUBLIC_` variable | `src/server/supabase.ts` |
| Data left on a shared device | Sign-out clears cached pages and media and removes the push subscription | `SettingsView.tsx` |

## Things to know

- **Use https in production.** Without it, cookies and messages travel in plain text, and the `secure` cookie flag stays off.
- **Realtime uses secret channel names, not Supabase Auth.** Anyone who learns your channel name could listen to its events (message previews, typing). The names are long random secrets, sent only in your own signed-in page, so this is similar to an unguessable share link. For stricter control, switch to Supabase *private channels* with Realtime Authorization: that means issuing Supabase JWTs for our users and adding RLS policies on `realtime.messages`.
- **Typing and call signals are browser to browser.** The server does not check them. A partner could send fake typing events, which only matters between the two of you.
- **Keep `SUPABASE_SERVICE_ROLE_KEY` secret.** It can read and write everything. If it leaks, rotate it in Supabase **API Keys** and update Vercel.
- **Messages are not end-to-end encrypted.** Whoever runs the server can read the database. That is the same model as most web chat apps, but not WhatsApp's.
- **No email verification or password reset.** Anyone can register with any email. If you forget a password you need the database to reset it (or add a reset flow, see [15](15-extending-and-debugging.md)).
- **Back up.** The free Supabase plan has no point-in-time restore. Export the chat now and then (Settings, Export chat); for a full backup use `pg_dump` with the direct connection string.
- **`.env.local` is never shared** by the copy-paste scripts and is ignored by git. Keep it that way if you add secrets.

## Rules when you add code

1. Every new API route: wrap it in `handler()` and start with `requireCouple()` or `requireUser()`.
2. Anything loaded by id: check it belongs to the caller's couple **on the server**. Hiding a button in the UI is not security.
3. Validate input lengths and types (`text()` helper) before writing to the database.
4. Never build SQL from strings. Use `?`.
5. Never render user content with `dangerouslySetInnerHTML`.

Continue with [13-share-scripts.md](13-share-scripts.md).
