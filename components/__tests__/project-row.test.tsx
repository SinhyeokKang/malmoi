// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";
import { planned, type RowFixture } from "./helpers/project-row";

// 머리의 검색이 `useRouter`를 문다 — 이 스위트가 재는 것은 띠이고 라우터는 그 길목일 뿐이다.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), archiveProject: vi.fn(), unarchiveProject: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: vi.fn() }));
vi.mock("@/app/(edit)/actions", () => ({ triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));

import { HomeActions, HomeTitle } from "@/components/home/actions";
import { ProjectList } from "@/components/projects/project-list";
import { en } from "@/messages/en";
import { attentionHref } from "@/lib/home/attention-view";
import { STATE, stateLabel, type StateKey } from "@/lib/status/canon";
import { isScreenCanonical, screenQuery } from "@/lib/translations/query";

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

const BASE: RowFixture = {
  image: null,
  slug: "acme", reviewSurfaceSlug: "default", unsentSurfaceSlug: "default", repoAheadFrom: "s",
  name: "Acme",
  role: "OWNER",
  repoHost: "github", gitlabConnectionId: null, gitlabTokenExpiresAt: null, installationId: "i",
  surfaces: [{ archivedAt: null, lastCommitSha: "s", importError: null, importing: false }],
  archivedAt: null,
  repoOwner: "o",
  repoName: "r",
  repositoryId: "9001",
  memberCount: 2,
  baseBranch: "release",
  lastPrUrl: "https://github.com/o/r/pull/142",
  review: 0,
  unsent: 0,
  openPr: null,
  repoAheadFiles: 0,
};

const NOW = new Date("2026-10-18T03:00:00Z");
const draw = async (over: Partial<RowFixture>, extra: Parameters<typeof planned>[1] = []) => {
  const { container } = await render(<ProjectList all={[planned({ ...BASE, ...over }, extra)]} now={NOW} />);
  return container;
};

const links = (container: HTMLElement) =>
  [...container.querySelectorAll("a")].map((a) => ({ text: a.textContent?.trim() ?? "", href: a.getAttribute("href") }));

/*
  띠의 링크는 **그 일이 있는 소스로, 그 Status로 걸러** 간다 (2026-10-02 사용자 — translation-tree-range 결정 기록). 번역 화면의 범위가 트리 위치라
  필터 없이 가면 그 소스 전체 목록에서 일을 다시 찾아야 한다. `ns=*`는 남긴다(POSTMORTEM 2026-09-15). 만든 주소는 화면 정규형이라 redirect가 없다.
*/
it.each([
  ["review", { review: 88 }, en.projects.banner.action.review, "/projects/acme/surfaces/web/translations?ns=*&state=review"],
  ["unsent", { unsent: 24 }, en.projects.banner.action.send, "/projects/acme/surfaces/app/translations?ns=*&state=unsent"],
])("%s 띠가 그 소스의 번역 화면을 그 Status로 걸러 보낸다", async (_label, over, label, href) => {
  const found = links(await draw({ ...over, reviewSurfaceSlug: "web", unsentSurfaceSlug: "app" })).find((a) => a.text === label);
  expect(found?.href).toBe(href);
  const raw = Object.fromEntries(new URL(found!.href!, "http://x").searchParams);
  expect(isScreenCanonical(raw, screenQuery(raw))).toBe(true);
});

/** ⚠️ **외부로 나가는 둘은 새 탭이다** — 목적지가 GitHub이라 이 앱의 라우트가 아니다. */
it("열린 PR 띠가 그 PR을 가리킨다", async () => {
  const container = await draw({ openPr: { number: 142, url: "https://github.com/o/r/pull/142" } });
  const found = [...container.querySelectorAll("a")].find((a) => a.textContent?.trim() === en.projects.banner.action.viewPr);
  expect(found?.getAttribute("href")).toBe("https://github.com/o/r/pull/142");
  expect(found?.getAttribute("target")).toBe("_blank");
});

/** ⚠️ **`main`을 하드코딩하지 않는다** — 실제 base 브랜치가 문구와 compare 범위에 들어간다. */
it("원격 변경 띠가 실제 base로 compare를 연다", async () => {
  const container = await draw({ repoAheadFiles: 3 });
  const found = [...container.querySelectorAll("a")].find((a) => a.textContent?.trim() === en.projects.banner.action.reviewChanges);
  expect(found?.getAttribute("href")).toBe("https://github.com/o/r/compare/s...release");
  expect(container.textContent).toContain(en.projects.banner.repoAhead(3, "release"));
});

/**
 * **역할로 갈리는 셋** — `project:settings` 뒤라 EDITOR에게 보여 주면 눌러서 거절당하는 경험이 된다.
 * 문장은 역할과 무관하고 **링크만** 사라진다 (DESIGN §6.63).
 */
it.each([
  ["needs_reconnect", { repositoryId: null }, en.projects.banner.action.reconnect, en.projects.banner.askOwner.reconnect],
  ["setup", { repoHost: "github", gitlabConnectionId: null, installationId: null }, en.projects.banner.action.continueSetup, en.projects.banner.askOwner.setup],
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
  const over = { surfaces: [{ archivedAt: null, lastCommitSha: "s", importError: "parse-failed" as const, importing: false }] };
  const owner = await draw({ ...over, role: "OWNER" });
  // ⚠️ **상세·재시도가 사는 곳은 Sources다** (audit #6) — Settings에는 가져오기 실패에 관한 정보가 0이다.
  expect(links(owner).find((a) => a.text === en.projects.banner.action.viewDetails)?.href).toBe("/projects/acme/sources");
  expect(owner.textContent).toContain(en.projects.banner.checkDetails);

  const editor = await draw({ ...over, role: "EDITOR" });
  expect(links(editor).find((a) => a.text === en.projects.banner.action.viewDetails)?.href).toBe("/projects/acme/sources");
  expect(editor.textContent).toContain(en.projects.importFailure.ownerRetries);
  expect(owner.textContent).not.toContain(en.projects.importFailure.ownerRetries);
  // 사유 자체는 둘 다 읽는다 — 무엇이 틀렸는지는 역할과 무관한 사실이다.
  expect(editor.textContent).toContain(en.projects.importFailure.parseFailed);
});

/** ⚠️ **보관 행에는 어떤 사건이 겹쳐도 액션이 없다.** */
it("보관 행은 띠를 그리지 않는다", async () => {
  const container = await draw({ archivedAt: new Date("2026-09-01T00:00:00Z"), unsent: 24, review: 9 });
  expect(container.textContent).not.toContain(en.projects.banner.action.send);
  expect(container.textContent).not.toContain(en.projects.banner.unsent(24));
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
  const home = await render(<HomeActions slug="acme" writeLock={null}><HomeTitle archived={false}>{name}</HomeTitle></HomeActions>);
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
  const home = await render(<HomeActions slug="acme" writeLock={null}><HomeTitle archived={false} image={image}>Acme</HomeTitle></HomeActions>);
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
 * `hueFill` 분기에 못 들어가 **빈 테두리 상자**가 남는다.
 */
it.each(["list", "home", "invite"])("%s의 이미지 로드 실패는 이름 색 Box 타일로 떨어진다", async where => {
  const { InviteProjectCard } = await import("@/components/invite/project-card");
  const { hueFill } = await import("@/components/ui/tone");
  const { act } = await import("react");
  const src = "https://store.public.blob.vercel-storage.com/projects/p/gone.webp";
  const container = where === "list" ? await draw({ image: src })
    : where === "home" ? (await render(<HomeActions slug="acme" writeLock={null}><HomeTitle archived={false} image={src}>Acme</HomeTitle></HomeActions>)).container
    : (await render(<InviteProjectCard name="Acme" role="Editor" locales={[]} image={src} />)).container;
  const image = container.querySelector("img")!;
  expect(image).not.toBeNull();
  await act(async () => { image.dispatchEvent(new Event("error")); });
  expect(container.querySelector("img")).toBeNull();
  const tile = container.querySelector("svg.lucide-box")?.parentElement;
  expect(tile?.classList.contains(hueFill("Acme"))).toBe(true);
});

/**
 * **메타 줄의 리포 앞에 GitHub 마크가 선다** (2026-09-25 사용자 — Vercel 목록처럼). 마크는 이 리포의 유일한 GitHub 글리프
 * `GithubIcon`(Sources 머리와 같은 14)이고, 글자와 같은 색을 상속한다(보관 행이면 함께 물러난다).
 */
it("메타 줄이 리포 앞에 GitHub 마크를 든다 — 호스트 이름은 접근 이름에 글자로 든다", async () => {
  const container = await draw({});
  // 보이는 글자 — `sr-only` 호스트 이름을 뺀 값이다(그 이름은 글리프만으로 호스트를 가르지 않으려고 둔다).
  const visible = (el: Element) => [...el.childNodes].filter((n) => !(n instanceof Element && n.classList.contains("sr-only"))).map((n) => n.textContent).join("");
  const meta = [...container.querySelectorAll("span")].find((s) => s.querySelector("svg") !== null && visible(s) === "o/r");
  const mark = meta?.querySelector("svg");
  expect(mark).not.toBeNull();
  expect(mark?.getAttribute("aria-hidden")).toBe("true");
  expect(mark?.getAttribute("class")).toContain("size-3.5");
  // 메타는 리포 하나다(2026-09-30 사용자 — 역할·멤버 수를 걷었다).
  expect(visible(meta!)).toBe("o/r");
  expect(meta!.querySelector(".sr-only")?.textContent).toBe("GitHub: ");
});

/**
 * **PR 조회 실패는 "없음"이 아니라 "모름" 띠다** (ux-drift-unify Q6). 건강이 아니라 할 일이라 칩은 `Active`이고 띠는 muted + `CircleHelp`다
 * (project-row-redesign 결정 1·6). 갈 곳이 없어 링크가 없고, 문장의 둘째 줄이 "다음 방문에 다시 묻는다"를 말한다(결정 5).
 */
it("열린 PR 조회 실패(openPr undefined)는 muted Couldn't check 띠이고 링크가 없다", async () => {
  const container = await draw({ openPr: undefined });
  const band = [...container.querySelectorAll("div")].find((node) => node.textContent === en.projects.banner.prCheckFailed);
  expect(band).toBeDefined();
  expect(band?.className).toContain("text-muted-foreground");
  expect(band?.getAttribute("data-tone")).toBe("muted");
  expect(band?.querySelector("svg.lucide-circle-question-mark")).not.toBeNull();
  expect(band?.querySelector("a")).toBeNull();
  // 짝: PR 없음(null)이면 그 띠가 없다.
  const quiet = await draw({ openPr: null });
  expect(quiet.textContent).not.toContain(en.projects.banner.prCheckFailed);
});

it.each([
  [{unsent:24}, "muted", "text-muted-foreground"],
  [{repositoryId:null}, "warning", "text-warning-soft-foreground"],
  [{surfaces:[{archivedAt:null,lastCommitSha:"s",importError:"parse-failed",importing:false}]}, "danger", "text-destructive"],
] as const)("project band %s preserves tone marker, row indent and action", async (over, tone, color) => {
  const container = await draw({...over, surfaces: "surfaces" in over ? [...over.surfaces] : BASE.surfaces});
  const band = container.querySelector('div[data-tone]')!;
  expect(band).not.toBeNull();
  expect(band.getAttribute("data-tone")).toBe(tone);
  expect(band.classList.contains(color)).toBe(true);
  expect(band.classList.contains("pl-14")).toBe(true);
  expect(band.querySelector("a")?.getAttribute("href")).toBe(tone === "muted" ? "/projects/acme/surfaces/default/translations?ns=*&state=unsent" : tone === "warning" ? "/projects/acme/settings" : "/projects/acme/sources");
});

/**
 * **호스트가 섞인 목록** (gitlab-repositories 시안 G4a) — GitLab 행은 글리프·접근 이름·띠 문장·링크가 GitLab이고, 같은 목록의 GitHub 행은 그대로다.
 * 새 열·배지를 늘리지 않는다(행 높이 불변) — 호스트는 보조줄의 글리프 + 접근 이름이 든다.
 */
const GITLAB: Partial<RowFixture> = {
  slug: "gl", name: "GL", repoHost: "gitlab", installationId: null, gitlabConnectionId: "conn", repoOwner: "group/sub", repoName: "web",
  lastPrUrl: "https://gitlab.com/group/sub/web/-/merge_requests/7",
};

it("GitLab 행 — 접근 이름이 GitLab이고 열린 MR 띠가 `!7`·Open on GitLab이다, GitHub 낱말 0건", async () => {
  const container = await draw({ ...GITLAB, openPr: { number: 7, url: "https://gitlab.com/group/sub/web/-/merge_requests/7" } });
  expect([...container.querySelectorAll(".sr-only")].map((s) => s.textContent)).toContain("GitLab: ");
  expect(container.textContent).toContain(en.projects.onGitLab.banner.prOpen(7));
  const view = links(container).find((a) => a.text === en.projects.onGitLab.banner.action.viewPr);
  expect(view?.href).toBe("https://gitlab.com/group/sub/web/-/merge_requests/7");
  const row = container.querySelector('a[href="/projects/gl"]')?.parentElement ?? container;
  expect(row.textContent).not.toMatch(/github|pull request/i);
});

it("GitLab 행의 저장소 앞섬 띠는 gitlab.com `/-/compare`로 연다", async () => {
  const container = await draw({ ...GITLAB, repoAheadFiles: 2, repoAheadFrom: "abc", baseBranch: "main" });
  expect(links(container).some((a) => a.href === "https://gitlab.com/group/sub/web/-/compare/abc...main")).toBe(true);
});

it("GitLab 토큰의 저장 만료일이 지난 행은 Disconnected 띠다 (D24 — 원격 호출 0)", async () => {
  const container = await draw({ ...GITLAB, gitlabTokenExpiresAt: new Date("2000-01-01T00:00:00Z") });
  expect(container.textContent).toContain(en.settings.repository.disconnected);
});

// ── project-row-redesign T6 — 한 줄 행 · 메타 · 한 판정 ─────────────────────────────

const S = { archivedAt: null, lastCommitSha: "s", importError: null, importing: false } as const;
const BLANK = { kind: "never_filled" as const, at: NOW, surfaceSlug: "web", code: "ja", name: "Japanese", keys: 248, ownerRetries: false };

/** design §2 표의 행 a–n — 칩·띠 조합 전부. `extra`는 서버가 할 일로 싣는 것(빈 언어)이다. */
const STATES: [string, Partial<RowFixture>, Parameters<typeof planned>[1]][] = [
  ["a 정상", {}, []],
  ["b 미발송", { unsent: 24 }, []],
  ["c 열린 PR", { openPr: { number: 142, url: "https://github.com/o/r/pull/142" } }, []],
  ["d 리포 앞섬", { repoAheadFiles: 3 }, []],
  ["e 검토", { review: 8 }, []],
  ["f PR 조회 실패", { openPr: undefined }, []],
  ["n 빈 언어", {}, [BLANK]],
  ["g 끊김", { repositoryId: null }, []],
  ["h 실패", { surfaces: [{ ...S, importError: "parse-failed" }] }, []],
  ["i 일부 반영", { surfaces: [{ ...S, importError: "partial-import" }] }, []],
  ["j 연결 전", { installationId: null }, []],
  ["k 첫 적재 중", { surfaces: [{ ...S, lastCommitSha: null, importing: true }] }, []],
  ["l 첫 적재 대기", { surfaces: [{ ...S, lastCommitSha: null }] }, []],
  ["m 보관", { archivedAt: new Date("2026-09-01T00:00:00Z"), unsent: 24 }, []],
];

const rowLink = (container: HTMLElement) => container.querySelector<HTMLAnchorElement>('ul a[href="/projects/acme"]')!;
const band = (container: HTMLElement) => container.querySelector<HTMLElement>("ul div[data-tone]");
const meta = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-row-meta]")!;

describe("상태 표 전 행", () => {
  it.each(STATES)("%s — 칩 낱말이 띠 문장에 들어가지 않고 메타 줄에 상태 낱말이 없다", async (_label, over, extra) => {
    const row = planned({ ...BASE, ...over }, extra);
    const container = await draw(over, extra);
    const chip = stateLabel(en, row.plan.chip);
    expect(rowLink(container).textContent).toContain(chip);
    expect(band(container)?.textContent ?? "").not.toContain(chip);
    const text = meta(container).textContent ?? "";
    for (const key of Object.keys(STATE) as StateKey[]) expect(text, key).not.toContain(stateLabel(en, key));
  });

  it.each(STATES)("%s — 언어 막대가 없고 행은 한 줄(`flex-col`이 아니다)이다", async (_label, over, extra) => {
    const container = await draw(over, extra);
    expect(container.querySelector("[data-locale-meter]")).toBeNull();
    expect(container.querySelector('[role="meter"], [role="progressbar"]')).toBeNull();
    expect(rowLink(container).classList.contains("flex-col")).toBe(false);
    expect(rowLink(container).classList).toContain("items-center");
  });

  /** ⚠️ All set 카드의 할 일 띠는 전부 muted다(결정 6) — warning·danger는 Needs attention 사유(g·h·i)만 든다. */
  it.each(STATES.filter(([label]) => /^[bcdefn] /.test(label)))("%s — All set 띠는 muted다", async (_label, over, extra) => {
    const row = planned({ ...BASE, ...over }, extra);
    expect([row.plan.chip, row.plan.group]).toEqual(["active", "all_set"]);
    expect(band(await draw(over, extra))?.getAttribute("data-tone")).toBe("muted");
  });

  it("보관 행은 띠가 없다", async () => {
    expect(band(await draw({ archivedAt: new Date("2026-09-01T00:00:00Z"), unsent: 24 }))).toBeNull();
  });
});

describe("행 링크 계약", () => {
  it("행이 `<a>`이고 링이 안쪽(`ring-inset`)이며 띠는 링크 밖 형제다", async () => {
    const container = await draw({ unsent: 3 });
    const link = rowLink(container);
    expect(link.tagName).toBe("A");
    expect(link.classList).toContain("focus-visible:ring-inset");
    expect(link.contains(band(container))).toBe(false);
    expect(link.parentElement).toBe(band(container)?.parentElement);
  });
});

describe("대표 메타", () => {
  const cells = (container: HTMLElement) => [...meta(container).children].map((cell) => cell.textContent);

  it("순서가 sources · keys · languages · synced이고 가운뎃점은 앞 칸 끝에 붙는다", async () => {
    const at = new Date("2026-10-18T00:00:00Z");
    const container = await draw({ sourceCount: 2, keyCount: 1204, languageCount: 3, lastSync: at.toISOString() });
    expect(cells(container)).toEqual([
      `${en.sources.count(2)} ·`, `${en.translations.keys(1204)} ·`, `${en.sources.languageCount(3)} ·`, en.home.cards.synced("3 hours ago"),
    ]);
    for (const cell of meta(container).children) expect(cell.classList).toContain("whitespace-nowrap");
    expect(meta(container).classList).toContain("flex-wrap");
    // 리포 줄 아래 한 줄이다 — 이름 칸의 셋째 줄.
    expect(meta(container).previousElementSibling?.textContent).toContain("o/r");
  });

  it.each([
    ["언어 0", { languageCount: 0, lastSync: "2026-10-18T00:00:00.000Z" }, 3],
    ["시각 null", { languageCount: 2, lastSync: null }, 3],
    ["시각 unrecorded", { languageCount: 2, lastSync: "unrecorded" as const }, 3],
    ["첫 적재 전 — 소스·키 둘만", { sourceCount: 1, keyCount: 0, languageCount: 0, lastSync: null }, 2],
    ["연결 전 — 0 sources · 0 keys", { installationId: null, sourceCount: 0, keyCount: 0, languageCount: 0, lastSync: null }, 2],
  ] as [string, Partial<RowFixture>, number][])("%s이면 그 칸을 뺀다", async (_label, over, n) => {
    const container = await draw(over);
    expect(cells(container)).toHaveLength(n);
    expect(cells(container)[0]).toContain(en.sources.count(over.sourceCount ?? 1));
    expect(meta(container).textContent).not.toContain(en.sources.languageCount(0));
    expect(meta(container).textContent).not.toContain(en.home.cards.synced(null));
    expect(meta(container).querySelector("time") === null).toBe(over.lastSync === null || over.lastSync === "unrecorded");
  });

  it("동기화 시각은 `<time>`이고 dateTime이 UTC ISO, 접근 이름이 오프셋 라벨을 단 절대 시각이다", async () => {
    const container = await draw({ lastSync: "2026-10-18T00:00:00.000Z" });
    const time = meta(container).querySelector("time")!;
    expect(time.getAttribute("dateTime")).toBe("2026-10-18T00:00:00.000Z");
    expect(time.getAttribute("aria-label")).toMatch(/^synced .* 00:00 UTC$/);
    expect(time.getAttribute("title")).toBeNull();
  });

  it("보관 행은 이름·리포·메타가 gray-dim이다", async () => {
    const container = await draw({ archivedAt: new Date("2026-09-01T00:00:00Z"), lastSync: "2026-08-01T00:00:00.000Z" });
    expect(meta(container).classList).toContain("text-gray-dim");
    expect(meta(container).previousElementSibling?.classList).toContain("text-gray-dim");
    // 보관 행에서도 시각은 남는다 — "얼마나 오래 멈춰 있었나"라 정보다.
    expect(meta(container).querySelector("time")).not.toBeNull();
  });
});

describe("빈 언어 띠", () => {
  it("Home Attention과 같은 문장·목적지이고 링크 라벨이 상세 모달의 같은 버튼 이름이다", async () => {
    const container = await draw({}, [BLANK]);
    const line = band(container)!;
    expect(line.textContent).toContain(en.projects.banner.neverFilled("Japanese", "web", 248));
    // Home 본문 + 꼬리에서 `here`만 `in {source}`로 바꾼 형이다(design §6).
    expect(en.projects.banner.neverFilled("Japanese", "web", 248))
      .toBe(`${en.home.attention.neverFilled.body("Japanese").replace(/ here$/, " in web")}${en.home.attention.neverFilled.tail(248)}`);
    expect(line.querySelector("svg.lucide-languages")).not.toBeNull();
    const link = line.querySelector("a")!;
    expect(link.textContent).toBe(en.sources.open);
    expect(link.getAttribute("href")).toBe(attentionHref("acme", BLANK, "settings"));
  });

  it("빈 언어가 여럿이면 첫 하나만 선다", async () => {
    const container = await draw({}, [BLANK, { ...BLANK, code: "de", name: "German" }]);
    expect(container.querySelectorAll("ul div[data-tone]")).toHaveLength(1);
    expect(band(container)?.textContent).toContain("Japanese");
  });
});

describe("GitLab 행 전체가 GitLab 문장이다", () => {
  it.each([
    ["연결 전", { gitlabConnectionId: null, repositoryId: null }],
    ["PR 조회 실패", { openPr: undefined }],
  ] as [string, Partial<RowFixture>][])("%s 행에 GitHub·pull request 낱말이 0건이다", async (label, over) => {
    // 픽스처가 정말 그 상태에 닿는다 — 칩이 바뀌면 이 단언은 공허하게 통과한다.
    expect(planned({ ...BASE, ...GITLAB, ...over }).plan.chip).toBe(label === "연결 전" ? "setup" : "active");
    const container = await draw({ ...GITLAB, ...over });
    const card = container.querySelector("ul")!;
    expect(card.textContent).not.toMatch(/github|pull request/i);
    expect(card.textContent?.length).toBeGreaterThan(0);
  });

  it("GitLab PR 조회 실패 띠는 merge request 문장이다", async () => {
    const container = await draw({ ...GITLAB, openPr: undefined });
    expect(band(container)?.textContent).toBe(en.projects.onGitLab.banner.prCheckFailed);
  });
});
