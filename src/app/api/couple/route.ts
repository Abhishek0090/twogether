import { WALLPAPERS } from "@/lib/wallpapers";
import { handler, HttpError, readJson, requireCouple } from "@/server/api";
import { run, tx } from "@/server/db";
import { sendToUsers } from "@/server/realtime";
import { removeFiles } from "@/server/supabase";
import { getCouple, toBootstrap, toCouple } from "@/server/users";

export const GET = handler(async () => {
  const { user, partner, coupleId } = await requireCouple();
  return Response.json(toBootstrap(user, partner, (await getCouple(coupleId))!));
});

export const PATCH = handler(async (req) => {
  const { user, partner, coupleId } = await requireCouple();
  const body = await readJson<{ anniversary: string | null; wallpaper: string }>(req);
  if (body.anniversary !== undefined) {
    const value = body.anniversary || null;
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || Date.parse(value) > Date.now())) {
      throw new HttpError(400, "Pick a valid date that is not in the future.");
    }
    await run("UPDATE couples SET anniversary = ? WHERE id = ?", value, coupleId);
  }
  if (body.wallpaper !== undefined) {
    if (!WALLPAPERS.some((w) => w.id === body.wallpaper)) throw new HttpError(400, "Unknown wallpaper.");
    await run("UPDATE couples SET wallpaper = ? WHERE id = ?", body.wallpaper, coupleId);
  }
  await sendToUsers([user.id, partner.id], { t: "refresh", what: "couple" });
  return Response.json({ couple: toCouple((await getCouple(coupleId))!) });
});

/** Unlinks the couple and deletes the shared history, including uploaded files, for both partners. */
export const DELETE = handler(async (req) => {
  const { user, partner, coupleId } = await requireCouple();
  const body = await readJson<{ confirm: string }>(req);
  if (body.confirm !== "UNLINK") throw new HttpError(400, "Confirmation missing.");
  const files = await tx(async (db) => {
    const media = await db.all<{ id: number; file: string }>(
      "SELECT id, file FROM media WHERE id IN (SELECT media_id FROM messages WHERE couple_id = ? AND media_id IS NOT NULL)",
      coupleId,
    );
    await db.run("DELETE FROM couples WHERE id = ?", coupleId);
    if (media.length) await db.run(`DELETE FROM media WHERE id IN (${media.map(() => "?").join(",")})`, ...media.map((m) => m.id));
    await db.run("UPDATE users SET couple_id = NULL WHERE id IN (?, ?)", user.id, partner.id);
    return media.map((m) => m.file);
  });
  await removeFiles(files);
  await sendToUsers([user.id, partner.id], { t: "unpaired" });
  return Response.json({ ok: true });
});
