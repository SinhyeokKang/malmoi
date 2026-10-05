import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import SegmentNotFound from "../projects/[slug]/not-found";
import LegacyTranslationsNotFound from "../projects/[slug]/translations/not-found";
import { en } from "@/messages/en";

vi.mock("@/lib/i18n/server", async () => ({ getUiLocale: async () => "en", getMessages: async () => (await import("@/messages/en")).en }));

/**
 * **not-found 문구는 그 세그먼트가 실제로 잃은 것을 말한다** (audit #16). `[slug]/not-found.tsx`는 그 아래 모든
 * `notFound()`가 만나는 경계라 *"Translation surface unavailable"* 이면 Sources 조회 실패에도 표면 이야기를 했다.
 * 표면을 잃은 갈래(옛 `/translations`의 기본 표면)만 자기 경계에서 그 문장을 든다.
 */
it("프로젝트 세그먼트의 not-found는 표면을 단정하지 않고 목록으로 보낸다", async () => {
  const html = renderToStaticMarkup(await SegmentNotFound());
  expect(html).not.toContain(en.surfaces.missingTitle);
  expect(html).toContain(en.notFound.title);
  expect(html).toContain('href="/projects"');
});

it("기본 표면을 잃은 옛 번역 주소는 표면 문장을 그대로 든다", async () => {
  const html = renderToStaticMarkup(await LegacyTranslationsNotFound());
  expect(html).toContain(en.surfaces.missingTitle);
  expect(html).toContain('href="/projects"');
});
