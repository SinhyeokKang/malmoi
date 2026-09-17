export type ImageType = "png" | "jpeg";
export type StoredImageType = ImageType | "webp";
export type UploadReject = "too-large" | "unsupported-type" | "not-a-file" | "empty";
export const IMAGE_MAX_BYTES = 3_000_000;

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

/**
 * 고르는 즉시 도는 클라이언트 선검사 (account-settings 태스크 4b).
 *
 * ⚠️ **서버 판정이 정본이다** — 이쪽이 하는 일은 **바이트를 안 보내는 것**뿐이다. 브라우저의
 * `File.type`은 확장자에서 오므로 여기서 형식을 증명할 수 없고, 이름만 `.png`로 바꾼 SVG는
 * 통과한다 — 그 거부는 `planImageUpload`의 시그니처 판정이 **서버 사유**로 돌려준다.
 *
 * next.config.ts allows 4 MB requests so a 3 MB file plus multipart framing reaches the action.
 */
export function planImagePick(file: { size: number; type: string }): { ok: true } | { ok: false; reason: UploadReject } {
  if (file.size === 0) return { ok: false, reason: "empty" };
  if (file.size > IMAGE_MAX_BYTES) return { ok: false, reason: "too-large" };
  // 배열 `includes`다 — MIME이 남이 정한 값이라 객체 조회는 프로토타입 키를 통과시킨다.
  return ["image/png", "image/jpeg"].includes(file.type) ? { ok: true } : { ok: false, reason: "unsupported-type" };
}

export function imageObjectKey(userId: string, ext: StoredImageType, nonce: string): string {
  if (![userId, nonce].every((part) => /^[A-Za-z0-9_-]+$/.test(part)) || !["png", "jpeg", "webp"].includes(ext)) {
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
    return /^avatars\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(png|jpeg|webp)$/.test(key) ? key : null;
  } catch { return null; }
}
