import { handler, HttpError, idParam, requireCouple } from "@/server/api";
import { one, run } from "@/server/db";
import { streamMedia } from "@/server/files";
import { getMessageRow, publishMessage, type MediaRow } from "@/server/messages";

type Ctx = { params: Promise<{ id: string }> };

/** Opens a view-once photo or video. It can be opened once, by the receiver only. */
export const GET = handler(async (req, ctx: Ctx) => {
  const { user, partner, coupleId } = await requireCouple();
  const row = getMessageRow(await idParam(ctx));
  if (!row || row.couple_id !== coupleId || !row.view_once || !row.media_id) throw new HttpError(404, "Not found.");
  if (row.sender_id === user.id) throw new HttpError(403, "View-once media can only be opened by your partner.");
  if (row.viewed_at) throw new HttpError(410, "Already opened.");
  const media = one<MediaRow>("SELECT * FROM media WHERE id = ?", row.media_id);
  if (!media) throw new HttpError(404, "Not found.");
  run("UPDATE messages SET viewed_at = ? WHERE id = ?", Date.now(), row.id);
  publishMessage("message:update", getMessageRow(row.id)!, [user.id, partner.id]);
  return streamMedia(req, media, { cache: false });
});
