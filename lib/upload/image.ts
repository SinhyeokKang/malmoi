export type ImageType = "png" | "jpeg";
export type StoredImageType = ImageType | "webp";
/** ⚠️ **`too-large`(바이트)와 `too-many-pixels`(치수)는 다른 축이다** — 3MB 안에서도 치수는 클 수 있고,
 *  둘을 한 사유로 합치면 "3 MB를 넘는다"가 거짓인 화면이 뜬다. */
export type UploadReject = "too-large" | "too-many-pixels" | "unsupported-type" | "not-a-file" | "empty";
export const IMAGE_MAX_BYTES = 3_000_000;

export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  return null;
}

/**
 * ⚠️ **형식을 돌려주지 않는다** — 저장 확장자는 `normalizeImage`의 출력(webp) 하나로 고정됐고,
 * 여기서 `ext`를 흘리면 "입력 형식으로 저장한다"는 없어진 계약을 타입이 계속 광고한다.
 */
export function planImageUpload(bytes: Uint8Array): { ok: true } | { ok: false; reason: UploadReject } {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > IMAGE_MAX_BYTES) return { ok: false, reason: "too-large" };
  return sniffImageType(bytes) === null ? { ok: false, reason: "unsupported-type" } : { ok: true };
}

/**
 * 고르는 즉시 도는 클라이언트 선검사 (account-settings 태스크 4b).
 *
 * ⚠️ **서버 판정이 정본이다** — 이쪽이 하는 일은 **바이트를 안 보내는 것**뿐이다. 브라우저의
 * `File.type`은 확장자에서 오므로 여기서 형식을 증명할 수 없고, 이름만 `.png`로 바꾼 SVG는
 * 통과한다 — 그 거부는 `planImageUpload`의 시그니처 판정이 **서버 사유**로 돌려준다.
 *
 * ⚠️ **상한이 Next의 Server Action 본문 기본 상한(1 MB)보다 위다** — 그래서 `next.config.ts`가
 * `bodySizeLimit`을 4 MB로 올린다. 3 MB 파일에 multipart 프레이밍이 얹혀도 프레임워크가 먼저
 * 던지지 않아야 **우리 거부 사유가 화면에 닿는다**. 그 값을 되돌리면 이 상한이 거짓이 된다.
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
