// Twogether server: Next.js app + WebSocket endpoint (/ws) on one port.
//   npm run dev     development with hot reload
//   npm run start   production (run `npm run build` first)
import { EventEmitter } from "node:events";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { networkInterfaces } from "node:os";
import type { Duplex } from "node:stream";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`Twogether needs Node.js 22.13 or newer (built-in SQLite). You have ${process.versions.node}.`);
  process.exit(1);
}

const prod = process.argv.includes("--prod");
if (prod) (process.env as Record<string, string>).NODE_ENV = "production";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

// Imported after NODE_ENV is set, so Next.js picks the right mode.
const { default: next } = await import("next");
const { createSocketServer } = await import("./src/server/socket");

// Next.js attaches its own "upgrade" listener to the server it is given. Hand it a dummy emitter
// instead, and route upgrades below: /ws to our socket server, everything else (HMR) to Next.js.
const upgradeSink = new EventEmitter() as unknown as Server;
const app = next({ dev: !prod, hostname: "localhost", port, httpServer: upgradeSink });
const handle = app.getRequestHandler();
await app.prepare();
// The router-level handler (what Next.js itself attaches); it serves HMR in development.
// app.getUpgradeHandler() points at the inner server, which does not handle HMR.
type UpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => Promise<void>;
const nextUpgrade = (app as unknown as { upgradeHandler: UpgradeHandler }).upgradeHandler;

const wss = createSocketServer();
const server = createServer((req, res) => void handle(req, res));

server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  if (pathname === "/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } else {
    void nextUpgrade(req, socket, head);
  }
});

server.listen(port, host, () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
  console.log(`\n  Twogether ${prod ? "(production)" : "(development)"}`);
  console.log(`  Local:   http://localhost:${port}`);
  if (lan && host === "0.0.0.0") console.log(`  Network: http://${lan}:${port}`);
  console.log("");
});
