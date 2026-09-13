export type ImageType = "png" | "jpeg";
export type UploadReject = "too-large" | "unsupported-type" | "not-a-file" | "empty";
export const IMAGE_MAX_BYTES = 800_000;

export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  return null;
}

export function planImageUpload(bytes: Uint8Array): { ok: true; ext: ImageType } | { ok: false; reason: UploadReject } {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > IMAGE_MAX_BYTES) return { ok: false, reason: "too-large" };
  const ext = sniffImageType(bytes);
  return ext === null ? { ok: false, reason: "unsupported-type" } : { ok: true, ext };
}

export function imageObjectKey(userId: string, ext: ImageType, nonce: string): string {
  if (![userId, nonce].every((part) => /^[A-Za-z0-9_-]+$/.test(part)) || (ext !== "png" && ext !== "jpeg")) {
    throw new Error("Invalid image object key");
  }
  return `avatars/${userId}/${nonce}.${ext}`;
}

export function planImageDelete(prev: string | null): string | null {
  if (prev === null) return null;
  try {
    const url = new URL(prev);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname.endsWith(".public.blob.vercel-storage.com")) return null;
    const key = url.pathname.slice(1);
    return /^avatars\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(png|jpeg)$/.test(key) ? key : null;
  } catch { return null; }
}
