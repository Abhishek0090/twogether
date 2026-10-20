# 8. Chat features, one by one

The chat screen is `src/components/chat/ChatView.tsx`. It puts together:

| Component | Job |
| --- | --- |
| `ChatHeader` | Partner name, avatar, status line, call buttons, menu |
| `MessageBubble` | One message, any type |
| `MessageText` | Text with links and *bold* / _italic_ / ~strike~ / `code` |
| `MessageMenu` | Long-press / right-click sheet: reactions, reply, copy, star, edit, info, delete |
| `Composer` | Text box, emoji, attachments, love nudges, voice recording |
| `SearchPanel` | Full-screen search |
| `Lightbox` | Full-screen photo/video viewer |
| `AudioPlayer` | Voice note player |
| `useRecorder` | Voice recording hook |
| `EmojiPicker` | Wrapper around `emoji-picker-react` |

## The message list and scrolling

Scrolling is the hardest part of any chat UI. `ChatView` handles five cases:

1. **First open.** After the first load, it scrolls to the "N unread messages" divider if there are unread messages, otherwise to the bottom (`useLayoutEffect`, so it happens before the screen paints).
2. **New message arrives.** If you were at the bottom (`pinned.current`), or the message is yours, it scrolls down smoothly. If you are reading older messages, it stays put and the round down-arrow button shows the unread count.
3. **Loading older messages.** When you scroll within 300 px of the top, `loadOlder()` runs. Adding content above would normally make the view jump, so the layout effect adds the height difference to `scrollTop`. That keeps the same message under your eyes.
4. **Images finish loading.** Images change height after they load. A `ResizeObserver` keeps you at the bottom if you were there.
5. **Jumping to a message** (search result, tapping a reply quote, starred message). `jumpTo(id)` loads 30 messages around it if needed, then the bubble with `data-mid="<id>"` is scrolled into view and flashes. Because the list now ends in the past, `hasNewer` is true; the down-arrow button reloads the latest messages.

**Grouping:** a bubble is the `first` of a group (gets the little corner and extra top margin) when the sender changes, the day changes, or 5 minutes passed. Day separators ("Today", "Yesterday", "Monday", "12 March") stick to the top while scrolling.

**React keys:** your own messages use `clientId` as the key, so when the pending copy is replaced by the real one React keeps the same element. Without that, a photo you just sent would flicker.

## Sending text

`Composer`:

- The textarea grows up to about 6 lines.
- **Enter** sends on computers. On touch devices Enter makes a new line and you tap the send button. Detection: `matchMedia("(pointer: coarse)")`.
- The draft is saved to `localStorage["tg-draft"]`, so it survives a reload.
- Typing sends `typing` events (at most every 3 s). Clearing the text, blurring or sending stops them.
- Pasting an image from the clipboard opens the send-file sheet.

## Photos, videos and files

1. The user picks files (Gallery, Camera, Document, View once), pastes, or drags them onto the chat (`ChatView` `onDrop` calls `composer.current.addFiles()`).
2. A preview sheet opens with a caption field and the view-once toggle (single photo/video only).
3. On **Send**, each file becomes `send({ type: "image" | "video" | "file", file, body: caption })`.
4. `deliver()` in `AppProvider`:
   - photos go through `prepareImage()`: large ones are shrunk and re-saved as JPEG, and width/height are recorded in `meta`, so the bubble reserves the right space before the image loads
   - videos go through `probeVideo()` for size and duration
   - `uploadFile()` uploads with progress; the bubble shows a progress ring
   - then `POST /api/messages` with the `mediaId`
5. While uploading, the bubble shows the local file through an object URL (`localUrl`), so you see your photo instantly.

## Voice notes

`useRecorder.ts`:

- `start()` asks for the microphone, picks a format the browser supports (`audio/webm;codecs=opus` on Chrome/Android, `audio/mp4` on Safari/iPhone), and starts `MediaRecorder`.
- Every 100 ms an `AnalyserNode` measures loudness. That drives the live level bars and is saved as 40 **peaks** for the waveform.
- `stop()` returns `{ blob, duration, peaks, mime }`. Recordings shorter than 0.6 s are dropped (accidental taps).
- While recording, the composer sends `typing: "recording"`, so the partner sees "recording audio...".

`AudioPlayer.tsx` draws the peaks as bars, lets you tap to seek, and cycles 1x / 1.5x / 2x. Only one voice note plays at a time (a module-level `current` audio element is paused when another starts). The duration comes from `meta.duration` because Chrome's recordings often report an unknown length.

## View once

- Sending: `viewOnce: true`. The server stores `view_once = 1`.
- Every API response blanks the media URL for view-once messages, and `GET /api/media/[id]` refuses their files. So no one can fetch the file directly.
- The receiver taps the bubble. `ChatView` calls `POST /api/messages/[id]/open`, which checks you are the receiver and it was never opened, sets `viewed_at`, sends `message:update` to both, and returns a Storage link valid for 60 seconds. The browser downloads the file into memory at once. The file is shown from a temporary object URL, with download disabled, and the URL is revoked when the viewer closes.
- Both bubbles then show "Opened". The sender cannot open it.

## Replies, reactions, star, copy

- **Reply:** swipe a bubble right on touch screens (more than 55 px), or use the menu. The composer shows a quote bar. The sent message has `replyTo`; the server sends a short preview of the original (`ReplyPreview`). Tapping the quote jumps to the original.
- **React:** quick row of 6 in the menu, `+` opens the full picker. **Double-tap** a bubble to toggle a heart. One reaction per person; tapping your reaction chip removes it.
- **Star:** private to you. Starred messages appear in Moments.
- **Copy:** copies the text.

`MessageBubble` handles touch itself: hold for 480 ms opens the menu (with a short vibration), horizontal drag past 55 px replies, anything else is a normal tap. On desktop, a small arrow appears on hover, and right-click also opens the menu.

## Edit and delete

- **Edit:** your own text messages, within 15 minutes (`EDIT_WINDOW_MS` in `src/lib/limits.ts`). The composer switches to edit mode with an amber bar. Edited messages show "edited".
- **Delete for me:** always allowed. Adds a `message_hidden` row.
- **Delete for everyone:** your own messages within 48 hours (`DELETE_WINDOW_MS`). Clears the body, removes the file from disk, removes reactions. Both sides show "This message was deleted".

The server enforces these windows. The menu only hides buttons that would fail.

## Message info

For your own messages, Info shows sent, delivered, read (and opened / edited) times.

## Search

`SearchPanel` waits 250 ms after you stop typing, then calls `GET /api/messages?q=...`. Results highlight the term. Tapping one closes search and jumps to the message, and the term stays highlighted in the chat.

## Header menu

Search, Media/links/docs (Moments), Starred, Wallpaper (Settings), Export chat (downloads a text file using your time zone), Clear chat (hides everything for you only).

## Text formatting

`MessageText.tsx` never uses `innerHTML`. It splits text into pieces with regular expressions and returns React elements:

1. Split by URLs: they become `<a target="_blank" rel="noopener noreferrer nofollow">`.
2. In the rest, `*x*` becomes bold, `_x_` italic, `~x~` strikethrough, `` `x` `` code.

Messages that are only 1-3 emoji (`isBigEmoji()` in `src/lib/emoji.ts`) are shown large without a bubble.

## Unread count and notifications inside the app

- On load, the server sends the real unread count.
- A partner message while you are on another tab: `unread + 1`, a toast with the preview, and a sound.
- The count appears on the Chat tab, in the browser tab title (`(3) Twogether`) and on the installed app icon (`navigator.setAppBadge`).
- Opening the chat sends `read` and resets the count on all your devices.

Continue with [09-calls-webrtc.md](09-calls-webrtc.md).
