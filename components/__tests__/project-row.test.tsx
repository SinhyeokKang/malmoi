// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

// 머리의 검색이 `useRouter`를 문다 — 이 스위트가 재는 것은 띠이고 라우터는 그 길목일 뿐이다.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ProjectList } from "@/components/projects/project-list";
import type { ProjectListRow } from "@/lib/keys/query";
import { m } from "@/lib/i18n";

/**
 * **띠의 역할 분기를 실제로 렌더해서 본다** (projects-list design §5).
 *
 * ⚠️ **소스 grep으로는 이 축을 못 잰다.** `projects-screen.test.ts`가 `canPerform(row.role, …)`
 * 문자열의 **존재**를 세는데, 그 삼항을 뒤집어도(`canSettle ? ownerOnly : internal`) 토큰은 그대로
 * 남아 전부 green이다 — 2026-09-13 리뷰가 그 공백을 지적했다. 여기서는 **링크가 실제로 있는지**를
 * 묻는다.
 *
 * ⚠️ **서버 컴포넌트지만 async가 아니다** — 데이터는 props로 이미 와 있고 렌더가 순수라 jsdom에서
 * 그대로 돈다 (`filter-interactions.test.tsx`와 같은 계보).
 */

const BASE: ProjectListRow = {
  slug: "acme", reviewSurfaceSlug: "default", unsentSurfaceSlug: "default", repoAheadFrom: "s",
  name: "Acme",
  role: "OWNER",
  installationId: "i",
  surfaces: [{ archivedAt: null, lastCommitSha: "s" }],
  archivedAt: null,
  repoOwner: "o",
  repoName: "r",
  repositoryId: "9001",
  memberCount: 2,
  baseBranch: "release",
  lastPrUrl: "https://github.com/o/r/pull/142",
  meters: [],
  review: 0,
  unsent: 0,
  openPr: null,
  repoAheadFiles: 0,
  importError: null,
  importing: false,
};

const draw = async (over: Partial<ProjectListRow>) => {
  const { container } = await render(<ProjectList all={[{ ...BASE, ...over }]} />);
  return container;
};

const links = (container: HTMLElement) =>
  [...container.querySelectorAll("a")].map((a) => ({ text: a.textContent?.trim() ?? "", href: a.getAttribute("href") }));

it.each([
  ["review", { review: 88 }, m.projects.banner.action.review, "/projects/acme/surfaces/default/translations"],
  ["unsent", { unsent: 24 }, m.projects.banner.action.send, "/projects/acme/surfaces/default/translations"],
])("%s 띠가 번역 화면으로 보낸다", async (_label, over, label, href) => {
  const found = links(await draw(over)).find((a) => a.text === label);
  expect(found?.href).toBe(href);
});

/** ⚠️ **외부로 나가는 둘은 새 탭이다** — 목적지가 GitHub이라 이 앱의 라우트가 아니다. */
it("열린 PR 띠가 그 PR을 가리킨다", async () => {
  const container = await draw({ openPr: { number: 142, url: "https://github.com/o/r/pull/142" } });
  const found = [...container.querySelectorAll("a")].find((a) => a.textContent?.trim() === m.projects.banner.action.viewPr);
  expect(found?.getAttribute("href")).toBe("https://github.com/o/r/pull/142");
  expect(found?.getAttribute("target")).toBe("_blank");
});

/** ⚠️ **`main`을 하드코딩하지 않는다** — 실제 base 브랜치가 문구와 compare 범위에 들어간다. */
it("원격 변경 띠가 실제 base로 compare를 연다", async () => {
  const container = await draw({ repoAheadFiles: 3 });
  const found = [...container.querySelectorAll("a")].find((a) => a.textContent?.trim() === m.projects.banner.action.reviewChanges);
  expect(found?.getAttribute("href")).toBe("https://github.com/o/r/compare/s...release");
  expect(container.textContent).toContain(m.projects.banner.repoAhead(3, "release"));
});

/**
 * **역할로 갈리는 셋** — `project:settings` 뒤라 EDITOR에게 보여 주면 눌러서 거절당하는 경험이 된다.
 * 문장은 역할과 무관하고 **링크만** 사라진다 (design §4 F).
 */
it.each([
  ["needs_reconnect", { repositoryId: null }, m.projects.banner.action.reconnect, m.projects.banner.askOwner.reconnect],
  ["setup", { installationId: null }, m.projects.banner.action.continueSetup, m.projects.banner.askOwner.setup],
])("%s: OWNER는 링크, EDITOR는 안내 문구", async (_label, over, action, guidance) => {
  const owner = await draw({ ...over, role: "OWNER" });
  expect(links(owner).some((a) => a.text === action)).toBe(true);
  expect(owner.textContent).not.toContain(guidance);

  const editor = await draw({ ...over, role: "EDITOR" });
  expect(links(editor).some((a) => a.text === action)).toBe(false);
  expect(editor.textContent).toContain(guidance);
});

/** 임포트 실패는 사유 문장이 역할과 무관하게 서고, `View details` 링크만 OWNER에게 간다. */
it("임포트 실패: EDITOR에게는 링크 대신 담당자 안내", async () => {
  const over = { importError: "parse-failed" as const };
  const owner = await draw({ ...over, role: "OWNER" });
  expect(links(owner).some((a) => a.text === m.projects.banner.action.viewDetails)).toBe(true);
  expect(owner.textContent).toContain(m.projects.banner.checkDetails);

  const editor = await draw({ ...over, role: "EDITOR" });
  expect(links(editor).some((a) => a.text === m.projects.banner.action.viewDetails)).toBe(false);
  expect(editor.textContent).toContain(m.projects.importFailure.contactOwner);
  // 사유 자체는 둘 다 읽는다 — 무엇이 틀렸는지는 역할과 무관한 사실이다.
  expect(editor.textContent).toContain(m.projects.importFailure.parseFailed);
});

/** ⚠️ **보관 행에는 어떤 사건이 겹쳐도 액션이 없다.** */
it("보관 행은 띠를 그리지 않는다", async () => {
  const container = await draw({ archivedAt: new Date("2026-09-01T00:00:00Z"), unsent: 24, review: 9 });
  expect(container.textContent).not.toContain(m.projects.banner.action.send);
  expect(container.textContent).not.toContain(m.projects.banner.unsent(24));
});

/**
 * 띠의 링크는 **하나까지**다 — 카드 안에는 행 링크 하나 + 띠 링크 하나뿐이다.
 * (머리의 [New project]는 카드 밖이라 세지 않는다.)
 */
it("카드 안 링크가 둘을 넘지 않는다", async () => {
  const card = (await draw({ review: 88 })).querySelector("ul");
  expect(card?.querySelectorAll("a")).toHaveLength(2);
});

/** ⚠️ **띠는 행 링크의 형제다** — 안에 넣으면 링크가 중첩되고 그 안의 [Review]를 누를 수 없다. */
it("띠 링크가 행 링크 안에 있지 않다", async () => {
  const card = (await draw({ review: 88 })).querySelector("ul");
  const rowLink = card?.querySelector("a[href='/projects/acme']");
  expect(rowLink?.querySelectorAll("a")).toHaveLength(0);
});
