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

export function projectImageObjectKey(projectId: string, ext: StoredImageType, nonce: string): string {
  if (![projectId, nonce].every((part) => /^[A-Za-z0-9_-]+$/.test(part)) || !["png", "jpeg", "webp"].includes(ext)) {
    throw new Error("Invalid image object key");
  }
  return `projects/${projectId}/${nonce}.${ext}`;
}

export function planProjectImageDelete(prev: string | null): string | null {
  if (prev === null) return null;
  try {
    const url = new URL(prev);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname.endsWith(".public.blob.vercel-storage.com")) return null;
    const key = url.pathname.slice(1);
    return /^projects\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(png|jpeg|webp)$/.test(key) ? key : null;
  } catch { return null; }
}

/**
 * **저장된 이미지 URL을 자사 출처 경로로 바꾼다** (2026-09-28). 호스트는 `/api/images/[...key]`가
 * 서버에서 다시 붙인다.
 *
 * 기업 웹 필터(FortiGate)가 `*.vercel-storage.com`을 "File Sharing and Storage"로 막고 TLS를 자기
 * CA로 가로채, 그 망의 브라우저는 프로젝트 썸네일·프로필 사진에서 `ERR_CERT_AUTHORITY_INVALID`를
 * 받는다. `useImageFallback`의 폴백이 조용히 타일·이니셜로 떨어져 **사용자는 업로드가 실패한 줄 안다**
 * (업로드 자체는 끝까지 된다). `mal-moi.com`은 가로채이지 않으므로 **브라우저에 Blob 호스트를 아예
 * 주지 않는 것**이 유일한 해결이다.
 *
 * ⚠️ **환경변수를 읽지 않고, 읽는 모듈도 물지 않는다.** 이 함수는 클라이언트 컴포넌트가 닿는 잎이고
 * (`components/__tests__/client-graph.test.ts`의 `lib/upload/image.ts`), `BLOB_PUBLIC_HOST`는
 * `NEXT_PUBLIC_`이 아니라 브라우저에서 `undefined`다 — 여기서 읽으면 매핑이 **조용히 no-op**이 된다.
 *
 * ⚠️ **키 판정을 새로 쓰지 않고 삭제 계획 둘을 그대로 쓴다.** 입력이 우리 DB 값이라 방향만 반대이고,
 * 정규식을 복사하면 한쪽만 고쳐지는 자리가 생긴다. 그 allowlist가 경로 조각(`..`·`%2f`)도 막는다.
 *
 * ⚠️ **긴 캐시를 걸어도 안전하다** — 키에 난수가 들어가고(`imageObjectKey`·`projectImageObjectKey`)
 * 저장은 `addRandomSuffix: false`라, 교체할 때마다 URL이 통째로 바뀐다. 키를 결정적으로 바꾸는
 * 순간 그 전제가 깨져 낡은 이미지가 남을 수 있다(라우트의 캐시 헤더가 그 전제 위에 선다).
 */
export function imageSrc(url: string | null | undefined): string | null | undefined {
  if (url === null || url === undefined) return url;
  const key = planImageDelete(url) ?? planProjectImageDelete(url);
  return key === null ? url : `/api/images/${key}`;
}

/**
 * **프록시가 상류에 물어도 되는 키** (`/api/images/[...key]`, 2026-09-28).
 *
 * ⚠️ **`planImageDelete`·`planProjectImageDelete`를 재사용하지 않는다 — 방향이 반대다.** 그 둘은
 * URL→키 변환이고 호스트 검사가 **접미 일치**(`.endsWith(".public.blob.vercel-storage.com")`)라
 * **아무 Vercel 고객의 공개 스토어**를 통과시킨다. 입력이 우리 DB 값인 `imageSrc` 방향에서는 참이지만
 * **남이 정한 경로를 받는 이쪽**에서는 아니다. 아바타 키 판정을 넓히지 않는다는 §6.75의 규칙도
 * 일반화가 아니라 별도 술어로 지킨다.
 *
 * ⚠️ **이어 붙인 문자열 하나를 잰다 — 세그먼트별이 아니다.** Next가 catch-all 세그먼트를 디코드하므로
 * (`%2e%2e` → `..`, `%2f` → `/`) `%`·`.`·`@`·`?`·`#`·`\`·비ASCII가 전부 이어 붙인 문자열에 드러나고
 * 이 ASCII allowlist가 한 번에 막는다. 세그먼트별로 재면 개수 검사가 사라지는 날 새 축이 열린다.
 */
const STORED_IMAGE_KEY = /^(avatars|projects)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(png|jpeg|webp)$/;

export function isStoredImageKey(key: string): boolean {
  return STORED_IMAGE_KEY.test(key);
}

/**
 * 응답 `content-type`의 출처. ⚠️ **상류 헤더를 믿지 않는다** — 우리가 검증한 확장자가 정본이고,
 * 저장할 때 `putImage`가 같은 규칙으로 심는다. `isStoredImageKey`를 지난 키만 넘어온다.
 */
export function storedImageContentType(key: string): `image/${StoredImageType}` {
  return key.endsWith(".png") ? "image/png" : key.endsWith(".jpeg") ? "image/jpeg" : "image/webp";
}
