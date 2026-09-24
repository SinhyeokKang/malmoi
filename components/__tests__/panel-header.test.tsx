// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PanelBody, PanelHeader } from "@/components/shell/content-panel";

import { find, render } from "./helpers/dom";

/**
 * **패널 머리·본문의 규격은 프리미티브가 든다** (projects-panel-rework T3 · 캔버스 `1a`~`1d`).
 *
 * ⚠️ **이 파일이 재는 것은 라우트 아홉 전부의 공통 계약이다.** 시안이 그린 것은 `/projects` 하나인데
 * 그 값을 프리미티브에 넣으면 **시안이 안 그린 화면 여덟**이 함께 움직인다 — POSTMORTEM 2026-09-14가
 * 정확히 그 부류였다(Dialog의 `16 16 0`이 푸터 없는 소비자 하나에서만 깨졌다). 그 회고의 재발 방지는
 * "여백이 전제하는 형제 슬롯을 **코드의 조건으로** 쓴다"이고, 여기서는 `description` 슬롯이 그것이다.
 *
 * ⚠️ **jsdom은 computed style을 못 잰다** — 이 층이 보는 것은 **구조**(어느 요소가 어느 클래스를 드나)이고,
 * 실제 픽셀은 `/design-sync` 4단계가 잰다.
 */

// ⚠️ **jsdom에서는 `import.meta.url`이 file 스킴이 아니다** — 이 파일은 렌더와 소스를 함께 보므로
// 루트를 `process.cwd()`에서 받는다(vitest가 리포 루트에서 돈다).
const ROOT = process.cwd();
const SOURCE = readFileSync(join(ROOT, "components/shell/content-panel.tsx"), "utf8");

const header = async (ui: Parameters<typeof PanelHeader>[0]) => {
  const { container } = await render(<PanelHeader {...ui} />);
  return container.firstElementChild as HTMLElement;
};

describe("PanelHeader — 여백·선·폭을 프리미티브가 든다", () => {
  /** 캔버스 넷 모두 머리가 `padding:16`이다. 24와 12가 섞인 비대칭이 여기서 끝난다. */
  it("안쪽 래퍼가 전방향 16을 든다", async () => {
    const outer = await header({ children: <h1>Projects</h1> });
    const inner = find<HTMLElement>(outer, ":scope > div");
    expect(inner.classList.contains("p-4")).toBe(true);
    for (const cls of [...inner.classList]) expect(cls).not.toMatch(/^(px|py|pt|pb|pl|pr)-/);
  });

  /**
   * ⚠️ **선은 패널 전폭이라 바깥이 든다.** `CONTENT_MAX` 안쪽에 두면 1280 상한에서 선이 잘려
   * 넓은 화면에서만 머리가 떠 보인다 — 눈으로는 "선이 있네"로 읽힌다.
   */
  it("바깥이 아래 선을 들고, 폭 상한 안쪽이 아니다", async () => {
    const outer = await header({ children: <h1>Projects</h1> });
    expect(outer.classList.contains("border-b")).toBe(true);
    expect(outer.classList.contains("border-border")).toBe(true);
    expect(outer.classList.contains("shrink-0")).toBe(true);
    const inner = find<HTMLElement>(outer, ":scope > div");
    expect([...inner.classList].filter((c) => c.startsWith("border"))).toEqual([]);
  });

  /** ⚠️ **스크롤 여부와 무관하게 늘 있다** — 스크롤할 때만 나타나는 선은 "무언가 숨어 있다"는 신호다. */
  it("선이 조건부가 아니다", () => {
    // 상태가 없으면 조건부일 수 없다. ⚠️ `scroll`을 문자열로 세지 않는다 — `overflow-y-auto`를
    // `overflow-y-scroll`로 바꾸기만 해도 "선이 조건부다"라며 red가 난다.
    expect(SOURCE).not.toMatch(/\buseState\b|\buseEffect\b|"use client"/);
    expect(SOURCE).not.toMatch(/border-b[^"]*\?|\?[^"]*border-b/);
  });

  it.each([
    ["limited", "max-w-4xl"],
    ["fluid", "max-w-7xl"],
  ] as const)("폭 등급 %s가 %s다", async (width, expected) => {
    const outer = await header({ width, children: <h1>Projects</h1> });
    expect(find<HTMLElement>(outer, ":scope > div").classList.contains(expected)).toBe(true);
  });

  /**
   * ⚠️ **기본이 `limited`다** — 7 대 4로 다수이고, 빠뜨렸을 때 좁아지는 쪽이 넘치는 쪽보다 눈에 띈다.
   */
  it("등급을 안 주면 limited다", async () => {
    const outer = await header({ children: <h1>Projects</h1> });
    expect(find<HTMLElement>(outer, ":scope > div").classList.contains("max-w-4xl")).toBe(true);
  });

  /**
   * **설명 한 줄 슬롯** — `logs`·`locales`·`surfaces/new` 셋이 쓴다 (`spec.md` §8.1).
   *
   * ⚠️ **크기가 지금 12와 14 두 벌로 갈려 있다.** 슬롯이 규격을 가져야 그 둘이 하나가 된다 —
   * 호출부에 맡기면 다음 화면이 또 각자 정한다.
   */
  it("설명 슬롯이 13px muted 한 줄이다", async () => {
    const outer = await header({ children: <h1>Projects</h1>, description: "Locale files." });
    const line = find<HTMLElement>(outer, "p");
    expect(line.textContent).toBe("Locale files.");
    expect(line.classList.contains("text-xs")).toBe(true);
    expect(line.classList.contains("text-muted-foreground")).toBe(true);
  });

  /** 설명이 없으면 그 자리가 DOM에 없다 — 빈 `<p>`의 line-height가 머리를 늘린다. */
  it("설명이 없으면 그리지 않는다", async () => {
    const outer = await header({ children: <h1>Projects</h1> });
    expect(outer.querySelector("p")).toBeNull();
  });

  /**
   * ⚠️ **여백 16의 전제는 "제목 줄 하나"다.** 설명이 붙으면 세로로 늘어야 하므로 래퍼가 열이고
   * 간격이 12다 — 그 조건을 주석이 아니라 코드가 든다 (POSTMORTEM 2026-09-14).
   */
  it("래퍼가 열이고 간격 12다 — 설명·거부 Alert이 제목 줄 아래로 쌓인다", async () => {
    const outer = await header({ children: <h1>Projects</h1> });
    const inner = find<HTMLElement>(outer, ":scope > div");
    expect(inner.classList.contains("flex")).toBe(true);
    expect(inner.classList.contains("flex-col")).toBe(true);
    expect(inner.classList.contains("gap-3")).toBe(true);
  });
});

describe("PanelBody — 같은 여백, 같은 등급", () => {
  const body = async (ui: Parameters<typeof PanelBody>[0]) => {
    const { container } = await render(<PanelBody {...ui} />);
    return container.firstElementChild as HTMLElement;
  };

  it("안쪽 래퍼가 전방향 16을 든다", async () => {
    const outer = await body({ children: <p>rows</p> });
    const inner = find<HTMLElement>(outer, ":scope > div");
    expect(inner.classList.contains("p-4")).toBe(true);
    for (const cls of [...inner.classList]) expect(cls).not.toMatch(/^(px|py|pt|pb|pl|pr)-/);
  });

  /**
   * ⚠️ **폭 상한을 스크롤 컨테이너에 직접 주면 스크롤바가 콘텐츠 옆에 생긴다** (2026-09-11 사용자).
   * 눈으로는 "폭이 맞네"로 보이고, 콘텐츠가 넘칠 때만 드러난다.
   */
  it("스크롤은 바깥, 폭 상한은 안쪽이다", async () => {
    const outer = await body({ children: <p>rows</p> });
    expect(outer.classList.contains("overflow-y-auto")).toBe(true);
    expect([...outer.classList].filter((c) => c.startsWith("max-w-"))).toEqual([]);
    expect(find<HTMLElement>(outer, ":scope > div").classList.contains("max-w-4xl")).toBe(true);
  });

  it.each([
    ["limited", "max-w-4xl"],
    ["fluid", "max-w-7xl"],
  ] as const)("폭 등급 %s가 %s다", async (width, expected) => {
    const outer = await body({ width, children: <p>rows</p> });
    expect(find<HTMLElement>(outer, ":scope > div").classList.contains(expected)).toBe(true);
  });

  /** ⚠️ **`min-h-full`이 없으면 `/projects`의 빈 상태가 세로 중앙에 안 선다.** */
  it("본문 래퍼가 패널 높이를 이어받는다", async () => {
    const outer = await body({ children: <p>rows</p> });
    expect(find<HTMLElement>(outer, ":scope > div").classList.contains("min-h-full")).toBe(true);
  });

  /** 본문에는 선이 없다 — 머리가 든 선 하나로 경계가 선다. */
  it("본문이 선을 들지 않는다", async () => {
    const outer = await body({ children: <p>rows</p> });
    expect([...outer.classList].filter((c) => c.startsWith("border"))).toEqual([]);
  });
});

/**
 * **소비자 열하나이 여백을 판단하지 않는다** (완료 조건 1).
 *
 * ⚠️ **세는 명령을 실제로 돌려 본문과 맞췄다** — `grep -rln "PanelHeader"`는 더 많이 내는데
 * `project-archived.tsx`·`project-not-ready.tsx`가 *"`PanelHeader`가 없다"*는 **주석**으로 잡히고
 * `content-panel.tsx` 자신도 주석에서 그 이름을 부른다. 그 셋은 소비자가 아니다
 * (POSTMORTEM 2026-09-14: 세는 명령을 적을 때 그 명령을 돌려 본다).
 *
 * ⚠️ **이 목록이 2026-09-20까지 하나 적었다** — PR #43이 열하나로 만들었고, **PR #44가
 * `projects/[slug]/loading.tsx`를 추가하면서 목록을 안 늘렸다.** 그 파일은 그 뒤로 이 검사를 한 번도
 * 안 받았다(실해는 없었다 — 열어 보니 padding을 안 넘긴다). 같은 프리미티브의 소비자 수가 틀린 것이
 * 이번이 **네 번째**다 (POSTMORTEM 2026-09-14 · 2026-09-15).
 * ⚠️ **`<PanelHeader`를 새로 쓰면 이 배열에 한 줄을 더한다** — 그러지 않으면 새 화면이 검사 밖이다.
 */
describe("소비자 열다섯 — 여백을 넘기지 않는다", () => {
  const CONSUMERS = [
    "components/projects/project-list.tsx",
    "app/(edit)/projects/(list)/loading.tsx",
    "app/(edit)/projects/[slug]/(home)/loading.tsx",
    // Logs도 골격을 갖는다 (logs-rework) — 머리 높이가 실물과 같아야 도착할 때 안 튄다.
    "app/(edit)/projects/[slug]/logs/loading.tsx",
    "app/(edit)/projects/[slug]/(home)/page.tsx",
    "app/(edit)/projects/[slug]/settings/page.tsx",
    "app/(edit)/projects/[slug]/logs/page.tsx",
    "app/(edit)/projects/[slug]/members/page.tsx",
    "components/sources/sources-archived.tsx",
    "components/sources/sources-screen.tsx",
    "app/(edit)/account/page.tsx",
    "app/(edit)/account/loading.tsx",
    // 형제 화면의 골격 (audit-ux #5) — 번역 골격은 작업 화면처럼 프리미티브를 안 쓴다.
    "app/(edit)/projects/[slug]/members/loading.tsx",
    "app/(edit)/projects/[slug]/settings/loading.tsx",
    "app/(edit)/projects/[slug]/sources/loading.tsx",
  ];

  /**
   * ⚠️ **`PanelBody`만 쓰는 소비자 셋이 이 수 밖에 있다** — `<PanelHeader`로 세면 안 잡히는데
   * `PanelBody`의 여백도 같은 커밋에서 프리미티브로 올라갔으므로 **같은 이중 여백을 만든다.**
   * 실제로 구현 중 그 셋이 `16 + 24 = 40`이 됐다 (POSTMORTEM 2026-09-14: 소비자 수가 세 번 틀렸고
   * 빠졌던 하나가 하필 그 변경의 소비자였다).
   *
   * 세는 명령 (2026-09-20에 다시 돌렸다 — 주석의 이름 인용을 빼고 센다):
   * `grep -rn "<PanelHeader" components app | grep -v __tests__ | grep -v content-panel` → **13**
   * `grep -rn "<PanelBody" components app | grep -v __tests__ | grep -v content-panel` → **17**
   * 차이 넷이 아래 `BODY_ONLY`다.
   */
  const BODY_ONLY = [
    "components/project-archived.tsx",
    "components/project-not-ready.tsx",
    "app/(edit)/error.tsx",
    /**
     * ⚠️ **Logs 전용 오류 화면이다** (logs-rework 결정 16) — 조회 실패를 빈 목록으로 접지 않으려면
     * 문구가 "이력이 없다"가 아니라 "이력을 못 읽었다"여야 하고, 그 문구는 세그먼트 공용 오류가
     * 못 든다. 머리가 없는 이유는 필터가 서버 데이터를 받기 때문이다.
     */
    "app/(edit)/projects/[slug]/logs/error.tsx",
  ];

  /**
   * ⚠️ **수만 고정하면 목록이 낡는 것을 못 잡는다** — 실제로 그렇게 낡았다(위 주석). 그래서
   * **소스를 직접 세어** 목록과 대조한다: 새 소비자가 생기면 목록을 안 고친 그 커밋이 red다.
   */
  it("목록이 실제 소비자 전수와 같다 — 새 화면이 검사 밖으로 못 나간다", () => {
    const walk = (dir: string): string[] =>
      readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__tests__") return [];
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return walk(rel);
        return entry.name.endsWith(".tsx") ? [rel] : [];
      });
    const uses = (tag: string) =>
      [...walk("app"), ...walk("components")]
        // ⚠️ 프리미티브 자신은 주석에서 두 이름을 다 부른다 — 소비자가 아니다.
        .filter((rel) => rel !== "components/shell/content-panel.tsx")
        .filter((rel) => readFileSync(join(ROOT, rel), "utf8").includes(tag));

    expect(uses("<PanelHeader").sort()).toEqual([...CONSUMERS].sort());
    expect(uses("<PanelBody").sort()).toEqual([...CONSUMERS, ...BODY_ONLY].sort());
  });

  it("소비자가 열다섯 + 본문 전용 넷이다 — 수가 바뀌면 다시 센다", () => {
    // translation-rework T16 — 옛 번역 머리가 빠졌다. 새 작업 화면은 `PanelHeader`를 쓰지 않는다(세 패널이 본문 전체를 든다).
    expect(CONSUMERS).toHaveLength(15);
    expect(BODY_ONLY).toHaveLength(4);
  });

  it.each(BODY_ONLY)("%s도 여백·폭을 다시 정하지 않는다", (path) => {
    const source = readFileSync(join(ROOT, path), "utf8");
    expect(source).not.toContain("max-w-4xl");
    const tags = [...source.matchAll(/<PanelBody\b[^>]*>/g)].map((match) => match[0]);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).not.toMatch(/\b(px|py|pt|pb|pl|pr)-\d/);
  });

  it.each(CONSUMERS)("%s가 `PanelHeader`에 padding을 넘기지 않는다", (path) => {
    const source = readFileSync(join(ROOT, path), "utf8");
    const tags = [...source.matchAll(/<Panel(?:Header|Body)\b[^>]*>/g)].map((match) => match[0]);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).not.toMatch(/\b(px|py|pt|pb|pl|pr)-\d/);
  });

  /**
   * ⚠️ **안쪽 래퍼의 `max-w-4xl`도 함께 사라진다** — 프리미티브가 등급을 들면서 이중 여백의 원인이
   * 없어진다. 남겨 두면 limited 일곱이 `16 + 24 = 40`이 된다 (DESIGN §5.15).
   */
  it.each(CONSUMERS)("%s가 안쪽 래퍼로 폭을 다시 정하지 않는다", (path) => {
    expect(readFileSync(join(ROOT, path), "utf8")).not.toContain("mx-auto w-full max-w-4xl");
  });
});
