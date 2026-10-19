import { rmSync } from "node:fs";
import { join } from "node:path";
import { WALLPAPERS } from "@/lib/wallpapers";
import { handler, HttpError, readJson, requireCouple } from "@/server/api";
import { all, run, tx, UPLOAD_DIR } from "@/server/db";
import { sendToUser, sendToUsers, updateCoupleOf } from "@/server/realtime";
import { getCouple, toCouple, toMe, toPublicUser } from "@/server/users";

export const GET = handler(async () => {
  const { user, partner, coupleId } = await requireCouple();
  return Response.json({ me: toMe(user), partner: toPublicUser(partner), couple: toCouple(getCouple(coupleId)!) });
});

export const PATCH = handler(async (req) => {
  const { user, partner, coupleId } = await requireCouple();
  const body = await readJson<{ anniversary: string | null; wallpaper: string }>(req);
  if (body.anniversary !== undefined) {
    const value = body.anniversary || null;
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || Date.parse(value) > Date.now())) {
      throw new HttpError(400, "Pick a valid date that is not in the future.");
    }
    run("UPDATE couples SET anniversary = ? WHERE id = ?", value, coupleId);
  }
  if (body.wallpaper !== undefined) {
    if (!WALLPAPERS.some((w) => w.id === body.wallpaper)) throw new HttpError(400, "Unknown wallpaper.");
    run("UPDATE couples SET wallpaper = ? WHERE id = ?", body.wallpaper, coupleId);
  }
  sendToUsers([user.id, partner.id], { t: "refresh", what: "couple" });
  return Response.json({ couple: toCouple(getCouple(coupleId)!) });
});

/** Unlinks the couple and deletes the shared history, including uploaded files, for both partners. */
export const DELETE = handler(async (req) => {
  const { user, partner, coupleId } = await requireCouple();
  const body = await readJson<{ confirm: string }>(req);
  if (body.confirm !== "UNLINK") throw new HttpError(400, "Confirmation missing.");
  const files = tx(() => {
    const media = all<{ id: number; file: string }>(
      "SELECT id, file FROM media WHERE id IN (SELECT media_id FROM messages WHERE couple_id = ? AND media_id IS NOT NULL)",
      coupleId,
    );
    run("DELETE FROM couples WHERE id = ?", coupleId);
    for (const m of media) run("DELETE FROM media WHERE id = ?", m.id);
    run("UPDATE users SET couple_id = NULL WHERE id IN (?, ?)", user.id, partner.id);
    return media.map((m) => m.file);
  });
  for (const f of files) rmSync(join(UPLOAD_DIR, f), { force: true });
  updateCoupleOf(user.id, null);
  updateCoupleOf(partner.id, null);
  sendToUser(partner.id, { t: "unpaired" });
  sendToUser(user.id, { t: "unpaired" });
  return Response.json({ ok: true });
});
