import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { UPLOAD_DIR } from "./db";
import type { MediaRow } from "./messages";

/** Types the browser may display inline. Everything else is sent as a download. */
const INLINE = /^(image\/(jpeg|png|gif|webp|avif|heic|heif)|video\/(mp4|webm|quicktime)|audio\/.+|application\/pdf)$/;

/** Streams an uploaded file, honouring Range requests so audio and video can seek (Safari needs this). */
export function streamMedia(req: Request, media: MediaRow, { cache = true } = {}) {
  const path = join(UPLOAD_DIR, media.file);
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const headers = new Headers({
    "Content-Type": media.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": cache ? "private, max-age=31536000, immutable" : "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (media.mime !== "application/pdf") headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  const filename = encodeURIComponent(media.name ?? `file-${media.id}`);
  headers.set("Content-Disposition", `${INLINE.test(media.mime) ? "inline" : "attachment"}; filename*=UTF-8''${filename}`);

  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    const stream = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers });
  }
  headers.set("Content-Length", String(size));
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { status: 200, headers });
}
