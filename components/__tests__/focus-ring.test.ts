// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createElement as h } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { SegmentedControl, SegmentedLinks } from "@/components/ui/segmented-control";
import { render } from "./helpers/dom";

/**
 * 렌더된 클래스를 보므로 공유 스타일·Radix 래퍼가 가능하다. 소스 스캔은 **프리미티브 경계**와
 * 픽스처 완전성에만 남는다.
 *
 * ⚠️ **`import.meta.url`로 루트를 잡을 수 없다** — 이 파일은 `@vitest-environment jsdom`이고 그
 * 환경에서 그 값은 `file:`이 아니라 `http://localhost/…`라 `fileURLToPath`가 **"The URL must be of
 * scheme file"로 던진다**(실측). `process.cwd()`가 남는 유일한 수단이고, 그것이 실행 위치에
 * 묶이는 대가는 아래 "검사 대상 파일을 실제로 찾는다"가 받는다 — 글롭이 0건이면 red다.
 */
const ROOT = process.cwd();

/** DESIGN §7의 셋. 하나라도 빠지면 링이 안 보이거나 브라우저 기본 outline만 남는다. */
const RING = ["focus-visible:ring-ring", "focus-visible:ring-2", "focus-visible:outline-none"];

/**
 * ⚠️ **`components/ui/`를 더 이상 제외하지 않는다** (2026-09-08, SaaS 6a T5). 그 디렉터리는 이제
 * **이 리포가 소유하는 프리미티브**이고 shadcn CLI를 다시 돌리지 않는다 — 생성물과 싸울 일이 없으므로
 * 제외할 이유가 사라졌고, 오히려 **링이 사는 유일한 자리**라 여기가 검사의 본체다 (DESIGN §7).
 */
const SKIP = new Set(["__tests__", "node_modules"]);

/**
 * ✅ **비었다** (2026-09-08 ship 4). 축소형 목록이 목적을 다했다 — 아래 검사가 이제 "`ui/` **밖에** raw
 * `<button>`·`<input>`·`<select>`·`<textarea>`가 0개"라는 **전면 방어선**이다. 화면이 raw 태그를 쓰면
 * 그 커밋이 red이고, 링을 프리미티브 안에 한 번 두는 것의 대가가 그것이다.
 *
 * ⚠️ **다시 채우지 않는다.** 새 컨트롤이 필요하면 `components/ui/`에 프리미티브로 만든다.
 */
const RAW_TAG_ALLOWED: string[] = [];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * `<button` / `<input`의 여는 태그 하나를 통째로 떼어낸다.
 *
 * 정규식으로 `>`까지 자르면 `onClick={() => {…}}`의 화살표에서 잘린다. 중괄호 깊이와 따옴표
 * 상태를 보면서 **깊이 0의 `>`** 를 찾는 것이 유일하게 맞는 방법이다.
 */
function openingTag(src: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote !== null) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

/**
 * 주석을 벗긴다 — **프리미티브는 자기 태그 이름을 주석에 쓴다**(`native \`<select>\`다`). 안 벗기면
 * 그 설명이 컨트롤로 잡혀 영원히 red다. `no-korean-ui`와 같은 벗기기이고, 아래 메타 테스트가 셋을
 * 하나씩 먹여 실제로 벗기는지 본다.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

/**
 * 포커스를 받을 수 있는 hand-rolled 컨트롤. `type="hidden"`은 포커스 대상이 아니다.
 *
 * ⚠️ **네 태그를 본다.** `button|input`만 보던 시절 온보딩의 `<select>`가 방어선 밖이었다
 * (2026-09-07). 포커스를 받는 태그가 늘면 여기에 더한다 — 아래 메타 테스트가 목록을 고정한다.
 *
 * ⚠️ **`tabIndex={-1}` + `aria-hidden`도 포커스 대상이 아니다** (2026-09-13 — `file-input.tsx`).
 * `<input type="file">`은 `type="hidden"`이 될 수 없는데, 파일 대화상자를 여는 것 말고 아무
 * 역할이 없는 그 input에 링을 붙이면 **보이지도 않는 요소가 링을 들고 검사만 green이 된다.**
 * 둘을 **함께** 요구하는 것이 요지다 — 키보드 순서에서도 빠지고 접근성 트리에서도 빠진 것만
 * 면제된다. 보이는 컨트롤은 `Button`이고 링은 그쪽이 든다. 아래 메타 테스트가 하나만으로는
 * 면제되지 않는 것을 센다.
 */
function controls(source: string): string[] {
  const src = stripComments(source);
  const found: string[] = [];
  for (const m of src.matchAll(/<(?:button|input|select|textarea)[\s>]/g)) {
    const tag = openingTag(src, m.index);
    const unfocusable = tag.includes('type="hidden"') || (tag.includes("tabIndex={-1}") && tag.includes("aria-hidden"));
    if (!unfocusable) found.push(tag);
  }
  return found;
}

const FILES = [...tsxFiles(join(ROOT, "components")), ...tsxFiles(join(ROOT, "app"))];

/** 리포 기준 상대 경로 — 허용 목록과 같은 표기로 맞춘다. */
const rel = (file: string): string => file.slice(ROOT.length).replace(/^\//, "");

const FIXTURES = {
  "components/ui/button.tsx": h(Button, null, "Save"),
  "components/ui/input.tsx": h(Input, { "aria-label": "Search" }),
  "components/ui/textarea.tsx": h(Textarea, { "aria-label": "Translation" }),
};

/**
 * ⚠️ **Radix로 옮긴 프리미티브는 위 목록에 안 잡힌다** — 소스에 raw 태그가 없기 때문이다
 * (`<select>`·`<input type="radio">`를 2026-09-13에 걷어냈다). 그래도 **렌더되면 포커스를 받는
 * `<button>`**이라 링은 여기서 본다. 이 자리를 비우면 Radix 프리미티브의 링이 방어선 밖이 된다.
 */
const RADIX_FIXTURES = {
  "components/ui/select.tsx": h(
    Select,
    { defaultValue: "en" },
    h(SelectTrigger, { "aria-label": "Locale" }, h(SelectValue, null)),
    h(SelectContent, null, h(SelectItem, { value: "en" }, "English")),
  ),
  "components/ui/checkbox.tsx": h(Checkbox, { "aria-label": "Include files" }),
  "components/ui/radio.tsx": h(RadioGroup, { "aria-label": "Locale", defaultValue: "en" }, h(Radio, { label: "English", value: "en" })),
};

/**
 * 이 파일의 픽스처를 **면제**받는 `ui/` 파일. ⚠️ **둘의 사정이 다르다** (2026-09-13 리뷰 실측):
 * `segmented-control.tsx`는 자기 테스트가 링을 실제로 보고, **`dropdown-menu.tsx`는 아무 데서도
 * 안 본다** — 뒤엣것은 기존 dead zone이고 Radix 이관이 만든 구멍이 아니다. `dialog.tsx`는 애초에
 * 링을 든 태그가 없다(닫기 버튼이 `Button`이다).
 *
 * ⚠️ **목록에 더 얹지 않는다** — 새로 Radix로 옮기는 프리미티브는 픽스처를 들고 와야 한다.
 */
const RING_FIXTURE_EXEMPT = [
  "components/ui/dropdown-menu.tsx",
  "components/ui/segmented-control.tsx",
  "components/ui/dialog.tsx",
  // Like dialog.tsx, every modal control uses Button; no native controls bypass its ring.
  "components/ui/modal.tsx",
  /**
   * ⚠️ **`segmented-control.tsx`와 같은 사정이다** — `resizable.test.tsx`가 렌더해서 링 셋을
   * **실제로** 본다. 여기 픽스처로 둘 수 없는 이유는 아래 렌더 검사가
   * `querySelectorAll("button,input,select,textarea")`로 대상을 찾는데, 리사이즈 핸들은 포커스를
   * 받는 `<div role="separator" tabindex="0">`이라 그 넷 중 어느 것도 아니어서다.
   */
  "components/ui/resizable.tsx",
];

describe("포커스 링 (DESIGN §7)", () => {
  it("검사 대상 파일을 실제로 찾는다", () => {
    // 글롭이 조용히 0건이 되면 이 테스트가 항상 green이 된다 — 방어선이 아니라 장식이 된다.
    expect(FILES.length).toBeGreaterThan(0);
    // 프리미티브가 실제로 스캔에 들어왔다 — `ui/` 제외를 푼 것이 이 커밋의 요지다.
    expect(FILES.some((f) => rel(f).startsWith("components/ui/"))).toBe(true);
  });

  it("every native primitive has a rendered focus fixture", () => {
    const nativeFiles = FILES.filter((file) => rel(file).startsWith("components/ui/") && controls(readFileSync(file, "utf8")).length > 0).map(rel).sort();
    expect(nativeFiles).toEqual(Object.keys(FIXTURES).sort());
  });

  /**
   * ⚠️ **Radix로 옮긴 프리미티브가 조용히 방어선 밖으로 나가지 않게 센다** (2026-09-13 리뷰).
   * 위 `nativeFiles` 검사는 **raw 태그가 있는 파일만** 본다 — 링을 들었는데 태그가 없는 파일은
   * `RADIX_FIXTURES`에 있어야 한다. 이 검사가 없으면 다음에 `textarea.tsx`를 Radix로 옮기는 순간
   * 그 링을 **아무 테스트도 안 본다**(그리고 red도 안 난다).
   */
  it("링을 든 Radix 프리미티브도 픽스처를 갖는다", () => {
    const radixFiles = FILES.filter((file) => rel(file).startsWith("components/ui/"))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return source.includes("focus-visible:ring-ring") && controls(source).length === 0;
      })
      .map(rel)
      .filter((file) => !RING_FIXTURE_EXEMPT.includes(file))
      .sort();
    expect(radixFiles).toEqual(Object.keys(RADIX_FIXTURES).sort());
  });

  /**
   * ⚠️ **반대 방향도 막는다** (2026-09-13 리뷰 #5). 위 검사는 `focus-visible:ring-ring`이 **있는**
   * 파일만 세므로 **링을 아예 빼먹은** 신규 Radix 프리미티브는 어디에도 안 걸린다(raw 태그가 없어
   * `nativeFiles`에도 안 잡힌다). Radix를 들이는 `ui/` 파일은 픽스처를 갖거나 면제 목록에 있어야 한다.
   */
  it("Radix를 들이는 프리미티브는 픽스처를 갖거나 명시적으로 면제된다", () => {
    const radixImporters = FILES.filter((file) => rel(file).startsWith("components/ui/"))
      .filter((file) => readFileSync(file, "utf8").includes('from "radix-ui"'))
      .map(rel)
      .sort();
    const accounted = [...Object.keys(FIXTURES), ...Object.keys(RADIX_FIXTURES), ...RING_FIXTURE_EXEMPT];
    expect(radixImporters.filter((file) => !accounted.includes(file))).toEqual([]);
  });

  it("네 태그 전부가 렌더된 포커스 링 셋을 든다", async () => {
    for (const [file, fixture] of Object.entries({ ...FIXTURES, ...RADIX_FIXTURES })) {
      const { container } = await render(fixture);
      const elements = [...container.querySelectorAll("button,input,select,textarea")];
      expect(elements.length, file).toBeGreaterThan(0);
      for (const element of elements) {
        expect(RING.every((cls) => element.classList.contains(cls)), file).toBe(true);
      }
    }
  });

  it("Radix segments and navigation links keep rings on the visible focus target", async () => {
    const options = [{ value: "one", label: "One", href: "/one" }];
    const { container } = await render(h("div", null,
      h(SegmentedControl, { label: "View", value: "one", options, onChange: () => {} }),
      h(SegmentedLinks, { label: "Pages", current: "one", options }),
      h(ButtonLink, { href: "/one", children: "Go" }),
    ));
    const targets = [...container.querySelectorAll('button[role="radio"],a')];
    expect(targets).toHaveLength(3);
    for (const target of targets) {
      expect(RING.every((cls) => target.classList.contains(cls))).toBe(true);
      expect(target.hasAttribute("hidden")).toBe(false);
    }
  });

  /**
   * ⚠️ **화면은 raw 태그를 쓰지 않는다.** 링을 프리미티브 안에 한 번 두는 것의 대가가 이것이다 —
   * 호출부가 `<button>`을 직접 쓰면 그 한 곳만 기본값 없이 남는다(2026-09-06·07에 두 번 그랬다).
   */
  it("`ui/` 밖에 raw 태그를 쓰는 파일이 허용 목록뿐이다", () => {
    const offenders = FILES.filter(
      (f) =>
        !rel(f).startsWith("components/ui/") &&
        controls(readFileSync(f, "utf8")).length > 0 &&
        !RAW_TAG_ALLOWED.includes(rel(f)),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  it("허용 목록에 낡은 항목이 없다 — 옮긴 화면은 목록에서 빠져야 한다", () => {
    const stale = RAW_TAG_ALLOWED.filter(
      (path) => controls(readFileSync(join(ROOT, path), "utf8")).length === 0,
    );
    expect(stale).toEqual([]);
  });

  it("셋 중 하나만 빠져도 잡는다 — 스캐너가 red를 낼 수 있는지", () => {
    // 이 테스트 자신이 무력해지는 것을 막는다 (credential-separation의 메타 테스트와 같은 이유).
    const fake = `<button className="rounded focus-visible:ring-ring focus-visible:ring-2">x</button>`;
    const [tag] = controls(fake);
    expect(tag).toBeDefined();
    expect(RING.every((cls) => tag?.includes(cls))).toBe(false);
  });

  it("주석 안의 태그 이름을 컨트롤로 세지 않는다 — 프리미티브가 자기 태그를 설명한다", () => {
    expect(controls('// native `<select>`다\nconst a = 1;')).toEqual([]);
    expect(controls('/** `<input type="radio">`를 쓴다 */\nconst a = 1;')).toEqual([]);
    expect(controls('<div>{/* <button>은 안 쓴다 */}</div>')).toEqual([]);
    // 벗기기가 넓어져 진짜 태그까지 지우면 방어선이 빈다.
    expect(controls('<button className="x">y</button>')).toHaveLength(1);
  });

  it("여는 태그를 화살표 함수에서 자르지 않는다", () => {
    const fake = `<button onClick={() => setX(1)} className="focus-visible:outline-none">x</button>`;
    const [tag] = controls(fake);
    expect(tag).toContain("focus-visible:outline-none");
  });

  /**
   * ⚠️ **`<select>`가 방어선 밖이었다** (2026-09-07 `/doc-check`). 온보딩이 셀렉트를 도입했는데
   * 스캐너는 `button|input`만 봤다 — 그 셀렉트는 마침 링을 들고 있었지만 **그건 운이고 검사가
   * 아니었다.** `<textarea>`도 같은 부류다(아직 코드에 없지만 번역 UI 재작성이 쓸 수 있다).
   *
   * 포커스를 받는 컨트롤이 늘 때마다 이 목록이 낡으므로, 아래가 **네 태그를 각각 먹여** 스캐너가
   * 실제로 집는지 본다.
   */
  /**
   * ⚠️ **면제를 넓힌 만큼 그 면제가 좁은지 센다** (2026-09-13). `tabIndex={-1}`만으로 빠지면
   * 화면이 그것 하나를 붙여 링 검사를 통째로 우회할 수 있다.
   */
  it("포커스에서 빠지는 면제는 `tabIndex={-1}`와 `aria-hidden`을 함께 요구한다", () => {
    expect(controls('<input tabIndex={-1} className="a" />')).toHaveLength(1);
    expect(controls('<input aria-hidden className="b" />')).toHaveLength(1);
    expect(controls('<input tabIndex={-1} aria-hidden className="c" />')).toEqual([]);
    expect(controls('<input type="hidden" className="d" />')).toEqual([]);
  });

  it("포커스를 받는 네 태그를 다 집는다 — button·input·select·textarea", () => {
    const fake = [
      `<button className="a">x</button>`,
      `<input className="b" />`,
      `<select className="c"><option>1</option></select>`,
      `<textarea className="d" />`,
    ].join("\n");
    const labels = controls(fake).map((t) => /className="([^"]*)"/.exec(t)?.[1]);
    expect(labels).toEqual(["a", "b", "c", "d"]);
  });
});
