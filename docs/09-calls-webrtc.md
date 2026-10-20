# 9. Voice and video calls (WebRTC)

File: `src/components/call/CallProvider.tsx` (all call logic and the call screen).

## The idea in plain words

**WebRTC** lets two browsers send audio and video **directly to each other**. Our server never touches the call audio or video. It only helps the two browsers find each other, by passing a few small messages between them. That is called **signalling**, and we do it over the existing WebSocket.

Signals travel on the couple's shared Realtime channel as `{ t: "call", from, data }` (see [06](06-realtime-websocket.md)), browser to browser. Three things get exchanged:

| Thing | What it is |
| --- | --- |
| **Offer** | The caller's description of its media (codecs, audio/video), an SDP text blob |
| **Answer** | The callee's reply to the offer |
| **ICE candidates** | Possible network addresses ("try me at 192.168.1.5:54321", "or at my public IP 49.x.x.x:6000") |

To learn its **public** address from behind a home router, each browser asks a **STUN** server (we use Google's free ones). If both devices are behind strict networks (some mobile carriers, offices), direct connection is impossible and you need a **TURN** server, which relays the traffic. Configure one with `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`. `GET /api/rtc` hands the list to the browser.

## The call flow

```mermaid
sequenceDiagram
  participant A as Alex (caller)
  participant S as Couple channel (Supabase Realtime)
  participant B as Sam (callee)
  A->>A: getUserMedia (mic, camera)
  alt Sam not present on the channel
    A->>A: end, log "missed call" message (push to Sam)
  else Sam online
    A->>A: createOffer, setLocalDescription
    A->>S: call { offer, callId, video, sdp }
    S->>B: call { offer }
    B->>S: call { ringing }
    S->>A: call { ringing }
    Note over B: rings; user taps Accept
    B->>B: getUserMedia, setRemoteDescription(offer), createAnswer
    B->>S: call { answer, sdp }
    S->>A: call { answer }
    A->>A: setRemoteDescription(answer)
    A-->>B: call { ice } (many, both directions, via the channel)
    A-->>B: audio/video flows directly (peer to peer)
  end
```

No server code is involved. Before sending the offer, the caller checks Realtime presence: if the partner is not online, it logs a missed call straight away. Every device of the callee receives the offer and rings. When one of them answers or declines, the callee's **other** devices see that signal too (it carries `from` = their own user id) and stop ringing.

## States

`call.phase` moves through:

```text
idle -> outgoing -> connecting -> active -> ended -> idle      (you call)
idle -> incoming -> connecting -> active -> ended -> idle      (you are called)
```

`ended` shows the reason ("Call ended", "No answer", "Sam declined"...) for 1.6 s, then returns to `idle`.

## Important functions

| Function | Does |
| --- | --- |
| `startCall(video)` | Gets mic/camera, creates the `RTCPeerConnection`, sends the offer, starts the outgoing tone, and a 45 s "no answer" timer |
| `accept()` | Gets mic/camera, applies the offer, sends the answer |
| `decline()` | Sends `reject` |
| `hangUp()` | Sends `end` |
| `createPeer()` | Builds the connection: adds local tracks, sends ICE candidates as they appear, receives the remote stream, watches the connection state |
| `flushIce()` | ICE candidates can arrive **before** the offer/answer is applied. They wait in `pendingIce` and are added afterwards. |
| `finish(label, status)` | Stops camera/mic, closes the connection, stops ringing. If **you** made the call, it writes the call into the chat. |
| `toggleMute`, `toggleCamera` | Turn the track off (`track.enabled = false`), the connection stays up |
| `flipCamera()` | Gets the other camera and swaps it in with `sender.replaceTrack()`, no reconnect needed |

### Who writes the call message?

Only the **caller**, once, in `finish()`. It sends a normal message `{ type: "call", meta: { video, status, duration } }` with status `ended` (with duration if it connected), `missed` (no answer, cancelled, partner offline or busy) or `declined`. A missed call message also triggers a push notification to the partner, so "missed call" reaches a closed phone. The call bubble has a "Tap to call back" button.

### Connection problems

`onconnectionstatechange`:

- `connected`: phase becomes `active`, the timer starts.
- `failed`: end the call ("Connection failed").
- `disconnected`: wait 8 s (networks often recover, e.g. switching Wi-Fi to mobile data), then end ("Connection lost").

Closing the tab during a call sends `end` (`pagehide` listener).

## The call screen (`CallOverlay`)

- Video call with remote video: the partner's video fills the screen; your camera is a small picture in the corner (mirrored, like a selfie).
- Voice call, or before video arrives: the partner's avatar on a gradient, pulsing while ringing.
- Remote audio always plays through a hidden `<audio>` element. The remote `<video>` is muted, so you never hear the audio twice.
- Buttons: Accept / Decline when ringing. Mute, Camera on/off, Flip, End during a call.
- If the tab is in the background when a call comes in and notifications are allowed, it shows a system notification "Incoming video call".

## Limits

- A call only rings if the partner has the app open (present on the couple channel). With the app fully closed, they get the "missed call" push afterwards. Ringing a closed phone needs native app features that web apps do not have.
- Camera and microphone need https or localhost.
- Without TURN, some network combinations cannot connect.

Continue with [10-pwa-and-push.md](10-pwa-and-push.md).
