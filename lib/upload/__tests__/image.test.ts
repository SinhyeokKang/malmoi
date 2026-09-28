import { describe, expect, it } from "vitest";
import { imageObjectKey, imageSrc, IMAGE_MAX_BYTES, isStoredImageKey, planImageDelete, planImagePick, planImageUpload, sniffImageType, storedImageContentType } from "../image";

const png = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
describe("이미지 형식과 크기", () => {
  it("PNG는 8바이트 전체가 맞아야 한다", () => {
    expect(sniffImageType(png)).toBe("png");
    for (let n = 0; n < 8; n++) expect(sniffImageType(png.slice(0, n))).toBeNull();
    expect(sniffImageType(Uint8Array.of(137, 80, 78, 71, 0, 0, 0, 0))).toBeNull();
  });
  it.each([0xe0, 0xe1, 0xdb, 0xee])("JPEG의 네 번째 바이트 %i를 제한하지 않는다", (marker) => {
    expect(sniffImageType(Uint8Array.of(255, 216, 255, marker))).toBe("jpeg");
    expect(sniffImageType(Uint8Array.of(255, 216))).toBeNull();
  });
  it.each(["<svg></svg>", "GIF89a", "RIFF0000WEBP", "0000ftypavif"])("이름과 MIME으로 %s를 허용하지 않는다", (text) => {
    expect(sniffImageType(new TextEncoder().encode(text))).toBeNull();
  });
  it("APNG와 손상된 PNG 본문도 시그니처로만 판정한다", () => {
    expect(sniffImageType(new Uint8Array([...png, ...new TextEncoder().encode("acTL")]))).toBe("png");
    expect(sniffImageType(new Uint8Array([...png, 0, 255]))).toBe("png");
  });
  it.each([2_999_999, 3_000_000, 3_000_001])("크기 경계 %i", (size) => {
    const bytes = new Uint8Array(size); bytes.set(png);
    expect(planImageUpload(bytes)).toEqual(size > 3_000_000 ? { ok: false, reason: "too-large" } : { ok: true });
  });
  it("빈 파일과 지원하지 않는 형식의 사유가 다르다", () => {
    expect(planImageUpload(new Uint8Array())).toEqual({ ok: false, reason: "empty" });
    expect(planImageUpload(Uint8Array.of(1))).toEqual({ ok: false, reason: "unsupported-type" });
  });
});
describe("이미지 키와 삭제 소유권", () => {
  it("같은 입력은 같은 키이고 교체 nonce는 URL을 바꾼다", () => {
    expect(imageObjectKey("u1", "png", "n1")).toBe("avatars/u1/n1.png");
    expect(imageObjectKey("u1", "png", "n1")).not.toBe(imageObjectKey("u1", "png", "n2"));
  });
  it("경로 탈출과 잘못된 확장자를 거부한다", () => {
    for (const value of ["../victim", "..", "a/b", "a\\b", "a%2fb", ""]) {
      expect(() => imageObjectKey(value, "png", "n1")).toThrow();
      expect(() => imageObjectKey("u1", "png", value)).toThrow();
    }
    // @ts-expect-error 런타임 입력도 확장자 allowlist를 지킨다.
    expect(() => imageObjectKey("u1", "../svg", "n1")).toThrow();
  });
  it("우리 호스트의 avatars 키만 삭제 대상으로 반환한다", () => {
    expect(planImageDelete("https://store.public.blob.vercel-storage.com/avatars/u1/n1.png")).toBe("avatars/u1/n1.png");
  });
  it.each([null, "bad-url", "https://avatars.githubusercontent.com/u/1", "https://lh3.googleusercontent.com/a/1", "https://store.public.blob.vercel-storage.com.evil.test/avatars/u/n.png", "https://store.public.blob.vercel-storage.com/other/u/n.png", "http://store.public.blob.vercel-storage.com/avatars/u/n.png", "https://store.public.blob.vercel-storage.com/avatars/"])("외부 또는 잘못된 URL %s는 지우지 않는다", (url) => {
    expect(planImageDelete(url)).toBeNull();
  });
});

/**
 * 클라이언트 선검사 (account-settings 태스크 4b).
 *
 * ⚠️ **서버 판정이 정본이고 이쪽은 바이트를 안 보내기 위한 1차 방어다.** 브라우저의 `File.type`은
 * 확장자에서 오므로 여기서 형식을 증명할 수 없다 — 증명하는 것은 서버의 `sniffImageType`이다.
 */
describe("클라이언트 선검사", () => {
  it("빈 파일과 상한 초과를 제출 전에 사유로 거부한다", () => {
    expect(planImagePick({ size: 0, type: "image/png" })).toEqual({ ok: false, reason: "empty" });
    expect(planImagePick({ size: IMAGE_MAX_BYTES + 1, type: "image/png" })).toEqual({ ok: false, reason: "too-large" });
    expect(planImagePick({ size: IMAGE_MAX_BYTES, type: "image/png" })).toEqual({ ok: true });
    expect(planImagePick({ size: 1, type: "image/jpeg" })).toEqual({ ok: true });
  });
  it.each(["image/svg+xml", "image/gif", "image/webp", "application/pdf", ""])("MIME %s는 고르는 즉시 거부한다", (type) => {
    expect(planImagePick({ size: 1, type })).toEqual({ ok: false, reason: "unsupported-type" });
  });
  /**
   * ⚠️ **이름만 `.png`로 바꾼 SVG는 여기서 안 걸린다 — 걸려서도 안 된다.** 그 거부는 **서버 사유**로
   * 화면에 닿아야 하고(완료 조건 4②), 클라이언트가 잡는 척하면 서버 사유가 도달하는 경로가 검증되지
   * 않은 채 남는다.
   */
  it("이름만 바꾼 SVG는 통과시키고 서버에 맡긴다", () => {
    expect(planImagePick({ size: 10, type: "image/png" })).toEqual({ ok: true });
    expect(planImageUpload(new TextEncoder().encode("<svg/>"))).toEqual({ ok: false, reason: "unsupported-type" });
  });
});

it("WebP 키를 만들고 새 WebP와 기존 PNG/JPEG를 모두 정리한다", () => {
  expect(imageObjectKey("u1", "webp", "n1")).toBe("avatars/u1/n1.webp");
  for (const ext of ["png", "jpeg", "webp"]) {
    expect(planImageDelete(`https://store.public.blob.vercel-storage.com/avatars/u1/n1.${ext}`)).toBe(`avatars/u1/n1.${ext}`);
  }
  expect(IMAGE_MAX_BYTES).toBe(3_000_000);
});

/**
 * **읽기 경로에서 Blob 호스트를 지운다** (2026-09-28).
 *
 * ⚠️ 기업 웹 필터(FortiGate)가 `*.vercel-storage.com`을 "File Sharing and Storage"로 막고 TLS를
 * 자기 CA로 가로채, 그 망의 브라우저는 업로드한 사진에서 `ERR_CERT_AUTHORITY_INVALID`를 받는다.
 * 잎의 폴백(`useImageFallback`)이 조용히 타일·이니셜로 떨어지므로 **사용자는 업로드가 실패한 줄 안다.**
 */
describe("이미지 읽기 경로 매핑", () => {
  it("두 접두 모두 자사 출처 경로가 되고 호스트가 남지 않는다", () => {
    const avatar = imageSrc("https://store.public.blob.vercel-storage.com/avatars/u1/n1.webp");
    expect(avatar).toBe("/api/images/avatars/u1/n1.webp");
    expect(avatar).not.toContain("vercel-storage.com");
    expect(imageSrc("https://store.public.blob.vercel-storage.com/projects/p1/n1.png")).toBe("/api/images/projects/p1/n1.png");
  });
  it.each([null, undefined, "", "/guide/home.png", "https://avatars.githubusercontent.com/u/1", "https://lh3.googleusercontent.com/a/1"])(
    "우리 객체가 아닌 %s는 그대로 지난다",
    (value) => { expect(imageSrc(value)).toBe(value); },
  );
  it.each([
    "https://store.public.blob.vercel-storage.com/other/u1/n1.webp",
    "https://store.public.blob.vercel-storage.com.evil.test/avatars/u1/n1.webp",
    "http://store.public.blob.vercel-storage.com/avatars/u1/n1.webp",
    "https://store.public.blob.vercel-storage.com/avatars/",
    "https://store.public.blob.vercel-storage.com/avatars/u1/n1.svg",
  ])("모양이 틀린 %s는 입력 그대로 지난다", (url) => {
    expect(imageSrc(url)).toBe(url);
  });
  /** 키는 `planImageDelete`/`planProjectImageDelete`의 allowlist를 지난다 — 경로 조각이 새면 우리 출처의 임의 경로를 만든다. */
  it.each([
    "https://store.public.blob.vercel-storage.com/avatars/../../secret/n1.webp",
    "https://store.public.blob.vercel-storage.com/avatars/u1/..%2fn1.webp",
    "https://store.public.blob.vercel-storage.com/avatars/u1%2Fn1.webp",
    "https://store.public.blob.vercel-storage.com/avatars/u1/n1.webp/../../etc",
  ])("경로 탈출 모양 %s은 매핑된 경로를 만들지 않는다", (url) => {
    expect(imageSrc(url)).not.toMatch(/^\/api\/images\//);
  });
});

/**
 * **프록시가 상류에 물을 수 있는 키** (`/api/images/[...key]`, 2026-09-28).
 *
 * ⚠️ **`planImageDelete`를 여기 재사용하지 않는다 — 방향이 반대다.** 그 둘은 URL→키 변환이고 호스트
 * 검사가 **접미 일치**(`.endsWith(".public.blob.vercel-storage.com")`)라, **아무 Vercel 고객의 스토어**를
 * 통과시킨다. 입력이 우리 DB 값인 `imageSrc` 방향에서는 참이지만 **남이 정한 경로를 받는 이쪽**에서는
 * 아니다. 그래서 별도 술어이고, 아바타 키 판정을 넓히지도 않는다(ARCHITECTURE §6.75).
 *
 * ⚠️ **이어 붙인 문자열 하나를 잰다 — 세그먼트별이 아니다.** Next가 catch-all 세그먼트를 디코드하므로
 * (`%2e%2e` → `..`, `%2f` → `/`) 이어 붙인 문자열에 `.`·`/`·`%`가 그대로 드러나고, ASCII allowlist가
 * 그것을 한 번에 막는다. 세그먼트별로 재면 개수 검사가 사라지는 날 새 축이 열린다.
 */
describe("프록시 키 술어", () => {
  it.each([
    "avatars/u1/n1.webp",
    "projects/p1/n1.png",
    "avatars/u_1/n-1.jpeg",
  ])("우리 객체 %s만 통과한다", (key) => {
    expect(isStoredImageKey(key)).toBe(true);
  });
  it.each([
    "",
    "avatars",
    "avatars/u1",
    "avatars/u1/n1.webp/extra",
    "other/u1/n1.webp",
    "avatars/../../secret/n1.webp",
    "avatars/u1/../n1.webp",
    "..",
    "avatars/u1%2Fn1.webp",
    "avatars/%2e%2e/n1.webp",
    "avatars/u1/n1.WEBP",
    "avatars/u1/n1.svg",
    "avatars/u1/n1.webp?x=1",
    "avatars/u1/n1.webp#f",
    "avatars/u1/n1.webp\\x",
    "avatars/u1@h/n1.webp",
    "avatars/유저/n1.webp",
    "avatars/u1/n1.webp\n",
    "/avatars/u1/n1.webp",
    "avatars//n1.webp",
  ])("%s는 막는다", (key) => {
    expect(isStoredImageKey(key)).toBe(false);
  });
  it("응답 content-type은 검증된 확장자에서 온다 — 상류 헤더가 아니다", () => {
    expect(storedImageContentType("avatars/u1/n1.webp")).toBe("image/webp");
    expect(storedImageContentType("projects/p1/n1.png")).toBe("image/png");
    expect(storedImageContentType("avatars/u1/n1.jpeg")).toBe("image/jpeg");
  });
});
