# 5. API reference

Every endpoint lives in `src/app/api/**/route.ts`. The folder path is the URL: `src/app/api/messages/[id]/star/route.ts` is `/api/messages/123/star`. Each file exports functions named after HTTP methods (`GET`, `POST`, `PATCH`, `DELETE`, `PUT`).

## Conventions

**Every handler is wrapped in `handler()`** from `src/server/api.ts`:

```ts
export const POST = handler(async (req) => {
  const { user, partner, coupleId } = await requireCouple(); // 401 / 409 if not allowed
  const body = await readJson<{ title: string }>(req);       // 400 if not JSON
  const title = text(body.title, "Title", { max: 60 });      // 400 if empty or too long
  // ... do work ...
  return Response.json({ ok: true });
});
```

`handler()` does two things:

1. **Origin check.** For non-GET requests, if the `Origin` header is a different site, it returns 403. This blocks other websites from posting to your API with your cookie.
2. **Errors to JSON.** Throw `new HttpError(status, message)` anywhere and the client gets `{ "error": message }` with that status. Any other error is logged and becomes a 500 with a generic message.

On the browser side, `api()` in `src/lib/client/api.ts` is the matching helper: it sends JSON, throws an `Error` with the server's `error` text on failure, and sends you to `/login` on a 401.

Dynamic segments (`[id]`) arrive as `ctx.params`, which in Next.js 16 is a **Promise**: `const { id } = await ctx.params`. `idParam(ctx)` does that and checks the id is a positive integer.

**Auth column below:** `user` = signed in (`requireUser`), `couple` = signed in and paired (`requireCouple`), `none` = public.

## Auth

| Method | Path | Auth | Body | Returns |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | none | `{ name, email, password }` | `{ ok }` + session cookie |
| POST | `/api/auth/login` | none | `{ email, password }` | `{ ok }` + session cookie |
| POST | `/api/auth/logout` | none | - | `{ ok }`, cookie removed |
| GET | `/api/auth/me` | user | - | `{ me, paired, partner, inviteCode }` |

## Couple and profile

| Method | Path | Auth | Body | Returns / effect |
| --- | --- | --- | --- | --- |
| GET | `/api/couple` | couple | - | `{ me, partner, couple }` (the `Bootstrap` type) |
| PATCH | `/api/couple` | couple | `{ anniversary?, wallpaper? }` | Saves; both get `refresh: couple` |
| DELETE | `/api/couple` | couple | `{ confirm: "UNLINK" }` | Deletes everything shared; both get `unpaired` |
| POST | `/api/couple/invite` | user | - | `{ code }`, creating a one-person couple if needed |
| POST | `/api/couple/join` | user | `{ code }` | Pairs you; partner gets a system message and `refresh: couple` |
| PATCH | `/api/profile` | user | any of `name`, `partnerNickname`, `moodEmoji`, `moodText`, `avatarMediaId`, `currentPassword` + `newPassword` | `{ me }`; both get `refresh: couple` |

## Messages

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/messages` | couple | List messages (see query options below) |
| POST | `/api/messages` | couple | Send a message |
| PATCH | `/api/messages/[id]` | couple | Edit your text message, `{ body }`, within 15 min |
| DELETE | `/api/messages/[id]?scope=me` | couple | Hide for yourself |
| DELETE | `/api/messages/[id]?scope=everyone` | couple | Delete your message for both, within 48 h; also deletes the file |
| POST | `/api/messages/[id]/reactions` | couple | `{ emoji }` to set or change, `{ emoji: null }` to remove |
| POST | `/api/messages/[id]/star` | couple | `{ starred: true / false }` |
| POST | `/api/messages/[id]/open` | couple | Opens a view-once photo/video: marks it viewed and returns `{ url }`, a link valid for 60 s. Receiver only, once. |
| POST | `/api/messages/receipts` | couple | `{ kind: "delivered" \| "read", upTo }`: marks the partner's messages up to `upTo`; the partner gets a `receipt` event |
| POST | `/api/messages/clear` | couple | Hides all current messages for you ("Clear chat") |
| GET | `/api/messages/export?tz=Asia/Kolkata` | couple | Downloads the chat as a `.txt` file |

### `GET /api/messages` query options

Only one mode is used per request:

| Query | Returns | Used by |
| --- | --- | --- |
| *(none)* or `?before=<id>&limit=40` | The newest messages (or the ones before an id), `hasMore`, `unread` | Opening the chat, scrolling up |
| `?after=<id>` | Up to 200 messages newer than the id, plus `unread` | Catching up after a reconnect |
| `?around=<id>` | 30 before + 30 after the id, `hasMore`, `hasNewer` | Jumping to a search result or quoted message |
| `?q=<text>` | Up to 50 text/file messages matching the text | Search |
| `?kind=media\|files\|links\|starred` | That category, paginated with `before` | Moments screen |

Messages always come back **oldest first** in the array.

### `POST /api/messages` body

```json
{
  "clientId": "random uuid from the browser",
  "type": "text | image | video | audio | file | nudge | call",
  "body": "text, caption, or nudge kind",
  "mediaId": 12,
  "replyTo": 340,
  "viewOnce": false,
  "meta": { "w": 1080, "h": 1350, "duration": 4.2, "peaks": [0.1, 0.8] }
}
```

What the route checks, in order:

1. Same `clientId` already saved for you? Return that message again (safe retries).
2. Per type: text must be 1-4000 characters; nudge must be a known kind; media types need a `mediaId` **you** uploaded with a matching file type; audio and file messages drop any caption.
3. `replyTo` must be in your chat, otherwise it is ignored.
4. `meta` is cleaned (`cleanMeta`): only known fields, numbers in range, at most 64 waveform peaks.
5. Insert.
6. Broadcast it to both users over Realtime. After the response is sent (`after()`), push a notification if the partner does not have the app on screen. `delivered_at` stays empty until the partner's browser confirms with `/api/messages/receipts`.

## Media

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/media` | user | Upload step 1: `{ name, mime, size }` (max 50 MB). Returns `{ id, url, mime, name, size, uploadUrl }`. |
| GET | `/api/media/[id]` | user | 302 redirect to a signed Storage link (valid 1 hour). Only the uploader and their partner. Not for view-once files. |

Sending a photo is **three steps**, all inside `uploadFile()` and `deliver()`:

1. `POST /api/media` with the file's name, type and size. The server creates the `media` row and asks Supabase for a one-time upload link.
2. The browser `PUT`s the file **straight to Supabase Storage** with that link (`XMLHttpRequest`, because `fetch` cannot report upload progress). Vercel functions only accept 4.5 MB requests, so files must not pass through our API.
3. `POST /api/messages` with the `mediaId`.

Files are stored in the private bucket `media` as `<userId>/<random uuid>.<ext>`. The original name is kept in the database. Risky types (SVG, HTML, XML) are stored as `application/octet-stream`, and non-media types are served as downloads, because a browser could run scripts inside them.

Supabase Storage serves the files, including Range requests (`206 Partial Content`), which video seeking and Safari's audio player need.

## Couple features

| Method | Path | Auth | Body | Effect |
| --- | --- | --- | --- | --- |
| GET | `/api/dates` | couple | - | `{ dates }` |
| POST | `/api/dates` | couple | `{ title, date, emoji, yearly }` | Adds; both get `refresh: dates` |
| DELETE | `/api/dates/[id]` | couple | - | Removes |
| GET | `/api/bucket` | couple | - | `{ items }` |
| POST | `/api/bucket` | couple | `{ title }` | Adds; both get `refresh: bucket` |
| PATCH | `/api/bucket/[id]` | couple | `{ done }` | Ticks or unticks |
| DELETE | `/api/bucket/[id]` | couple | - | Removes |
| GET | `/api/question` | couple | - | `{ question, streak, total }` |
| POST | `/api/question` | couple | `{ answer }` | Saves today's answer (once); pushes to partner |

## Push and calls

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/push` | user | `{ publicKey }` the browser needs to subscribe |
| POST | `/api/push` | user | Save this device's subscription |
| DELETE | `/api/push` | user | Remove it, `{ endpoint }` |
| PUT | `/api/push` | user | Send a test notification to all your devices |
| GET | `/api/rtc` | user | `{ iceServers }` for calls (STUN, plus TURN if configured) |
| POST | `/api/presence` | user | Heartbeat `{ visible }` every 25 s while on screen; decides push vs no push, updates last seen |

## Trying the API by hand

Sign in in the browser, copy the `tg_session` cookie from the developer tools (Application, Cookies), then:

```bash
curl -H "Cookie: tg_session=PASTE_HERE" http://localhost:3000/api/messages?limit=5
```

Continue with [06-realtime-websocket.md](06-realtime-websocket.md).
