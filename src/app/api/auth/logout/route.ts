import { cookies } from "next/headers";
import { deleteSession, SESSION_COOKIE } from "@/server/auth";
import { handler } from "@/server/api";

export const POST = handler(async () => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  store.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
});
