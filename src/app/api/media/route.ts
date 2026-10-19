import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { MAX_UPLOAD_BYTES } from "@/lib/limits";
import { handler, HttpError, requireUser } from "@/server/api";
import { run, UPLOAD_DIR } from "@/server/db";
import { mediaUrl } from "@/server/messages";

/** Uploads one file (form field "file"). Send it as a message with POST /api/messages afterwards. */
export const POST = handler(async (req) => {
  const user = await requireUser();
  const size = Number(req.headers.get("content-length") ?? 0);
  if (size > MAX_UPLOAD_BYTES + 64 * 1024) throw new HttpError(413, "File is too large (max 64 MB).");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Upload failed. Try again.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "No file received.");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "File is too large (max 64 MB).");

  // Strip codec parameters ("audio/webm;codecs=opus") and refuse types that could run script inline.
  let mime = (file.type || "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (!/^[a-z]+\/[a-z0-9.+-]+$/.test(mime) || mime === "image/svg+xml" || mime.includes("html") || mime.includes("xml")) {
    mime = "application/octet-stream";
  }
  const name = (file.name || "file").replace(/[\\/\r\n]/g, "_").slice(0, 120);
  const ext = extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  const stored = `${randomUUID()}${ext}`;
  await writeFile(join(UPLOAD_DIR, stored), Buffer.from(await file.arrayBuffer()));

  const { id } = run(
    "INSERT INTO media (uploader_id, file, mime, name, size, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    user.id,
    stored,
    mime,
    name,
    file.size,
    Date.now(),
  );
  return Response.json({ id, url: mediaUrl(id), mime, name, size: file.size });
});
