// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **`state=`·완성도로 좁히는 앱 내부 링크는 네임스페이스로 좁히지 않는다** (POSTMORTEM 2026-09-15 — 두 좁힘이 교집합을 비워 0건 착지).
 *
 * 그 항목의 재발 방지는 grep이었는데 `cardQuery()` 도입 뒤 0건이라 공허하게 참이었다 — 규칙대로 **테스트가 센다**(POSTMORTEM 2026-09-15
 * 두 번째 항목). 생산자 셋 전수: Home 카운트 카드(`cardQuery`) · Home 주의 카드(`attention-card.tsx`) · 옛 `/translations` redirect.
 * 범위는 기본값(All sources)이라 주소에 `scope`가 없다(translation-filter-scope).
 */
const nav = vi.hoisted(() => ({ redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }) }));
vi.mock("next/navigation", () => ({ redirect: nav.redirect, notFound: () => { throw new Error("notFound"); }, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth/session", () => ({ requireProjectAccess: async () => ({ projectId: "p" }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ project: { findUnique: async () => ({ defaultSurface: { slug: "web", archivedAt: null } }) } }) }));

import LegacyTranslations from "@/app/(edit)/projects/[slug]/translations/page";
import { AttentionCard } from "@/components/home/attention-card";
import { CountCards } from "@/components/home/count-cards";
import type { HomeCard } from "@/lib/home/cards";
import { parseTranslationQuery } from "@/lib/translations/query";

const now = new Date("2026-09-30T00:00:00Z");
const narrowing = (href: string) => {
  const params = new URL(href, "http://x").searchParams;
  return { ns: params.get("ns"), scope: params.get("scope"), state: params.get("state"), completion: params.get("completion"), parsedNs: parseTranslationQuery(Object.fromEntries(params)).ns };
};

it("Home 카운트 카드 넷은 ns=*를 싣는다", async () => {
  const card = (key: HomeCard["key"]): HomeCard => ({ key, value: 1, unit: "cells", muted: false, tone: null, subline: { kind: "nothingPending" } });
  const { container } = await render(<CountCards cards={(["newFromGithub", "toTranslate", "toReview", "toSend"] as const).map(card)} slug="acme" surfaceSlug="web" now={now} />);
  const hrefs = [...container.querySelectorAll("a")].map(a => a.getAttribute("href")!);
  expect(hrefs).toHaveLength(4);
  for (const href of hrefs) expect(narrowing(href)).toMatchObject({ ns: "*", scope: null, parsedNs: "*" });
});

it("Home 주의 카드의 검토 대기·빈 로케일 링크는 ns=*를 싣는다", async () => {
  const items = [
    { kind: "review" as const, at: now, surfaceSlug: "web", code: "ko", name: "Korean", count: 2, who: null },
    { kind: "never_filled" as const, at: now, surfaceSlug: "app", code: "ja", name: "Japanese", keys: 3 },
  ];
  const { container } = await render(<AttentionCard items={{ shown: items, more: [], count: 2 }} slug="acme" role="OWNER" state="default" now={now} />);
  const hrefs = [...container.querySelectorAll("a")].map(a => a.getAttribute("href")!).filter(href => href.includes("/translations"));
  expect(hrefs).toHaveLength(2);
  expect(narrowing(hrefs[0]!)).toMatchObject({ ns: "*", state: "review", parsedNs: "*" });
  expect(narrowing(hrefs[1]!)).toMatchObject({ ns: "*", completion: "missing", parsedNs: "*" });
});

/*
  옛 공가 라우트는 parse → serialize로 정규화한다. `ns=*`는 기본값이라 주소에서 빠지지만, 착지한 요청값은 전체 네임스페이스다 —
  `ns`가 없는 주소가 "기본 네임스페이스"가 아니라 "전체"로 열린다는 사실은 landing.test.tsx가 함께 센다.
*/
it.each([
  [{ ns: "*", state: "review" }],
  [{ state: "unsent" }],
  [{ state: "untranslated" }],
])("옛 /translations redirect(%o)는 네임스페이스로 좁히지 않는다", async (search) => {
  await expect(LegacyTranslations({ params: Promise.resolve({ slug: "acme" }), searchParams: Promise.resolve(search) })).rejects.toThrow(/^redirect:/);
  const target = (nav.redirect.mock.calls.at(-1)![0] as string);
  expect(target.startsWith("/projects/acme/surfaces/web/translations")).toBe(true);
  const landed = narrowing(target);
  expect(landed.ns === null || landed.ns === "*").toBe(true);
  expect(landed.parsedNs).toBe("*");
  expect(landed.state ?? landed.completion).not.toBeNull();
});
