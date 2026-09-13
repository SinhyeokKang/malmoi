import { describe, expect, it } from "vitest";
import { imageObjectKey, planImageDelete, planImageUpload, sniffImageType } from "../image";

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
  it.each([799_999, 800_000, 800_001])("크기 경계 %i", (size) => {
    const bytes = new Uint8Array(size); bytes.set(png);
    expect(planImageUpload(bytes)).toEqual(size > 800_000 ? { ok: false, reason: "too-large" } : { ok: true, ext: "png" });
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
