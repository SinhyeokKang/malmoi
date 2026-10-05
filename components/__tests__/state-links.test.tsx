// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **`state=`·완성도로 좁히는 앱 내부 링크는 네임스페이스로 좁히지 않는다** (POSTMORTEM 2026-09-15 — 두 좁힘이 교집합을 비워 0건 착지).
 *
 * 그 항목의 재발 방지는 grep이었는데 `cardQuery()` 도입 뒤 0건이라 공허하게 참이었다 — 규칙대로 **테스트가 센다**(POSTMORTEM 2026-09-15
 * 두 번째 항목). 생산자 넷 전수: Home 카운트 카드(`cardQuery`) · Home 주의 카드(`attention-card.tsx`) · 옛 `/translations` redirect ·
 * 프로젝트 목록 띠(`bannerTranslationsHref` — 2026-10-02에 Status를 싣게 되며 넷째가 됐다). 새 `state=` 생산자를 더하면 여기 센다.
 * 범위는 트리 위치라 주소에 `scope`가 없다 — 카드는 그 수가 있는 첫 소스의 `All namespaces`로 간다(translation-tree-range §5).
 */
const nav = vi.hoisted(() => ({ redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }) }));
vi.mock("next/navigation", () => ({ redirect: nav.redirect, notFound: () => { throw new Error("notFound"); }, useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
// 프로젝트 목록을 그리면 행의 Action들이 import된다 — 이 스위트가 재는 것은 띠의 링크다.
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), archiveProject: vi.fn(), unarchiveProject: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: vi.fn() }));
vi.mock("@/app/(edit)/actions", () => ({ triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireProjectAccess: async () => ({ projectId: "p" }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ project: { findUnique: async () => ({ defaultSurface: { slug: "web", archivedAt: null } }) } }) }));

import LegacyTranslations from "@/app/(edit)/projects/[slug]/translations/page";
import { AttentionCard } from "@/components/home/attention-card";
import { CountCards } from "@/components/home/count-cards";
import { bannerTranslationsHref, ProjectList } from "@/components/projects/project-list";
import type { ProjectListRow } from "@/lib/keys/query";
import { en } from "@/messages/en";
import type { HomeCard } from "@/lib/home/cards";
import { parseTranslationQuery } from "@/lib/translations/query";

const now = new Date("2026-09-30T00:00:00Z");
const narrowing = (href: string) => {
  const params = new URL(href, "http://x").searchParams;
  return { ns: params.get("ns"), scope: params.get("scope"), state: params.get("state"), completion: params.get("completion"), parsedNs: parseTranslationQuery(Object.fromEntries(params)).ns };
};

it("Home 카운트 카드 넷은 ns=*를 싣고 카드마다 착지 소스가 다르다", async () => {
  const card = (key: HomeCard["key"]): HomeCard => ({ key, value: 1, unit: "cells", muted: false, tone: null, subline: { kind: "nothingPending" } });
  const surfaceSlugs = { newFromGithub: "web", toTranslate: "app", toReview: "web", toSend: "docs" };
  const { container } = await render(<CountCards cards={(["newFromGithub", "toTranslate", "toReview", "toSend"] as const).map(card)} slug="acme" surfaceSlugs={surfaceSlugs} now={now} uiLocale="en" m={en} />);
  const hrefs = [...container.querySelectorAll("a")].map(a => a.getAttribute("href")!);
  expect(hrefs).toHaveLength(4);
  for (const href of hrefs) expect(narrowing(href)).toMatchObject({ ns: "*", scope: null, parsedNs: "*" });
  expect(hrefs.map(href => new URL(href, "http://x").pathname.split("/")[4])).toEqual(["web", "app", "web", "docs"]);
});

it("Home 주의 카드의 검토 대기·빈 로케일 링크는 ns=*를 싣는다", async () => {
  const items = [
    { kind: "review" as const, at: now, surfaceSlug: "web", code: "ko", name: "Korean", count: 2, who: null },
    { kind: "never_filled" as const, at: now, surfaceSlug: "app", code: "ja", name: "Japanese", keys: 3 },
  ];
  const { container } = await render(<AttentionCard items={{ shown: items, more: [], count: 2 }} slug="acme" role="OWNER" state="default" now={now} uiLocale="en" m={en} />);
  const hrefs = [...container.querySelectorAll("a")].map(a => a.getAttribute("href")!).filter(href => href.includes("/translations"));
  expect(hrefs).toHaveLength(2);
  expect(narrowing(hrefs[0]!)).toMatchObject({ ns: "*", state: "review", parsedNs: "*" });
  // 빈 로케일 → `Incomplete` + 상세 언어 그 로케일 · 그 소스 경로(조건 12).
  expect(narrowing(hrefs[1]!)).toMatchObject({ ns: "*", completion: "incomplete", parsedNs: "*" });
  expect(new URL(hrefs[1]!, "http://x").searchParams.get("language")).toBe("ja");
  expect(new URL(hrefs[1]!, "http://x").pathname).toBe("/projects/acme/surfaces/app/translations");
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

it("프로젝트 목록 띠의 검토 대기·보낼 편집 링크는 ns=*를 싣는다 — 그린 띠의 앵커가 그 생성기를 쓴다", async () => {
  for (const state of ["review", "unsent"] as const) {
    expect(narrowing(bannerTranslationsHref("acme", "web", state))).toMatchObject({ ns: "*", scope: null, state, parsedNs: "*" });
  }
  // 실제 목록을 그려 띠의 앵커를 센다 — 띠가 손으로 주소를 조립하면 여기서 갈린다.
  const row = (over: Partial<ProjectListRow>): ProjectListRow => ({
    image: null, slug: "acme", reviewSurfaceSlug: "web", unsentSurfaceSlug: "app", repoAheadFrom: null, name: "Acme", role: "OWNER", installationId: "i",
    surfaces: [{ archivedAt: null, lastCommitSha: "s", importError: null, importing: false }], archivedAt: null, repoOwner: "o", repoName: "r", repositoryId: "9001",
    memberCount: 2, baseBranch: "main", lastPrUrl: null, meters: [], review: 0, unsent: 0, openPr: null, repoAheadFiles: 0, ...over,
  });
  for (const [over, label, href] of [
    [{ review: 3 }, en.projects.banner.action.review, bannerTranslationsHref("acme", "web", "review")],
    [{ unsent: 2 }, en.projects.banner.action.send, bannerTranslationsHref("acme", "app", "unsent")],
  ] as const) {
    const { container } = await render(<ProjectList all={[row(over)]} />);
    const anchor = [...container.querySelectorAll("a")].find(a => a.textContent?.trim() === label);
    expect(anchor?.getAttribute("href"), label).toBe(href);
    expect(narrowing(anchor!.getAttribute("href")!)).toMatchObject({ ns: "*", parsedNs: "*" });
  }
});
