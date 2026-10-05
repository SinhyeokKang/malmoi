import { expect, it, vi } from "vitest";
const forbidden = vi.hoisted(() => vi.fn(() => { throw new Error("private dependency called"); }));
vi.mock("@/lib/db", () => ({ getPrisma: forbidden }));
vi.mock("@/auth", () => ({ auth: forbidden }));
vi.mock("next/headers", () => ({ cookies: forbidden }));
vi.mock("@/lib/guide/load", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/guide/load")>();
  return { ...original, loadSummary: vi.fn(original.loadSummary) };
});
import { loadSummary } from "@/lib/guide/load";
import { dynamic, dynamicParams, generateStaticParams, GET } from "../route";

const get = async (uiLocale: string) => GET(new Request(`http://x/api/search-index/${uiLocale}`), { params: Promise.resolve({ uiLocale }) });

it("공개 가이드만 정적으로 서빙하고 세션·DB·쿠키를 부르지 않는다", async () => {
  expect(dynamic).toBe("force-static");
  const response = await get("en");
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(Object.keys(body)).toEqual(["docs"]);
  expect(body.docs.length).toBeGreaterThan(28);
  expect(JSON.stringify(body)).not.toMatch(/AUTHORING|SHOOTING/);
  expect(forbidden).not.toHaveBeenCalled();
});

it("언어별 정적 파일 — 원고 트리가 있는 언어만 만들고 나머지 경로는 없다", async () => {
  // 쿠키로 갈라질 수 없는 force-static이라 언어가 URL에 실린다(ui-locales design §6.1). 트리가 없는 언어를 만들면 빌드가 던진다
  expect(dynamicParams).toBe(false);
  const params = await generateStaticParams();
  expect(params).toContainEqual({ uiLocale: "en" });
  expect(params).toEqual([{ uiLocale: "en" }, { uiLocale: "ko" }, { uiLocale: "es" }]);
});

it("ko 색인은 ko 원고의 제목을 들고, 주소와 절은 en과 같다", async () => {
  const en: { docs: { href: string; title: string }[] } = await (await get("en")).json();
  const ko: { docs: { href: string; title: string }[] } = await (await get("ko")).json();
  expect(ko.docs.map(d => d.href)).toEqual(en.docs.map(d => d.href));
  expect(ko.docs.map(d => d.title)).toContain("번역 편집");
  expect(en.docs.map(d => d.title)).toContain("Edit translations");
});

it("가이드 읽기 실패는 빈 색인으로 숨기지 않고 빌드를 실패시킨다", async () => {
  vi.mocked(loadSummary).mockImplementationOnce(() => { throw new Error("missing guide"); });
  await expect(get("en")).rejects.toThrow("missing guide");
});
