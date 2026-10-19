# Twogether

A private chat app for two people: WhatsApp-style messaging plus couple features. Built with Next.js 16 (App Router), a custom Node server for WebSockets, and SQLite. Installable as a PWA with push notifications.

## Features

**Chat**

- Real-time messages over WebSocket, with automatic reconnect and catch-up
- Sent / delivered / read ticks, typing and "recording audio" indicators, online and last seen
- Photos, videos, documents, camera capture, paste and drag-and-drop uploads
- Voice notes with waveform, seeking and 1x / 1.5x / 2x playback
- View-once photos and videos
- Reply (swipe right on phones), react (double-tap for a heart), edit (15 min), delete for me or for everyone (48 h)
- Star messages, search, jump to a quoted message, "N unread messages" divider
- *bold*, _italic_, ~strike~ and `code` formatting, clickable links, large emoji-only messages
- Emoji picker with search, skin tones and recents (`emoji-picker-react`, native emoji, works offline)
- Voice and video calls (WebRTC, peer to peer) with mute, camera off and camera flip
- Export chat as text, clear chat, shared chat wallpapers, light and dark theme

**Couple**

- Pairing with a 6-character invite code or link (exactly two people per space)
- Days-together counter and next-anniversary countdown
- One-tap nudges (hug, kiss, miss you, thinking of you, love you) with a full-screen hearts animation and vibration
- Moods, a private nickname for your partner, question of the day (answers revealed once both reply, with a streak), countdowns for special dates, and a shared bucket list
- Moments: media gallery, voice notes and docs, links, starred messages

**PWA**

- Installable on Android, iOS (Add to Home Screen) and desktop
- Offline page, cached app shell and media, unread badge on the app icon
- Web push for messages, nudges, missed calls and the daily question (VAPID keys are generated automatically)

## Requirements

- Node.js **22.13 or newer** (uses the built-in `node:sqlite`)

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

Open the app in two browsers (or one normal and one private window), create two accounts, get an invite code on one and enter it on the other.

## Using it on phones

Camera, microphone, calls, push notifications and installing the PWA need a **secure origin** (https, or `localhost`). On a phone over plain `http://192.168.x.x:3000` chat works, but those features are blocked by the browser.

For a quick https URL, run a tunnel next to the server, for example:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

Calls connect peer to peer through public STUN servers. On strict networks (some mobile carriers, office Wi-Fi) add a TURN server in `.env` (`TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`).

## Configuration

Copy `.env.example` to `.env`. Everything is optional.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port for the app and WebSocket |
| `HOST` | `0.0.0.0` | Interface to listen on |
| `DATA_DIR` | `./data` | SQLite database and uploaded files |
| `VAPID_SUBJECT` | `mailto:hello@twogether.local` | Contact sent to push services |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | generated | Fixed push keys (otherwise stored in the database) |
| `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | none | TURN server for calls |
| `ALLOWED_DEV_ORIGINS` | none | Extra hostnames allowed to open the dev server |

## How it fits together

```text
server.ts                 Next.js + WebSocket (/ws) on one port
src/server/db.ts          SQLite schema and helpers (node:sqlite, WAL mode)
src/server/socket.ts      WebSocket auth, presence, typing, receipts, call signalling
src/server/realtime.ts    Connection registry shared with the API routes
src/server/messages.ts    Message queries, payloads, push previews
src/server/push.ts        Web push (VAPID)
src/app/api/**            REST API: auth, couple, messages, media, dates, bucket, question, push, rtc
src/app/(app)/**          Chat, Us, Moments and Settings screens
src/components/**         Client UI (AppProvider owns the socket and message state)
public/sw.js              Service worker: offline, caching, push
```

Messages are written through the REST API and fanned out over the WebSocket. The socket also carries typing, read receipts, presence and WebRTC signalling. Sessions are random tokens in an httpOnly cookie, stored hashed; passwords use scrypt. Uploaded files are only served to the two partners, and view-once media is only reachable once, by the receiver.

The custom server needs a long-running Node process (a VPS, Railway, Render, Fly.io or a home server). It does not run on serverless platforms such as Vercel.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript checks |
| `npm run share` | Rebuilds the copy-paste setup scripts in `twogether-share/` |
| `node scripts/make-icons.mjs` | Redraws the PNG app icons |
