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
