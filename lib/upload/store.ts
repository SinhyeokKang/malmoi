// 스모크 스크립트가 react-server 조건으로 이 프로덕션 경로를 그대로 밟는다.
import "server-only";
import { del, list, put, type ListBlobResultBlob } from "@vercel/blob";
import { deploymentMode, type DeploymentMode } from "@/lib/deployment/mode";
import { optionalEnv, requireEnv } from "@/lib/env";
import { isBlobPublicHost } from "@/lib/security-headers";
import { deleteFileImage, putFileImage, readFileImage } from "./file-store";
import type { StoredImageType } from "./image";

/**
 * **저장 경계** (self-hosting design §3). 소비자는 이 셋(put·read·delete)만 부르고, 배포 모드가 저장소를 고른다 — hosted는 Vercel Blob,
 * self-hosted는 `MALMOI_UPLOAD_DIR` 파일 볼륨(`./file-store.ts`). `listImages`는 `scripts/smoke-blob.ts` 전용이라 hosted에만 있다.
 *
 * ⚠️ **무효 모드는 어느 저장소에도 닿지 않는다** — `MALMOI_ORIGIN`과 `VERCEL_ENV`가 함께면 Blob으로도 볼륨으로도 떨어지지 않는다.
 */
function volumeMode(mode: DeploymentMode): boolean {
  if (mode.kind === "invalid") throw new Error("Deployment mode is invalid");
  return mode.kind === "self-hosted";
}

export async function putImage(key: string, bytes: Uint8Array, ext: StoredImageType): Promise<string> {
  // 확장자는 키에 이미 있고 볼륨 읽기는 키에서 MIME을 정한다(`storedImageContentType`).
  if (volumeMode(deploymentMode())) return putFileImage(requireEnv("MALMOI_UPLOAD_DIR"), key, bytes);
  const blob = await put(key, Buffer.from(bytes), {
    access: "public", addRandomSuffix: false,
    contentType: `image/${ext}`,
    token: requireEnv("BLOB_READ_WRITE_TOKEN"),
  });
  return blob.url;
}

/** 상류가 안 돌아오면 함수 하나가 그만큼 묶인다 — Blob은 같은 리전의 정적 객체라 5초면 넉넉하다. */
const READ_TIMEOUT_MS = 5000;

/**
 * **공개 스토어의 객체 하나를 읽는다** (`/api/images/[...key]`, 2026-09-28). 실패는 전부 `null`이다 —
 * 상태도 본문도 호출자에게 넘기지 않는다.
 *
 * ⚠️ **`fetch`에 헤더를 하나도 넘기지 않는다. 이것이 이 함수의 존재 이유다.** 같은 일을
 * `next.config.ts`의 외부 rewrite로 하면 Next가 **요청 헤더를 상류로 그대로 넘긴다** — 실측에서
 * `cookie: __Secure-authjs.session-token=…`과 `authorization: Bearer …`가 Blob 호스트에 도착했다.
 * `<img src="/api/images/…">`는 동일 출처라 브라우저가 세션 쿠키를 붙이고, 이 앱은 **DB 세션**이라
 * 그 토큰이 곧 계정 접근이다. 상시 방어선은 `__tests__/image-proxy-isolation.test.ts`다.
 *
 * ⚠️ **`redirect: "error"`다** — 상류 302를 따라가면 임의 호스트로 가는 **두 번째 길**이 열린다.
 * ⚠️ **URL은 검증 뒤 문자열 이어 붙이기다** — `new URL(key, base)`는 `..`를 해석한다.
 * ⚠️ **키는 호출자가 `isStoredImageKey`로 이미 걸렀다** — 그 술어를 지나지 않은 값을 넘기지 않는다.
 */
/** 볼륨 읽기 — `readImage`의 Blob 갈래와 같이 실패는 전부 `null`이다. 업로드 디렉터리가 비면 요청의 어떤 바이트도 디스크에 닿지 않는다. */
async function readVolumeImage(mode: DeploymentMode, key: string): Promise<ArrayBuffer | null> {
  const root = mode.kind === "self-hosted" ? optionalEnv("MALMOI_UPLOAD_DIR") : undefined;
  if (root === undefined) {
    console.error("Image proxy failed.", { stage: mode.kind === "invalid" ? "mode" : "upload-dir" });
    return null;
  }
  return readFileImage(root, key);
}

export async function readImage(key: string): Promise<ArrayBuffer | null> {
  const mode = deploymentMode();
  if (mode.kind !== "hosted") return readVolumeImage(mode, key);
  const host = optionalEnv("BLOB_PUBLIC_HOST");
  // 없거나 모양이 틀리면 **요청의 어떤 바이트도 나가지 않는다** — CSP의 같은 값과 같은 fail-closed다.
  if (host === undefined || !isBlobPublicHost(host)) {
    console.error("Image proxy failed.", { stage: "host" });
    return null;
  }
  try {
    const response = await fetch(`https://${host}/${key}`, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("Image proxy failed.", { stage: "upstream" });
      return null;
    }
    // ⚠️ 상류가 이미지가 아니면 버린다 — Blob의 오류 본문은 XML이고, 그것을 200으로 중계하면
    // `<img>`가 `naturalWidth === 0` 폴백에 흔적 없이 떨어진다.
    if (!(response.headers.get("content-type") ?? "").startsWith("image/")) {
      console.error("Image proxy failed.", { stage: "content-type" });
      return null;
    }
    // 200을 확정하기 전에 본문을 봐야 하므로 버퍼링한다 — 2~15KB라 스트리밍으로 얻을 것이 없다.
    // ⚠️ `ArrayBuffer`로 돌려준다 — `Uint8Array`는 `BodyInit`이 아니라 라우트가 복사를 한 번 더 한다.
    return await response.arrayBuffer();
  } catch {
    // 오류 원문은 남기지 않는다 — 남의 메시지를 로그에 싣지 않는 규칙이 `lib/failure.ts`와 같다.
    console.error("Image proxy failed.", { stage: "fetch" });
    return null;
  }
}

export async function deleteImage(key: string): Promise<void> {
  if (volumeMode(deploymentMode())) return deleteFileImage(requireEnv("MALMOI_UPLOAD_DIR"), key);
  await del(key, { token: requireEnv("BLOB_READ_WRITE_TOKEN") });
}

export async function listImages(prefix: "avatars/" | "projects/" = "avatars/"): Promise<ListBlobResultBlob[]> {
  const token = requireEnv("BLOB_READ_WRITE_TOKEN");
  const images: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, token });
    images.push(...page.blobs);
    if (!page.hasMore) return images;
    cursor = page.cursor;
  } while (cursor);
  throw new Error("Image listing ended without a cursor");
}
