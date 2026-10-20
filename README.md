# Twogether

A private chat app for two people: WhatsApp-style messaging plus couple features. Built with Next.js 16, deployable **for free on Vercel + Supabase** (Postgres, Storage, Realtime). Installable as a PWA with push notifications.

**New here? Read [`docs/README.md`](docs/README.md)**: 15 short chapters that explain every part of the app. **Deploying?** Go straight to [`docs/14-deployment.md`](docs/14-deployment.md).

## Features

**Chat**

- Real-time messages, with a polling fallback if the live connection drops
- Sent / delivered / read ticks, typing and "recording audio" indicators, online and last seen
- Photos, videos, documents, camera capture, paste and drag-and-drop uploads (direct to storage, up to 50 MB)
- Voice notes with waveform, seeking and 1x / 1.5x / 2x playback
- View-once photos and videos
- Reply (swipe right on phones), react (double-tap for a heart), edit (15 min), delete for me or for everyone (48 h)
- Star messages, search, jump to a quoted message, "N unread messages" divider
- *bold*, _italic_, ~strike~ and `code` formatting, clickable links, large emoji-only messages
- Emoji picker (`emoji-picker-react`) with search, skin tones and recents
- Voice and video calls (WebRTC, peer to peer) with mute, camera off and camera flip
- Export chat as text, clear chat, shared wallpapers, light and dark theme

**Couple**

- Pairing with a 6-character invite code or link (exactly two people per space)
- Days-together counter and next-anniversary countdown
- One-tap nudges (hug, kiss, miss you, thinking of you, love you) with a full-screen hearts animation
- Moods, a private nickname for your partner, question of the day (answers revealed once both reply, with a streak), countdowns for special dates, a shared bucket list
- Moments: media gallery, voice notes and docs, links, starred messages

**PWA**

- Installable on Android, iOS (Add to Home Screen) and desktop
- Offline page, cached app shell, unread badge on the app icon
- Web push for messages, nudges, missed calls and the daily question

## Quick start

Requires Node.js 20.9+ and a free [Supabase](https://supabase.com) project.

```bash
npm install
cp .env.example .env.local     # fill in the 5 Supabase values (docs/14-deployment.md, step 3)
npm run db:setup               # tables + private storage bucket
npm run dev                    # http://localhost:3000
```

Open the app in two browsers (one normal, one private window), create two accounts, get an invite code on one and enter it on the other.

## Deploy

Push to GitHub, import the repository in Vercel, add the same environment variables, set the function region next to your Supabase region, deploy. Full roadmap with diagrams: [`docs/14-deployment.md`](docs/14-deployment.md).

## Architecture in one picture

```text
Phone (PWA)  --fetch /api-->  Vercel (Next.js pages + API routes)  --SQL-->  Supabase Postgres
     |                                   |--signed links-->               Supabase Storage
     |<--------- live events ----------- |--broadcast-->                  Supabase Realtime
     |<==== typing, calls, presence (browser to browser via Realtime) ====>|
```

Details: [`docs/01-big-picture.md`](docs/01-big-picture.md).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server (webpack; see docs/02 for why) |
| `npm run dev:turbo` | Development server with Turbopack |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript checks |
| `npm run db:setup` | Create or update the Supabase tables and storage bucket |
| `npm run share` | Rebuild the copy-paste setup / update scripts in `twogether-share/` |
| `node scripts/make-icons.mjs` | Redraw the PNG app icons |
