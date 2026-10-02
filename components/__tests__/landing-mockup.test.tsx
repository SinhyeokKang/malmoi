// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockupScenes } from "@/components/landing/mockup";
import { Stage } from "@/components/landing/stage";
import { buttonClass } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { navFooterItems, navZones } from "@/lib/shell/nav";

import { CloseButton } from "@/components/ui/close-button";
import { ListRow } from "@/components/ui/list-row";
import { StatusBadge } from "@/components/ui/status-badge";

import { find, render } from "./helpers/dom";

/**
 * **랜딩 목업의 씬 DOM** (DESIGN §6.615). 목업은 서버가 그린 정적 복제라 조작 대상이 아니다 — 프레임은
 * `aria-hidden` + `inert`이고, **jsdom은 `inert`를 구현하지 않으므로** 인터랙티브 태그 자체가 0이어야 한다.
 *
 * ⚠️ 앱 라벨은 실제 사전 키를 읽는다 — 목업과 앱이 다른 말을 하기 시작하면 랜딩이 거짓이다(DESIGN §6.615 "목업 문구").
 */
// ⚠️ jsdom 환경에서는 `import.meta.url`이 file 스킴이 아니다 — `public-shell.test.tsx`와 같이 cwd에서 잡는다.
const DIR = join(process.cwd(), "components/landing/mockup");
const fixture = m.landing.mockup;
const p = m.translations.publish;

// jsdom에 `matchMedia`가 없다 — 스테이지가 effect에서 읽는다. 재생 배선은 `landing-stage.test.tsx`가 본다.
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { vi.unstubAllGlobals(); });

async function mount() {
  const { container } = await render(
    <div data-public-scroller="">
      <Stage label={m.landing.stage.label} captions={m.landing.stage.captions} typed={fixture.selected.typed} scenes={mockupScenes()} closing={null} />
    </div>,
  );
  return container;
}

const layer = (container: HTMLElement, k: number) => find<HTMLElement>(container, `[data-landing-layer="${k}"]`);

describe("목업 창", () => {
  it("16:10 컨테이너 안에서 44px 툴바와 씬 영역이 분리된다", async () => {
    const container = await mount();
    const frame = find<HTMLElement>(container, "[data-landing-frame]");
    expect(frame.style.width).toBe("1440px");
    expect(frame.style.height).toBe("900px");
    const toolbar = find<HTMLElement>(frame, "[data-landing-toolbar]");
    expect(toolbar.style.height).toBe("44px");
    expect(toolbar.children).toHaveLength(3);
    const screen = find<HTMLElement>(frame, "[data-landing-screen]");
    expect(screen.style.top).toBe("44px");
    expect(screen.querySelectorAll("[data-landing-layer]")).toHaveLength(5);
    expect(screen.contains(toolbar)).toBe(false);
  });
});

describe("목업 — 조작 대상이 아니다", () => {
  it("프레임이 `aria-hidden`+`inert`이고 안에 인터랙티브 태그가 0개다", async () => {
    const container = await mount();
    const frame = find(container, "[data-landing-frame]");
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    expect(frame.hasAttribute("inert")).toBe(true);
    expect(frame.querySelectorAll("button, a, input, textarea, select, [tabindex], [contenteditable]")).toHaveLength(0);
    // 씬 다섯이 전부 무언가를 그렸다 — 빈 레이어로 통과하지 않는다.
    for (let k = 0; k < 5; k += 1) expect(layer(container, k).textContent?.length ?? 0).toBeGreaterThan(20);
  });
});

/**
 * **목업은 제품과 1:1이다** (2026-09-27 사용자 — "LNB에 계정 페이지가 없고, 번역 화면에 소스 패널이 없다"). 구조를 실제 판정·실제
 * 컴포넌트의 구획에서 뽑아 견준다 — 손으로 목록을 두 벌 두면 사이드바가 바뀔 때 목업만 낡는다.
 */
describe("목업 — 제품과 같은 구조다", () => {
  const zones = navZones(
    { slug: "acme-web", name: fixture.project, role: "OWNER", archived: false, counts: { sources: fixture.sources.length, members: fixture.memberCount, keys: fixture.keyCount } },
    { userName: fixture.user, projectCount: fixture.projectCount },
  );

  it("LNB가 사이드바와 같은 구역·항목·배지다 — 사용자 구역(Projects · MCP connector · Account, 머리 없음) · 프로젝트 구역 · 하단 목록", async () => {
    const scene = layer(await mount(), 0);
    const zoneText = (key: string) => find(scene, `[data-landing-zone="${key}"]`);
    const items = (key: string) => [...zoneText(key).querySelectorAll("[data-landing-nav]")].map((node) => node.textContent);
    expect(zones.map((zone) => zone.key)).toEqual(["work", "project"]);
    for (const zone of zones) {
      expect(items(zone.key)).toEqual(zone.items.map((item) => `${item.label}${item.badge ?? ""}`));
    }
    // 머리 줄은 프로젝트 구역에만 있다 — 사용자 구역의 아바타·이름 줄은 2026-09-30에 빠졌다(사이드바와 같다).
    expect(zoneText("project").querySelector("p > span.truncate")?.textContent).toBe(fixture.project);
    expect(zoneText("work").querySelector("p")).toBeNull();
    expect(items("work")).toEqual([`${m.common.nav.projects}${fixture.projectCount}`, m.common.nav.mcp, m.common.nav.account]);
    expect(items("footer")).toEqual(navFooterItems().map((item) => item.label));
    // Sign out은 하단이 아니라 아바타 메뉴의 것이다(MISC 배치) — 목업 LNB에 따로 서지 않는다.
    expect(scene.querySelector("[data-landing-lnb]")?.textContent).not.toContain(m.common.nav.signOut);
    // 선택은 Translations 하나다.
    expect([...scene.querySelectorAll("[data-landing-nav]")].filter((node) => node.className.includes("bg-foreground/[0.07]")).map((node) => node.getAttribute("data-landing-nav"))).toEqual(["translations"]);
  });

  /** 사이드바 프로젝트 머리의 전환 트리거(`project-switcher.tsx` — ghost `size-6` · `ChevronsUpDown` 16)를 그림으로 둔다. */
  it("프로젝트 구역 머리 오른쪽 끝에 전환 트리거 글리프가 하나 선다 — 사용자 구역엔 없다", async () => {
    const scene = layer(await mount(), 0);
    const head = find(scene, '[data-landing-zone="project"] > p');
    const switcher = find<HTMLElement>(head, "[data-landing-switcher]");
    expect(head.lastElementChild).toBe(switcher);
    expect(switcher.tagName.toLowerCase()).toBe("span");
    for (const cls of ["ml-auto", "size-6", "rounded-sm", "p-0"]) expect(switcher.className.split(" ")).toContain(cls);
    const glyph = switcher.querySelector("svg");
    expect(glyph?.getAttribute("class")).toContain("lucide-chevrons-up-down");
    expect(glyph?.getAttribute("class")).toContain("size-4");
    expect(scene.querySelectorAll("[data-landing-switcher]")).toHaveLength(1);
    expect(find(scene, '[data-landing-zone="work"]').querySelector("[data-landing-switcher]")).toBeNull();
  });

  /** 앱 셸 헤더와 같다(2026-09-30) — 우측 `New project · 구분선 · 아바타`. */
  it("헤더 우측이 New project · 구분선 · 아바타다", async () => {
    const scene = layer(await mount(), 0);
    const right = find(scene, "[data-landing-header-right]");
    const kids = [...right.children];
    expect(kids).toHaveLength(3);
    expect(kids[0]?.textContent).toBe(m.common.nav.newProject);
    expect(kids[0]?.querySelector("svg")?.getAttribute("class")).toContain("lucide-plus");
    expect(kids[1]?.className).toContain("bg-border-subtle");
  });

  it("모든 씬의 사이드바 맨 아래에 Collapse가 있다", async () => {
    const container = await mount();
    for (let k = 0; k < 5; k += 1) {
      const footer = find(layer(container, k), '[data-landing-zone="footer"]');
      const collapse = find<HTMLElement>(footer, "[data-landing-collapse]");
      expect(footer.lastElementChild).toBe(collapse);
      expect(collapse.textContent).toBe(m.common.nav.collapseSidebar);
      expect(collapse.tagName).toBe("SPAN");
      expect(collapse.querySelector("svg.lucide-panel-left-close")).not.toBeNull();
      expect(collapse.className.split(" ")).toEqual(expect.arrayContaining(["h-8", "px-2", "font-normal", "justify-start"]));
    }
  });

  it("LNB 폭이 실제 셸의 기본 240이다", async () => {
    expect(find(layer(await mount(), 0), "[data-landing-lnb]").className).toContain("w-[240px]");
  });

  it("번역 화면에 소스 트리가 있다 — 보고 있는 소스가 펼쳐지고 `All namespaces`가 선택, 나머지는 접힌다", async () => {
    const scene = layer(await mount(), 0);
    const tree = find<HTMLElement>(scene, "[data-landing-tree]");
    expect(tree.className).toContain("w-[260px]");
    expect(tree.textContent).toContain(m.translations.workspace.tree.title);
    const current = fixture.sources.find(source => source.slug === fixture.source);
    const rest = fixture.sources.filter(source => source.slug !== fixture.source);
    expect([...tree.querySelectorAll("[data-landing-source]")].map(node => node.getAttribute("data-landing-source"))).toEqual(fixture.sources.map(source => source.slug).sort());
    const open = find(tree, `[data-landing-source="${current?.slug}"]`);
    expect(open.textContent).toContain(m.translations.workspace.tree.allNamespaces);
    for (const namespace of current?.namespaces ?? []) expect(open.textContent).toContain(namespace.name);
    // 네임스페이스 합이 소스의 키 수이고, 소스 합이 프로젝트 키 수다.
    expect((current?.namespaces ?? []).reduce((sum, n) => sum + n.keyCount, 0)).toBe(current?.keyCount);
    expect(fixture.sources.reduce((sum, source) => sum + source.keyCount, 0)).toBe(fixture.keyCount);
    for (const source of rest) expect(find(tree, `[data-landing-source="${source.slug}"]`).children).toHaveLength(1);
    // 선택된 네임스페이스 칸은 보고 있는 소스 안의 `All namespaces` 하나다. 면은 실물 `ListRow selected`의 0.07이다(5-Y7).
    expect([...tree.querySelectorAll(".bg-foreground\\/\\[0\\.07\\]")].map((node) => node.textContent)).toEqual([`${m.translations.workspace.tree.allNamespaces}${current?.keyCount}`]);
  });

  it("머리는 검색 하나이고, Status 필터는 키 목록 머리에 있다 — 범위 콤보가 없다", async () => {
    const scene = layer(await mount(), 0);
    const f = m.translations.workspace.filters;
    expect(scene.textContent).not.toContain("This source");
    expect(find(scene, "[data-landing-search]").textContent).toBe(f.searchPlaceholder);
    const listHead = [...scene.querySelectorAll<HTMLElement>("span")].find(el => el.textContent === m.translations.workspace.list.keys)?.parentElement;
    expect(listHead?.textContent).toContain(f.state.any);
    expect(listHead?.textContent).not.toContain("Incomplete first");
  });

  /** 실제 목록은 미완을 먼저 둔다(`rank`). 목업이 완료 행을 앞에 두면 실물과 다른 순서를 보인다(머리의 정렬 문구는 2026-10-02에 걷었다). */
  it("키 목록이 미완 먼저다", () => {
    const ranks = fixture.rows.map((row) => (row.missing > 0 ? 0 : 1));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("④ 확정 버튼은 `Open pull request` 하나이고 Cancel이 없다 · 열린 PR 없음 안내 · 저자 열", async () => {
    const scene = layer(await mount(), 3);
    const text = scene.textContent ?? "";
    expect(text).toContain(p.openPr);
    expect(text).not.toContain(m.common.cancel);
    expect(text).toContain(p.prNone.title(fixture.repo));
    expect([...scene.querySelectorAll("[data-landing-author]")].map((node) => node.textContent)).toEqual(
      fixture.diff.map((row) => (row.key === fixture.selected.key ? fixture.user : fixture.teammate)),
    );
  });

  it("⑤ 확정 버튼은 `View pull request`다", async () => {
    expect(layer(await mount(), 4).textContent).toContain(p.viewLink);
  });

  it("③ 저장 뒤 푸터에 `Revert to last sent`가 선다 — 이 키에 미전달 편집이 생긴다", async () => {
    const container = await mount();
    expect(layer(container, 1).textContent).not.toContain(m.translations.workspace.revert.button);
    expect(layer(container, 3).textContent).toContain(m.translations.workspace.revert.button);
  });

  /** 실물의 Revert는 편집을 버리는 동작이라 `danger`다(§2.4 동작 규칙) — 목업만 `default`면 랜딩이 실물과 갈린다. */
  it("③ `Revert to last sent`가 실물과 같은 danger다", async () => {
    const container = await mount();
    const revert = [...layer(container, 3).querySelectorAll("span")].find((node) => node.textContent === m.translations.workspace.revert.button);
    expect(revert?.className).toBe(buttonClass({ variant: "danger" }));
  });
});

describe("목업 — 씬이 이야기를 든다", () => {
  it("⑤ 전달 뒤 배경에는 미전달 표시가 없고 Publish가 꺼지며 결과를 다시 열 수 있다", async () => {
    const scene = layer(await mount(), 4);
    const publish = find<HTMLElement>(scene, "[data-landing-publish]");
    expect(publish.getAttribute("aria-disabled")).toBe("true");
    expect(publish.textContent).toBe(p.button);
    expect(scene.textContent).toContain(p.viewResult);
    expect(scene.textContent).not.toContain(m.translations.workspace.list.notSent);
    expect(scene.textContent).not.toContain(m.translations.workspace.footer.savedNotSent);
    expect(scene.textContent).not.toContain(m.translations.workspace.revert.button);
    expect(scene.querySelector("[data-landing-hold]")).toBeNull();
  });

  it("①②는 미전달 없이 시작하고 ③ 저장 뒤에만 보류 안내가 생긴다", async () => {
    const container = await mount();
    expect(fixture.unsentBefore).toBe(0);
    expect(fixture.unsentAfter).toBe(1);
    for (const k of [0, 1]) {
      const scene = layer(container, k);
      expect(scene.querySelector("[data-landing-hold]")).toBeNull();
      expect(scene.textContent).not.toContain(m.translations.workspace.list.notSent);
      const publish = find(scene, "[data-landing-publish]");
      expect(publish.getAttribute("aria-disabled")).toBe("true");
      expect(publish.textContent).toBe(p.button);
    }
    const saving = find(layer(container, 2), "[data-landing-hold]");
    expect(saving.closest('[data-landing-badge="after"]')).not.toBeNull();
    const saved = find(layer(container, 3), "[data-landing-hold]");
    expect(saved.textContent).toContain(m.translations.banner.paused(1));
    expect(fixture.diff).toEqual([{ key: fixture.selected.key, code: fixture.selected.typedCode, before: null, after: fixture.selected.typed }]);
  });

  it("② 타이핑 입력에 실제 Textarea의 활성 링이 있다", async () => {
    const field = find(layer(await mount(), 1), "[data-landing-typed]").parentElement!;
    expect(field.className.split(" ")).toEqual(expect.arrayContaining(["ring-ring", "ring-2"]));
  });

  it("공통 사이드바의 머리와 행은 실제 ROW의 h-8 px-2를 따른다", async () => {
    const scene = layer(await mount(), 0);
    const rows = [...scene.querySelectorAll('[data-landing-nav]'), find(scene, '[data-landing-zone="project"] > p')];
    for (const row of rows) expect(row.className.split(" ")).toEqual(expect.arrayContaining(["h-8", "px-2"]));
  });

  it("④ diff 국기에 실제 표와 같은 얇은 윤곽선이 있다", async () => {
    const flags = layer(await mount(), 3).querySelectorAll('[data-landing-diff-flag]');
    expect(flags).toHaveLength(fixture.diff.length);
    for (const flag of flags) expect(flag.className.split(" ")).toEqual(expect.arrayContaining(["ring-1", "ring-foreground/[0.06]", "rounded-xs"]));
  });

  it("① 번역 화면 — 실제 사전의 화면 이름·Publish·키 목록, `fr`은 비어 있다", async () => {
    const text = layer(await mount(), 0).textContent ?? "";
    expect(text).toContain(m.common.nav.translations);
    expect(text).toContain(p.button);
    expect(text).toContain(fixture.selected.key);
    expect(text).toContain(m.translations.workspace.detail.missing);
    expect(text).not.toContain(fixture.selected.typed);
  });

  it("② 타이핑 — 타이핑 자리가 이 씬에 하나뿐이고 스테이지가 채운다", async () => {
    const container = await mount();
    expect(container.querySelectorAll("[data-landing-typed]")).toHaveLength(1);
    expect(layer(container, 1).querySelector("[data-landing-typed]")).not.toBeNull();
    expect(layer(container, 1).textContent).toContain(m.translations.workspace.detail.notSaved);
  });

  it("③ 저장 → 배지 — 전·후 숫자가 `group-data-[badge=1]/frame`으로 갈린다", async () => {
    const scene = layer(await mount(), 2);
    const before = find<HTMLElement>(scene, "[data-landing-badge=before]");
    const after = find<HTMLElement>(scene, "[data-landing-badge=after]");
    expect(before.querySelector("[data-landing-publish]")?.getAttribute("aria-disabled")).toBe("true");
    expect(before.textContent).toBe(p.button);
    expect(after.textContent).toContain(String(fixture.unsentAfter));
    expect(before.className).toContain("group-data-[badge=1]/frame:hidden");
    expect(after.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(scene.textContent).toContain(m.translations.workspace.footer.savedNotSent);
  });

  it("④ Publish 미리보기 — 제목·diff·전후 라벨이 실제 사전에서 온다", async () => {
    const text = layer(await mount(), 3).textContent ?? "";
    expect(text).toContain(p.previewTitle(fixture.unsentAfter));
    expect(text).toContain(p.previewIntro(fixture.repo));
    expect(text).not.toContain(p.beforeLabel);
    expect(text).toContain(p.afterLabel);
    for (const row of fixture.diff) expect(text).toContain(row.after);
  });

  it("⑤ PR 열림 — 결과 제목과 PR 번호", async () => {
    const text = layer(await mount(), 4).textContent ?? "";
    expect(text).toContain(p.created);
    expect(text).toContain(`${fixture.repo} #${fixture.pullRequest}`);
    expect(text).toContain(p.prState);
  });
});

describe("목업 — 화면 영역 안에 들어간다 (#112)", () => {
  /**
   * ⚠️ **jsdom은 레이아웃이 없어 높이를 못 잰다** — 1280×720 시절 실측(0.964 배율, 로케일 목록 358px)에서 행 넷(en·de·es·fr)이 약 400px라
   * `fr` 칸이 푸터 밑으로 들어갔다. 예산을 행 수로 묶고, 목록이 넘쳐도 푸터 위로 칠하지 않게 자르는지 본다.
   */
  it("로케일 목록이 자기 칸에서 잘리고 행이 셋(원문 둘 + `fr`)을 넘지 않는다", async () => {
    const container = await mount();
    for (const k of [0, 1, 2]) {
      const list = find<HTMLElement>(layer(container, k), "[data-landing-locales]");
      expect(list.className).toContain("min-h-0");
      expect(list.className).toContain("overflow-hidden");
      expect(list.children.length).toBeLessThanOrEqual(3);
    }
    expect(fixture.selected.values.length + 1).toBeLessThanOrEqual(3);
  });
});

describe("목업 — 편집기와 Publish가 같은 프로젝트다 (#114)", () => {
  /**
   * ⚠️ **Publish에 선 언어는 편집기에도 행으로 선다** — 실제 앱의 편집기는 `All languages`에서 프로젝트의 모든 언어를 보인다.
   * #112에서 편집기의 `es` 행을 뺐는데 ④가 여전히 `messages/es.json`을 보내 두 씬이 다른 프로젝트를 말했다. 언어 목록을
   * 손으로 두 벌 두지 않도록 **편집기가 실제로 그린 언어**(씬 ①의 DOM)에서 기대값을 뽑는다.
   */
  it("④가 보내는 언어·파일이 편집기의 언어에서 나오고, 선택 키의 편집은 ②③이 만든 `fr` 하나다", async () => {
    const container = await mount();
    const editor = [...find(layer(container, 0), "[data-landing-locales]").children].map((row) => row.querySelector("span")?.textContent?.trim() ?? "");
    expect(editor).toEqual([...fixture.selected.values.map((value) => value.code), fixture.selected.typedCode]);

    const files = [...layer(container, 3).querySelectorAll("[data-landing-file]")].map((node) => node.getAttribute("data-landing-file"));
    expect(files).toEqual(fixture.diff.map((row) => fixture.file(row.code)));
    expect(new Set(files).size).toBe(files.length);
    for (const row of fixture.diff) expect(editor).toContain(row.code);

    expect(fixture.diff.filter((row) => row.key === fixture.selected.key).map((row) => row.code)).toEqual([fixture.selected.typedCode]);
    const keys = fixture.rows.map((row) => row.key);
    for (const row of fixture.diff) expect(keys).toContain(row.key);
    // ⑤의 파일 수도 같은 목록에서 나온다.
    expect(layer(container, 4).textContent).toContain(p.prMeta(fixture.pullRequest, files.length));
  });
});

describe("목업 픽스처", () => {
  it("타이핑 값은 NFC `fr`이고 ④의 diff가 같은 값을 보낸다", () => {
    const typed = fixture.selected.typed;
    expect(fixture.selected.typedCode).toBe("fr");
    expect(typed).toBe(typed.normalize("NFC"));
    expect(fixture.diff.find((row) => row.code === "fr")?.after).toBe(typed);
    expect(fixture.diff).toHaveLength(fixture.unsentAfter);
  });
});

describe("목업 소스 — 문구는 사전을 지난다", () => {
  const files = readdirSync(DIR).filter((name) => name.endsWith(".tsx"));
  const bare = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  it("파일을 실제로 읽었다", () => {
    expect(files.length).toBeGreaterThan(1);
  });

  it("JSX 텍스트 노드에 글자가 없다", () => {
    const offenders = files.flatMap((name) => [...bare(readFileSync(join(DIR, name), "utf8")).matchAll(/(?<![=-])>\s*[A-Za-z][^<{]*</g)].map((match) => `${name}: ${match[0]}`));
    expect(offenders).toEqual([]);
  });

  /** 열거형 prop(`phase`·`variant`·`size`·상태 키 `state`)은 문구가 아니라 코드 값이다. */
  const CODE_PROPS = new Set(["className", "phase", "variant", "size", "state", "display"]);

  it("문자열 prop 리터럴이 className·data-*·열거형 말고 없다", () => {
    const offenders = files.flatMap((name) =>
      [...bare(readFileSync(join(DIR, name), "utf8")).matchAll(/\s([a-zA-Z][\w-]*)="[^"]*[A-Za-z][^"]*"/g)]
        .filter((match) => !CODE_PROPS.has(match[1] ?? "") && !(match[1] ?? "").startsWith("data-"))
        .map((match) => `${name}: ${match[0].trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});

/**
 * ⚠️ **위 그물은 목업 디렉터리만 본다** — 스테이지·랜딩 페이지·공개 셸·`/privacy` 그릇은 `no-korean-ui`(한글)만 걸려,
 * 영문 리터럴이 사전을 건너뛰어도 green이었다(POSTMORTEM 2026-09-20 "규칙의 그물이 원래 화면에만 있었다").
 * prop은 **문구를 싣는 이름**만 본다 — `target`·`rel`·`variant` 같은 코드 값은 목업 쪽 열거형 목록보다 넓다.
 */
describe("공개 화면 소스 — 문구는 사전을 지난다", () => {
  const FILES = [
    "app/page.tsx",
    "app/privacy/page.tsx",
    "components/landing/stage.tsx",
    "components/public-doc-table.tsx",
    "components/privacy/privacy-doc.tsx",
    "components/public-doc-toc.tsx",
    // `/docs/*` 셸·내비·원고 렌더러 — 본문은 md지만 그릇의 문구는 사전을 지난다(DESIGN §6.61).
    "app/docs/layout.tsx",
    "app/docs/not-found.tsx",
    "app/docs/[[...slug]]/page.tsx",
    ...readdirSync(join(process.cwd(), "components/docs"))
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => `components/docs/${name}`),
    ...readdirSync(join(process.cwd(), "components/public-shell"))
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => `components/public-shell/${name}`),
  ];
  const bare = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const read = (file: string) => bare(readFileSync(join(process.cwd(), file), "utf8"));
  const TEXT_PROPS = ["aria-label", "aria-description", "aria-valuetext", "title", "alt", "placeholder"];

  it("파일을 실제로 읽었다", () => {
    expect(FILES.filter((file) => file.startsWith("components/public-shell/")).length).toBeGreaterThan(1);
    expect(FILES.every((file) => read(file).length > 0)).toBe(true);
  });

  it("JSX 텍스트 노드에 글자가 없다", () => {
    const offenders = FILES.flatMap((file) => [...read(file).matchAll(/(?<![=-])>\s*[A-Za-z][^<{]*</g)].map((match) => `${file}: ${match[0]}`));
    expect(offenders).toEqual([]);
  });

  it("문구를 싣는 prop에 리터럴이 없다", () => {
    const offenders = FILES.flatMap((file) =>
      [...read(file).matchAll(/\s([a-zA-Z][\w-]*)="[^"]*[A-Za-z][^"]*"/g)]
        .filter((match) => TEXT_PROPS.includes(match[1] ?? ""))
        .map((match) => `${file}: ${match[0].trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});

/**
 * **목업의 상태 표시는 실물과 같은 형이다** (ux-drift-unify 🔴 G · 1-Y10 · 5-Y7 · Q3 — spec 완료 조건 12). 목업이 사본을 들면 실물이 바뀔 때
 * 목업만 낡는다(PR 열림이 초록 · 선택 면 0.04 · Unsent 테두리 알약 · 미번역 호박이 그렇게 남았다). 실물 컴포넌트를 렌더해 클래스를 견준다.
 */
describe("목업 — 상태 표시가 실물과 같다", () => {
  const classes = async (node: React.ReactNode) => (await render(<>{node}</>)).container.firstElementChild!.className;

  it("Unsent는 실물 `StatusBadge unsent`다 — 손 조립 알약이 아니다 (Q3)", async () => {
    const real = await classes(<StatusBadge state="unsent" />);
    const scene = layer(await mount(), 3);
    const badges = [...scene.querySelectorAll("span")].filter((node) => node.textContent === m.translations.workspace.list.notSent && node.children.length === 0);
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) expect(badge.className).toBe(real);
  });

  it("PR 열림은 실물 PR 카드와 같은 회색이다 — 초록 success가 아니다 (🔴 G)", async () => {
    const real = await classes(<StatusBadge state="prOpen" />);
    const scene = layer(await mount(), 4);
    const badge = [...scene.querySelectorAll("span")].find((node) => node.textContent === p.prState && node.children.length === 0)!;
    expect(badge.className).toBe(real);
    const glyph = badge.parentElement!.querySelector("svg.lucide-git-pull-request-arrow")!;
    expect(glyph.getAttribute("class")).toContain("text-muted-foreground");
    expect(glyph.getAttribute("class")).not.toContain("green");
  });

  it("선택 면은 실물 `ListRow selected`의 값이다 (5-Y7)", async () => {
    const face = (await classes(<ListRow as="button" variant="canvas" ringInset selected />)).split(" ").find((token) => token.startsWith("bg-foreground/"))!;
    const scene = layer(await mount(), 0);
    expect(find(scene, `[data-landing-row="${fixture.selected.key}"]`).className.split(" ")).toContain(face);
    expect(scene.innerHTML).not.toContain("bg-foreground/[0.04]");
  });

  it("미번역은 회색이다 — 호박은 검토 대기·저장 전만 든다 (1-Y10)", async () => {
    const scene = layer(await mount(), 0);
    const untranslated = [...scene.querySelectorAll("span")].filter((node) => node.children.length === 0 && /untranslated/i.test(node.textContent ?? ""));
    expect(untranslated.length).toBeGreaterThan(0);
    for (const node of untranslated) expect(node.className).not.toContain("amber");
  });

  it("개수 배지는 실물 `CountBadge`다 — 숫자는 `aria-hidden`이고 sr 문장이 붙는다 (Q13)", async () => {
    const scene = layer(await mount(), 0);
    const tree = find(scene, "[data-landing-tree]");
    expect(tree.querySelector('[aria-hidden="true"]')?.textContent).toBe(String(fixture.sources.length));
    expect(tree.querySelector(".sr-only")?.textContent).toBe(m.sources.count(fixture.sources.length));
  });

  it("모달 닫기 X는 실물 `CloseButton`과 같은 클래스다 — 태그만 `<span>`이다", async () => {
    const real = new Set((await render(<CloseButton label="x" />)).container.querySelector("button")!.className.split(" "));
    const scene = layer(await mount(), 4);
    const x = scene.querySelector("svg.lucide-x")!.parentElement!;
    expect(new Set(x.className.split(" "))).toEqual(real);
  });
});
