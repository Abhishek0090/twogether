# Twogether developer guide

This folder explains how Twogether works, from the big picture down to single functions. Read it in order the first time. After that, use it as a reference.

## Reading order

| # | File | You will learn |
| --- | --- | --- |
| 1 | [01-big-picture.md](01-big-picture.md) | What the app is, the tech stack, how the pieces talk, where every file lives |
| 2 | [02-running-the-app.md](02-running-the-app.md) | Scripts, environment variables, dev vs production, testing on phones |
| 3 | [03-database.md](03-database.md) | Supabase Postgres: every table, the query helpers, changing the schema |
| 4 | [04-auth-and-pairing.md](04-auth-and-pairing.md) | Sign up, sessions, cookies, passwords, and how two people become a couple |
| 5 | [05-api-reference.md](05-api-reference.md) | Every API route: method, input, output, rules |
| 6 | [06-realtime-websocket.md](06-realtime-websocket.md) | Supabase Realtime: channels, events, presence, ticks, and the life of one message |
| 7 | [07-frontend-architecture.md](07-frontend-architecture.md) | Pages, layouts, `AppProvider`, state flow, React patterns used |
| 8 | [08-chat-features.md](08-chat-features.md) | How each chat feature works: uploads, voice notes, view once, replies, scrolling |
| 9 | [09-calls-webrtc.md](09-calls-webrtc.md) | Voice and video calls with WebRTC |
| 10 | [10-pwa-and-push.md](10-pwa-and-push.md) | Install, service worker, offline, push notifications |
| 11 | [11-couple-features.md](11-couple-features.md) | Us page: counter, nudges, moods, daily question, dates, bucket list |
| 12 | [12-security.md](12-security.md) | What protects the app, and what to keep in mind |
| 13 | [13-share-scripts.md](13-share-scripts.md) | The copy-paste setup and update scripts |
| 14 | [14-deployment.md](14-deployment.md) | **Free deployment on Vercel + Supabase**: roadmap, step by step, troubleshooting |
| 15 | [15-extending-and-debugging.md](15-extending-and-debugging.md) | Step-by-step recipes, debugging tips, practice tasks |

## How to study this codebase

1. Read [01](01-big-picture.md) and run the app ([02](02-running-the-app.md)).
2. Open two browsers side by side, send a message, and follow [the life of a message](06-realtime-websocket.md#the-life-of-one-message) in the code while it happens.
3. Open the Supabase **Table Editor** (see [03](03-database.md#looking-at-the-data)) and watch rows appear as you use the app.
4. Do the practice tasks at the end of [15](15-extending-and-debugging.md#practice-tasks). Changing code is the fastest way to own it.

## Words used in these docs

| Word | Meaning here |
| --- | --- |
| **Couple** | One row in the `couples` table. Holds exactly two users once paired. |
| **Partner** | The other user in your couple. |
| **Route handler** | A Next.js API file, `src/app/api/**/route.ts`. Runs on the server. |
| **Channel** | A named Supabase Realtime stream. Each user has a private one; each couple shares one (`src/server/realtime.ts`). |
| **Event** | A JSON object sent over Realtime, always with a `t` (type) field, e.g. `{ "t": "typing" }`. |
| **Supabase** | The hosted service that provides the database, file storage and Realtime. |
| **Serverless function** | How Vercel runs each API route: started per request, no memory kept between requests. |
| **DTO** | The JSON shape of a thing sent to the browser, e.g. `Message` in `src/lib/types.ts`. Different from the database row. |
| **Pending message** | A message shown in the UI before the server confirmed it. It has a negative `id`. |
| **Nudge** | A one-tap love message (hug, kiss...) that plays a hearts animation. |
| **View once** | A photo or video the receiver can open one time only. |
| **PWA** | Progressive Web App: a website that can be installed like an app. |
