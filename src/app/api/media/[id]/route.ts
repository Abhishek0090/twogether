import { handler, HttpError, idParam, requireUser } from "@/server/api";
import { one } from "@/server/db";
import { streamMedia } from "@/server/files";
import type { MediaRow } from "@/server/messages";
import { getPartner } from "@/server/users";

type Ctx = { params: Promise<{ id: string }> };

/** Serves an upload to its uploader and their partner. View-once media goes through /api/messages/[id]/open. */
export const GET = handler(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const media = one<MediaRow>("SELECT * FROM media WHERE id = ?", await idParam(ctx));
  const partner = getPartner(user);
  if (!media || (media.uploader_id !== user.id && media.uploader_id !== partner?.id)) throw new HttpError(404, "Not found.");
  if (one("SELECT id FROM messages WHERE media_id = ? AND view_once = 1", media.id)) throw new HttpError(404, "Not found.");
  return streamMedia(req, media);
});
