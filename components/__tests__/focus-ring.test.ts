import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * hand-rolled 컨트롤이 포커스 링 셋을 들었는지 **소스에서** 센다 (DESIGN §7).
 *
 * ⚠️ **화면이 늘 때마다 다시 샌다.** 2026-09-06에 버튼 4곳이 없어서 한 번 고쳤고, 2026-09-07
 * `/doc-check`이 설정 화면의 "연결 해제"에서 같은 것을 또 잡았다 — 그 사이 DESIGN §7은 규칙이
 * 지켜진 상태로 서술하고 있었다. **shadcn 생성 컴포넌트를 안 쓰므로 "기본값"이 지켜 주지 않고**,
 * 키보드 사용자에게만 보이는 결함이라 눈으로는 두 번 다 놓쳤다.
 *
 * `credential-separation`·`entry-points`·`globals-css`와 같은 계열의 상시 방어선이다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** DESIGN §7의 셋. 하나라도 빠지면 링이 안 보이거나 브라우저 기본 outline만 남는다. */
const RING = ["focus-visible:ring-ring", "focus-visible:ring-[3px]", "focus-visible:outline-none"];

/**
 * ⚠️ **`components/ui/`를 더 이상 제외하지 않는다** (2026-09-08, SaaS 6a T5). 그 디렉터리는 이제
 * **이 리포가 소유하는 프리미티브**이고 shadcn CLI를 다시 돌리지 않는다 — 생성물과 싸울 일이 없으므로
 * 제외할 이유가 사라졌고, 오히려 **링이 사는 유일한 자리**라 여기가 검사의 본체다 (DESIGN §7).
 */
const SKIP = new Set(["__tests__", "node_modules"]);

/**
 * **raw 네 태그를 아직 쓰는 파일** — 축소형 목록이다(`no-korean-ui`와 같은 형). 화면이 프리미티브로
 * 옮겨질 때마다 자기 파일을 뺀다. T8 끝에 비고, 그때부터 "`ui/` 밖에 raw 태그 0"이 전면 방어선이 된다.
 *
 * ⚠️ **늘리지 않는다.** 새 화면이 raw 태그를 쓰면 그 커밋이 red다 — 그것이 이 목록의 요지다.
 */
const RAW_TAG_ALLOWED = [
  "components/github-account.tsx",
  "components/invite-form.tsx",
  "components/onboarding/connect-github.tsx",
  "components/onboarding/copy-button.tsx",
  "components/onboarding/first-ingest-retry.tsx",
  "components/onboarding/new-project-flow.tsx",
  "components/onboarding/push-token-panel.tsx",
  "components/pull-button.tsx",
  "components/reconnect-button.tsx",
  "components/translation-input.tsx",
  "app/invite/[token]/page.tsx",
];

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
 */
function controls(source: string): string[] {
  const src = stripComments(source);
  const found: string[] = [];
  for (const m of src.matchAll(/<(?:button|input|select|textarea)[\s>]/g)) {
    const tag = openingTag(src, m.index);
    if (!tag.includes('type="hidden"')) found.push(tag);
  }
  return found;
}

const FILES = [...tsxFiles(join(ROOT, "components")), ...tsxFiles(join(ROOT, "app"))];

/** 리포 기준 상대 경로 — 허용 목록과 같은 표기로 맞춘다. */
const rel = (file: string): string => file.slice(ROOT.length).replace(/^\//, "");

describe("포커스 링 (DESIGN §7)", () => {
  it("검사 대상 파일을 실제로 찾는다", () => {
    // 글롭이 조용히 0건이 되면 이 테스트가 항상 green이 된다 — 방어선이 아니라 장식이 된다.
    expect(FILES.length).toBeGreaterThan(0);
    // 프리미티브가 실제로 스캔에 들어왔다 — `ui/` 제외를 푼 것이 이 커밋의 요지다.
    expect(FILES.some((f) => rel(f).startsWith("components/ui/"))).toBe(true);
  });

  it("네 태그 전부가 포커스 링 셋을 든다", () => {
    const missing: string[] = [];
    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      for (const tag of controls(src)) {
        if (RING.every((cls) => tag.includes(cls))) continue;
        const label = /className="([^"]*)"/.exec(tag)?.[1] ?? tag.slice(0, 60);
        missing.push(`${rel(file)}: ${label}`);
      }
    }
    expect(missing).toEqual([]);
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
    const fake = `<button className="rounded focus-visible:ring-ring focus-visible:ring-[3px]">x</button>`;
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
