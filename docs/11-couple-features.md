# 11. Couple features (the Us page)

Screen: `src/components/us/UsView.tsx`. Server queries: `src/server/together.ts`. Each card loads its own data and re-loads when a `refresh` event for its topic arrives, so both partners always see the same thing.

## Days together

`TogetherCard` reads `couple.anniversary` (`YYYY-MM-DD`). The numbers come from `src/lib/format.ts`:

| Function | Result |
| --- | --- |
| `daysSince(date)` | Whole days from that date to today |
| `timeTogether(date)` | `{ years, months, days }`, borrowing days from the previous month when needed |
| `daysUntil(date, yearly)` | Days to the next anniversary (0 = today) |

These run only after hydration (`useHydrated()`), because "today" depends on the user's time zone, which the server does not know. The pencil button saves a new date with `PATCH /api/couple`. The server refuses future dates.

## Nudges (hug, kiss, miss you, thinking of you, love you)

A nudge is a normal message with `type: "nudge"` and `body: "hug"` (or another kind). The list of kinds lives in `NUDGES` in `src/server/messages.ts` and in the components that show buttons.

When one arrives (`AppProvider` `onEvent`):

1. `emit({ t: "local:nudge", kind, fromMe: false })` makes `LoveBurst` float 26 emoji up the screen and show "Sam sent you a hug".
2. `playNudge()` plays a short chime, and the phone vibrates.
3. If the app is closed, the push says "🤗 sent you a hug".

Sending one plays the hearts on your own screen too (`fromMe: true`, without the caption).

## Moods

Stored on the user row (`mood_emoji`, `mood_text`, `mood_at`) and saved with `PATCH /api/profile`. The partner's mood emoji also shows next to their name in the chat header. Clearing sets all three back to `NULL`.

## Question of the day

- 60 questions in `src/lib/questions.ts`. `questionForDay(day)` hashes the date string, so everyone gets the same question on the same day without storing anything.
- "Today" is the **UTC** date (`today()` in `together.ts`), so partners in different countries share the same question. In India that means the question changes at 5:30 am.
- `dailyQuestion()` returns your answer and the partner's answer, but `partnerAnswer` stays `null` **until you have answered**. The client cannot cheat, because the server never sends it early.
- `questionStreak()` counts consecutive days where **both** answered, ending today or yesterday.
- When you answer, your partner gets `refresh: question`, plus a push if the app is not open.

## Countdowns (special dates)

`special_dates` rows with a title, date, emoji (chosen with the emoji picker) and a yearly flag. The list is sorted by days remaining, with past one-off dates last. Yearly dates (birthdays, anniversaries) roll over to next year automatically through `daysUntil()`.

## Bucket list

`bucket_items` rows. Ticking an item sets `done_at` and `done_by`. The server sorts open items first (newest first), then done ones. The progress bar is `done / total`. The screen updates instantly when you tick, then replaces the list with the server's answer.

## Moments page

`src/components/moments/MomentsView.tsx` has four tabs, each backed by `GET /api/messages?kind=...`:

| Tab | `kind` | Shows |
| --- | --- | --- |
| Media | `media` | Photo/video grid (not view-once), opens the `Lightbox` |
| Voice & docs | `files` | Voice notes with a player, documents with download |
| Links | `links` | Text messages containing `http(s)://` |
| Starred | `starred` | Your starred messages |

Tapping a date or starred message opens the chat **at that message**: Moments stores the id in `sessionStorage["tg-jump-to"]`, navigates to `/`, and `ChatView` reads it once the messages have loaded and calls `jump(id)`.

## Settings page

`src/components/settings/SettingsView.tsx`: profile photo (uploaded through `/api/media`, then `PATCH /api/profile { avatarMediaId }`), name, nickname for your partner, theme, shared wallpaper, in-app sounds, push notifications with a test button, install button, change password, export chat, sign out, and unlink.

Continue with [12-security.md](12-security.md).
