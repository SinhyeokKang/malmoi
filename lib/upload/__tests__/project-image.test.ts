import { expect, it } from "vitest";
import { projectImageObjectKey, planProjectImageDelete, planImageDelete } from "../image";
it("프로젝트 키는 아바타와 분리되고 확장자와 경로를 제한한다", () => {
  expect(projectImageObjectKey("p", "webp", "n")).toBe("projects/p/n.webp");
  for (const value of ["", "../p", "a/b", "a%2fb", "a\\b"]) {
    expect(() => projectImageObjectKey(value, "webp", "n")).toThrow();
    expect(() => projectImageObjectKey("p", "webp", value)).toThrow();
  }
  // @ts-expect-error 외부 입력의 확장자도 제한한다.
  expect(() => projectImageObjectKey("p", "svg", "n")).toThrow();
  const url = "https://store.public.blob.vercel-storage.com/projects/p/n.webp";
  expect(planProjectImageDelete(url)).toBe("projects/p/n.webp");
  expect(planImageDelete(url)).toBeNull();
});
it.each([null, "bad", "https://store.public.blob.vercel-storage.com/avatars/p/n.webp", "http://store.public.blob.vercel-storage.com/projects/p/n.webp", "https://store.public.blob.vercel-storage.com.evil.test/projects/p/n.webp", "https://u:p@store.public.blob.vercel-storage.com/projects/p/n.webp", "https://store.public.blob.vercel-storage.com:123/projects/p/n.webp"])("다른 소유권 %s는 삭제하지 않는다", url => {
  expect(planProjectImageDelete(url)).toBeNull();
});

it("self-hosted 상대 경로도 같은 키다 — Blob URL과 `/api/images/<key>`가 한 객체(self-hosting design §3)", () => {
  expect(planProjectImageDelete("/api/images/projects/p/n.webp")).toBe("projects/p/n.webp");
  expect(planProjectImageDelete("/api/images/projects/p/n.webp")).toBe(planProjectImageDelete("https://store.public.blob.vercel-storage.com/projects/p/n.webp"));
  expect(planImageDelete("/api/images/projects/p/n.webp")).toBeNull();
});
it.each(["/api/images/avatars/p/n.webp", "/api/images/email/projects/p/n.webp", "/api/images/projects/../n.webp", "/api/images/projects/p/n.webp?x", "/api/images/projects/p%2fn.webp", "/api/images/projects/p/n.gif", "https://example.com/api/images/projects/p/n.webp"])("모양 밖 상대 경로 %s는 삭제하지 않는다", path => {
  expect(planProjectImageDelete(path)).toBeNull();
});
