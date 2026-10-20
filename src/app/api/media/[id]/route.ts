import { handler, HttpError, idParam, requireUser } from "@/server/api";
import { one } from "@/server/db";
import type { MediaRow } from "@/server/messages";
import { signedDownloadUrl } from "@/server/supabase";
import { getPartner } from "@/server/users";

type Ctx = { params: Promise<{ id: string }> };

const LINK_SECONDS = 60 * 60;

/** Types the browser may show inline. Everything else downloads, so an uploaded file can never run as a page. */
const INLINE = /^(image\/(jpeg|png|gif|webp|avif|heic|heif)|video\/(mp4|webm|quicktime)|audio\/.+|application\/pdf)$/;

/**
 * Redirects to a short-lived signed Storage link. Only the uploader and their partner get one.
 * View-once media is never served here; it goes through POST /api/messages/[id]/open.
 */
export const GET = handler(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const media = await one<MediaRow>("SELECT * FROM media WHERE id = ?", await idParam(ctx));
  const partner = await getPartner(user);
  if (!media || (media.uploader_id !== user.id && media.uploader_id !== partner?.id)) throw new HttpError(404, "Not found.");
  if (await one("SELECT id FROM messages WHERE media_id = ? AND view_once = 1", media.id)) throw new HttpError(404, "Not found.");
  const url = await signedDownloadUrl(media.file, LINK_SECONDS, INLINE.test(media.mime) ? undefined : (media.name ?? "file"));
  return new Response(null, {
    status: 302,
    // The browser may reuse this redirect a little less long than the link lives.
    headers: { Location: url, "Cache-Control": `private, max-age=${LINK_SECONDS - 300}` },
  });
});
