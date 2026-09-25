// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockupScenes } from "@/components/landing/mockup";
import { Stage } from "@/components/landing/stage";
import { m } from "@/lib/i18n";

import { find, render } from "./helpers/dom";

/**
 * **랜딩 목업의 씬 DOM** (landing T5). 목업은 서버가 그린 정적 복제라 조작 대상이 아니다 — 프레임은
 * `aria-hidden` + `inert`이고, **jsdom은 `inert`를 구현하지 않으므로** 인터랙티브 태그 자체가 0이어야 한다.
 *
 * ⚠️ 앱 라벨은 실제 사전 키를 읽는다 — 목업과 앱이 다른 말을 하기 시작하면 랜딩이 거짓이다(design.md "목업 문구").
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
    <div data-landing-scroller="">
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
