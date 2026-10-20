import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { MAX_UPLOAD_BYTES } from "@/lib/limits";
import { handler, HttpError, readJson, requireUser } from "@/server/api";
import { insert } from "@/server/db";
import { mediaUrl } from "@/server/messages";
import { signedUploadUrl } from "@/server/supabase";

/**
 * Step 1 of an upload. Creates the media record and returns a one-time link; the browser then PUTs the file
 * straight to Supabase Storage (Vercel functions only accept 4.5 MB request bodies, so files never pass through us).
 * Step 2 is POST /api/messages with the returned id.
 */
export const POST = handler(async (req) => {
  const user = await requireUser();
  const b = await readJson<{ name: string; mime: string; size: number }>(req);
  const size = Number(b.size);
  if (!Number.isFinite(size) || size <= 0) throw new HttpError(400, "No file received.");
  if (size > MAX_UPLOAD_BYTES) throw new HttpError(413, `File is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`);

  // Strip codec parameters ("audio/webm;codecs=opus") and refuse types that could run script when opened.
  let mime = String(b.mime || "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (!/^[a-z]+\/[a-z0-9.+-]+$/.test(mime) || mime === "image/svg+xml" || mime.includes("html") || mime.includes("xml")) {
    mime = "application/octet-stream";
  }
  const name = String(b.name || "file").replace(/[\\/\r\n]/g, "_").slice(0, 120);
  const ext = extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  const path = `${user.id}/${randomUUID()}${ext}`;

  const uploadUrl = await signedUploadUrl(path);
  const id = await insert(
    "INSERT INTO media (uploader_id, file, mime, name, size, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    user.id,
    path,
    mime,
    name,
    size,
    Date.now(),
  );
  return Response.json({ id, url: mediaUrl(id), mime, name, size, uploadUrl });
});
