import { handler, HttpError, idParam, requireCouple } from "@/server/api";
import { one, run } from "@/server/db";
import { getMessageRow, publishMessage, type MediaRow } from "@/server/messages";
import { signedDownloadUrl } from "@/server/supabase";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Opens a view-once photo or video: the receiver only, one time.
 * Returns a link that works for 60 seconds; the browser downloads the file into memory straight away.
 */
export const POST = handler(async (_req, ctx: Ctx) => {
  const { user, partner, coupleId } = await requireCouple();
  const row = await getMessageRow(await idParam(ctx));
  if (!row || row.couple_id !== coupleId || !row.view_once || !row.media_id) throw new HttpError(404, "Not found.");
  if (row.sender_id === user.id) throw new HttpError(403, "View-once media can only be opened by your partner.");
  const media = await one<MediaRow>("SELECT * FROM media WHERE id = ?", row.media_id);
  if (!media) throw new HttpError(404, "Not found.");
  // Mark as viewed only if nobody else did first (two tabs tapping at once).
  const { changes } = await run("UPDATE messages SET viewed_at = ? WHERE id = ? AND viewed_at IS NULL", Date.now(), row.id);
  if (!changes) throw new HttpError(410, "Already opened.");
  const url = await signedDownloadUrl(media.file, 60);
  await publishMessage("message:update", (await getMessageRow(row.id))!, [user.id, partner.id]);
  return Response.json({ url, mime: media.mime });
});
