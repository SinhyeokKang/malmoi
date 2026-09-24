// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

// 머리의 검색이 `useRouter`를 문다 — 이 스위트가 재는 것은 띠이고 라우터는 그 길목일 뿐이다.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), archiveProject: vi.fn(), unarchiveProject: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: vi.fn() }));
vi.mock("@/app/(edit)/actions", () => ({ triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));

import { HomeActions, HomeTitle } from "@/components/home/actions";
import { ProjectList } from "@/components/projects/project-list";
import type { ProjectListRow } from "@/lib/keys/query";
import { m } from "@/lib/i18n";

/**
 * **띠의 역할 분기를 실제로 렌더해서 본다** (DESIGN §6.63).
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
  image: null,
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
 * 문장은 역할과 무관하고 **링크만** 사라진다 (DESIGN §6.63).
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

/**
 * 임포트 실패는 사유 문장과 `View details`(Sources)가 역할과 무관하게 선다 (audit #6 r1 — 사용자 결정: Sources는
 * `translation:write`라 EDITOR도 열어 사유를 읽는다). 재시도만 OWNER 전용이라 EDITOR에게 그 한 줄이 붙는다.
 */
it("임포트 실패: EDITOR도 Sources 링크를 받고 재시도는 소유자 몫이라는 한 줄이 붙는다", async () => {
  const over = { importError: "parse-failed" as const };
  const owner = await draw({ ...over, role: "OWNER" });
  // ⚠️ **상세·재시도가 사는 곳은 Sources다** (audit #6) — Settings에는 가져오기 실패에 관한 정보가 0이다.
  expect(links(owner).find((a) => a.text === m.projects.banner.action.viewDetails)?.href).toBe("/projects/acme/sources");
  expect(owner.textContent).toContain(m.projects.banner.checkDetails);

  const editor = await draw({ ...over, role: "EDITOR" });
  expect(links(editor).find((a) => a.text === m.projects.banner.action.viewDetails)?.href).toBe("/projects/acme/sources");
  expect(editor.textContent).toContain(m.projects.importFailure.ownerRetries);
  expect(owner.textContent).not.toContain(m.projects.importFailure.ownerRetries);
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

it.each(["Acme", "말모이", "Example"])("%s 프로젝트의 목록과 상세 썸네일 배경·모서리가 같다", async (name) => {
  const list = await draw({ name });
  const home = await render(<HomeActions slug="acme"><HomeTitle archived={false}>{name}</HomeTitle></HomeActions>);
  const listTile = list.querySelector("svg.lucide-box")?.parentElement;
  const homeTile = home.container.querySelector("svg.lucide-box")?.parentElement;
  expect(listTile).not.toBeNull();
  expect(homeTile).not.toBeNull();
  const visualClasses = (tile: HTMLElement | null | undefined) => [...(tile?.classList ?? [])].filter((c) => c.startsWith("bg-") || c.startsWith("rounded")).sort();
  expect(visualClasses(homeTile)).toEqual(visualClasses(listTile));
});

it.each(["/saved.webp", "/replacement.webp", null])("목록·Home·초대에 최신 프로젝트 이미지 %s를 전달한다", async image => {
  const { InviteProjectCard } = await import("@/components/invite/project-card");
  const list = await draw({ image });
  const home = await render(<HomeActions slug="acme"><HomeTitle archived={false} image={image}>Acme</HomeTitle></HomeActions>);
  const invite = await render(<InviteProjectCard name="Acme" role="Editor" locales={[]} image={image} />);
  for (const node of [list, home.container, invite.container]) {
    expect(node.querySelector("img")?.getAttribute("src") ?? null).toBe(image);
    expect(node.querySelector("svg.lucide-box") !== null).toBe(image === null);
  }
});

/**
 * **죽은 이미지 URL은 색 타일로 떨어진다** (malmoi#50 — `Avatar`가 이미 그렇게 한다).
 *
 * ⚠️ `Project.image`가 가리키는 Blob이 사라지는 길이 여럿이다 — 스토어 교체·환경 간 행 이동·업로드 tx가
 * 커밋됐는데 드라이버가 오류로 보고해 정리가 방금 쓴 객체를 지운 경우. 폴백이 없으면 `image`가 truthy라
 * `toneFill` 분기에 못 들어가 **빈 테두리 상자**가 남는다.
 */
it.each(["list", "home", "invite"])("%s의 이미지 로드 실패는 이름 색 Box 타일로 떨어진다", async where => {
  const { InviteProjectCard } = await import("@/components/invite/project-card");
  const { toneFill } = await import("@/components/ui/tone");
  const { act } = await import("react");
  const src = "https://store.public.blob.vercel-storage.com/projects/p/gone.webp";
  const container = where === "list" ? await draw({ image: src })
    : where === "home" ? (await render(<HomeActions slug="acme"><HomeTitle archived={false} image={src}>Acme</HomeTitle></HomeActions>)).container
    : (await render(<InviteProjectCard name="Acme" role="Editor" locales={[]} image={src} />)).container;
  const image = container.querySelector("img")!;
  expect(image).not.toBeNull();
  await act(async () => { image.dispatchEvent(new Event("error")); });
  expect(container.querySelector("img")).toBeNull();
  const tile = container.querySelector("svg.lucide-box")?.parentElement;
  expect(tile?.classList.contains(toneFill("Acme"))).toBe(true);
});
