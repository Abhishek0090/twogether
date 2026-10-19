/** fetch() for our JSON API. Throws an Error with the server's message on failure. */
export async function api<T = unknown>(url: string, init: { method?: string; json?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
      headers: init.json !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      signal: init.signal,
      cache: "no-store",
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new Error("You seem to be offline. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/")) {
    window.location.href = "/login";
  }
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface UploadResult {
  id: number;
  url: string;
  mime: string;
  name: string;
  size: number;
}

/** Uploads a file with progress (0-1). Uses XHR because fetch has no upload progress. */
export function uploadFile(file: Blob, name: string, onProgress?: (p: number) => void, signal?: AbortSignal) {
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as UploadResult);
      else reject(new Error((xhr.response as { error?: string } | null)?.error ?? "Upload failed."));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    form.append("file", file, name);
    xhr.send(form);
  });
}

/** Shrinks big photos before upload (max 2048 px, JPEG) and reports their size. GIFs are left alone. */
export async function prepareImage(file: File): Promise<{ blob: Blob; name: string; w: number; h: number }> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { blob: file, name: file.name, w: 0, h: 0 };
  const { width, height } = bitmap;
  const max = 2048;
  if (file.type === "image/gif" || (Math.max(width, height) <= max && file.size < 1.5 * 1024 * 1024)) {
    bitmap.close();
    return { blob: file, name: file.name, w: width, h: height };
  }
  const scale = Math.min(1, max / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) return { blob: file, name: file.name, w: width, h: height };
  return { blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", w, h };
}

/** Reads width, height and duration of a video file. */
export function probeVideo(file: Blob) {
  return new Promise<{ w: number; h: number; duration: number }>((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({ w: video.videoWidth, h: video.videoHeight, duration: Number.isFinite(video.duration) ? video.duration : 0 });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      resolve({ w: 0, h: 0, duration: 0 });
      URL.revokeObjectURL(url);
    };
    video.src = url;
  });
}
