import { handler, requireUser } from "@/server/api";

/** ICE servers for voice and video calls. Add a TURN server in .env for strict networks. */
export const GET = handler(async () => {
  await requireUser();
  const iceServers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(",").map((s) => s.trim()),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  return Response.json({ iceServers });
});
