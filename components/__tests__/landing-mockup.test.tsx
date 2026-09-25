// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockupScenes } from "@/components/landing/mockup";
import { Stage } from "@/components/landing/stage";
import { m } from "@/lib/i18n";

import { find, render } from "./helpers/dom";

/**
 * **랜딩 목업의 씬 DOM** (DESIGN §6.615). 목업은 서버가 그린 정적 복제라 조작 대상이 아니다 — 프레임은
 * `aria-hidden` + `inert`이고, **jsdom은 `inert`를 구현하지 않으므로** 인터랙티브 태그 자체가 0이어야 한다.
 *
 * ⚠️ 앱 라벨은 실제 사전 키를 읽는다 — 목업과 앱이 다른 말을 하기 시작하면 랜딩이 거짓이다(DESIGN §6.615 "목업 문구").
 */
// ⚠️ jsdom 환경에서는 `import.meta.url`이 file 스킴이 아니다 — `landing-shell.test.tsx`와 같이 cwd에서 잡는다.
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

describe("목업 — 씬이 이야기를 든다", () => {
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
    expect(before.textContent).toContain(String(fixture.unsentBefore));
    expect(after.textContent).toContain(String(fixture.unsentAfter));
    expect(before.className).toContain("group-data-[badge=1]/frame:hidden");
    expect(after.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(scene.textContent).toContain(m.translations.workspace.footer.savedNotSent);
  });

  it("④ Publish 미리보기 — 제목·diff·전후 라벨이 실제 사전에서 온다", async () => {
    const text = layer(await mount(), 3).textContent ?? "";
    expect(text).toContain(p.previewTitle(fixture.unsentAfter));
    expect(text).toContain(p.previewIntro(fixture.repo));
    expect(text).toContain(p.beforeLabel);
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

describe("목업 — 1280×720 안에 들어간다 (#112)", () => {
  /**
   * ⚠️ **jsdom은 레이아웃이 없어 높이를 못 잰다** — 실측(0.964 배율, 로케일 목록 358px)에서 행 넷(en·de·es·fr)이 약 400px라
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

  /** 열거형 prop(`phase`·`variant`)은 문구가 아니라 코드 값이다. */
  const CODE_PROPS = new Set(["className", "phase", "variant"]);

  it("문자열 prop 리터럴이 className·data-*·열거형 말고 없다", () => {
    const offenders = files.flatMap((name) =>
      [...bare(readFileSync(join(DIR, name), "utf8")).matchAll(/\s([a-zA-Z][\w-]*)="[^"]*[A-Za-z][^"]*"/g)]
        .filter((match) => !CODE_PROPS.has(match[1] ?? "") && !(match[1] ?? "").startsWith("data-"))
        .map((match) => `${name}: ${match[0].trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
