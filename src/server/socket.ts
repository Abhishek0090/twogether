import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { CallSignal, ClientEvent, TypingState } from "@/lib/types";
import { readCookie, SESSION_COOKIE, userFromToken } from "./auth";
import { one, run } from "./db";
import { addConnection, connectionsOf, isOnline, removeConnection, sendToUser, type Connection } from "./realtime";
import { getPartner } from "./users";

const TYPING_STATES = new Set<TypingState>(["typing", "recording", null]);
const CALL_KINDS = new Set<CallSignal["kind"]>(["offer", "answer", "ice", "end", "reject", "busy", "ringing"]);

/** Marks everything the partner sent to `userId` as delivered and tells the partner. */
function markDelivered(userId: number, coupleId: number, partnerId: number) {
  const at = Date.now();
  const latest = one<{ id: number | null }>(
    "SELECT MAX(id) AS id FROM messages WHERE couple_id = ? AND sender_id = ? AND delivered_at IS NULL",
    coupleId,
    partnerId,
  )?.id;
  if (!latest) return;
  run(
    "UPDATE messages SET delivered_at = ? WHERE couple_id = ? AND sender_id = ? AND delivered_at IS NULL AND id <= ?",
    at,
    coupleId,
    partnerId,
    latest,
  );
  sendToUser(partnerId, { t: "receipt", kind: "delivered", readerId: userId, upTo: latest, at });
}

function markRead(conn: Connection, upTo: number) {
  if (!conn.coupleId) return;
  const user = { id: conn.userId, couple_id: conn.coupleId };
  const partner = getPartner(user);
  if (!partner) return;
  const at = Date.now();
  const { changes } = run(
    `UPDATE messages SET read_at = ?, delivered_at = COALESCE(delivered_at, ?)
     WHERE couple_id = ? AND sender_id = ? AND read_at IS NULL AND id <= ?`,
    at,
    at,
    conn.coupleId,
    partner.id,
    upTo,
  );
  if (!changes) return;
  const event = { t: "receipt", kind: "read", readerId: conn.userId, upTo, at } as const;
  sendToUser(partner.id, event);
  sendToUser(conn.userId, event, conn); // clears the unread badge on the user's other devices
}

function handleEvent(conn: Connection, event: ClientEvent) {
  const partner = conn.coupleId ? getPartner({ id: conn.userId, couple_id: conn.coupleId }) : undefined;
  switch (event.t) {
    case "ping":
      conn.socket.send(JSON.stringify({ t: "pong" }));
      return;
    case "visibility":
      conn.visible = !!event.visible;
      return;
    case "typing":
      if (partner && TYPING_STATES.has(event.state)) sendToUser(partner.id, { t: "typing", userId: conn.userId, state: event.state });
      return;
    case "read":
      if (Number.isInteger(event.upTo)) markRead(conn, event.upTo);
      return;
    case "call": {
      const data = event.data;
      if (!partner || !data || !CALL_KINDS.has(data.kind) || typeof data.callId !== "string") return;
      if (data.kind === "offer" && !isOnline(partner.id)) {
        conn.socket.send(JSON.stringify({ t: "call", data: { kind: "unavailable", callId: data.callId } }));
        return;
      }
      sendToUser(partner.id, { t: "call", data });
      // Stop the ringing on the user's other devices once one of them answers or declines.
      if (data.kind === "answer" || data.kind === "reject") {
        sendToUser(conn.userId, { t: "call", data: { kind: "end", callId: data.callId } }, conn);
      }
      return;
    }
  }
}

export function createSocketServer() {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const user = userFromToken(readCookie(req.headers.cookie, SESSION_COOKIE));
    if (!user) {
      ws.close(4401, "unauthorized");
      return;
    }
    const conn: Connection = { socket: ws, userId: user.id, coupleId: user.couple_id, visible: true };
    const wasOnline = isOnline(user.id);
    addConnection(conn);
    let alive = true;
    ws.on("pong", () => (alive = true));
    const heartbeat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 30_000);

    const partner = getPartner(user);
    ws.send(
      JSON.stringify({ t: "hello", partnerOnline: partner ? isOnline(partner.id) : false, partnerLastSeen: partner?.last_seen ?? null }),
    );
    if (partner && user.couple_id) {
      markDelivered(user.id, user.couple_id, partner.id);
      if (!wasOnline) sendToUser(partner.id, { t: "presence", userId: user.id, online: true, lastSeen: null });
    }

    ws.on("message", (raw) => {
      try {
        handleEvent(conn, JSON.parse(String(raw)) as ClientEvent);
      } catch {
        // ignore malformed frames
      }
    });

    ws.on("close", () => {
      clearInterval(heartbeat);
      removeConnection(conn);
      if (connectionsOf(user.id).length) return;
      const lastSeen = Date.now();
      run("UPDATE users SET last_seen = ? WHERE id = ?", lastSeen, user.id);
      const p = conn.coupleId ? getPartner({ id: user.id, couple_id: conn.coupleId }) : undefined;
      if (p) {
        sendToUser(p.id, { t: "presence", userId: user.id, online: false, lastSeen });
        sendToUser(p.id, { t: "typing", userId: user.id, state: null });
      }
    });
  });

  return wss;
}
