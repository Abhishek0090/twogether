import type { ServerEvent } from "@/lib/types";

/** Minimal view of a `ws` socket, so route handlers do not need to import `ws`. */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface Connection {
  socket: SocketLike;
  userId: number;
  coupleId: number | null;
  visible: boolean;
}

interface Hub {
  connections: Set<Connection>;
}

// Shared between the custom server (owns the sockets) and the route handlers (publish events).
const g = globalThis as unknown as { __twogetherHub?: Hub };
const hub = (g.__twogetherHub ??= { connections: new Set() });

const OPEN = 1;

export function addConnection(conn: Connection) {
  hub.connections.add(conn);
}

export function removeConnection(conn: Connection) {
  hub.connections.delete(conn);
}

export function connectionsOf(userId: number) {
  return [...hub.connections].filter((c) => c.userId === userId && c.socket.readyState === OPEN);
}

/** Has at least one open socket (app open in some tab, maybe in the background). */
export function isOnline(userId: number) {
  return connectionsOf(userId).length > 0;
}

/** Has the app open and visible on screen right now. */
export function isActive(userId: number) {
  return connectionsOf(userId).some((c) => c.visible);
}

export function sendToUser(userId: number, event: ServerEvent, except?: Connection) {
  const payload = JSON.stringify(event);
  let sent = 0;
  for (const conn of connectionsOf(userId)) {
    if (conn === except) continue;
    conn.socket.send(payload);
    sent++;
  }
  return sent;
}

export function sendToUsers(userIds: number[], event: ServerEvent) {
  for (const id of userIds) sendToUser(id, event);
}

/** Keeps open sockets in step after pairing or unpairing. */
export function updateCoupleOf(userId: number, coupleId: number | null) {
  for (const conn of connectionsOf(userId)) conn.coupleId = coupleId;
}
