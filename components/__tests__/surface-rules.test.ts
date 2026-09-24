import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **전역 표면 규칙 둘을 소스 전수로 센다** — mono(§4.1)와 밑줄(§6.3).
 *
 * ⚠️ **둘 다 화면에도 테스트에도 안 나타나는 부류다.** 값은 맞고 글꼴·장식만 어긋나므로 렌더 테스트가
 * green이고, 눈으로는 그 화면을 열어야만 보인다. 실제로 2026-09-22 Sources 리워크가 §4.1이 걷어낸
 * 자리에 `text-mono` 셋을, 2026-09-21 설정 리워크가 §6.3이 0으로 만든 `underline` 하나를 되살렸고
 * **`pnpm test` 5,039개가 전부 green이었다** — `/doc-check`이 문서를 코드와 대조해서야 드러났다.
 *
 * ⚠️ **파일 목록을 손으로 적지 않는다** (`multiline-detail.test.ts`와 같은 이유). 규칙의 문장이
 * "화면 전체"인데 검사 범위가 그보다 좁으면 그 차이가 매번 결함이 된다 — 새 화면은 목록 밖에서 태어난다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const SKIP = new Set(["__tests__", "node_modules"]);

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
 * ⚠️ **주석을 벗기고 센다** — 이 규칙들을 설명하는 주석이 자기가 금지하는 낱말을 이름으로 적는다
 * (`locale-badge.tsx`의 "코드가 sans다 — `text-mono`가 아니다", `key-group.tsx`도 같다).
 */
const bare = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const screens = (): { path: string; source: string }[] =>
  [...tsxFiles(join(ROOT, "components")), ...tsxFiles(join(ROOT, "app"))].map((file) => ({
    path: relative(ROOT, file),
    source: bare(readFileSync(file, "utf8")),
  }));

/** `path:line` 목록. 실패 메시지가 곧 고칠 자리여야 파일 이름만 받고 다시 찾는 일이 없다. */
const lines = (keep: (text: string) => boolean): string[] =>
  screens()
    .flatMap(({ path, source }) => source.split("\n").map((text, i) => ({ path, line: i + 1, text })))
    .filter(({ text }) => keep(text))
    .map(({ path, line }) => `${path}:${line}`);

describe("DESIGN §4.1 — mono는 코드 블록 전용이다", () => {
  /**
   * 살아 있는 자리 **하나**. 늘리려면 §4.1의 표와 이 목록을 함께 바꾼다 — 그 표가 "왜 남았나"를 들고
   * 여기는 "지금 몇이나"를 든다.
   *
   * ⚠️ **둘이었다가 하나가 됐다** (2026-09-24): importer가 0이던 `first-ingest-retry.tsx`를 지웠다(audit #66).
   *
   * ⚠️ **셋이었다가 둘이 됐다** (2026-09-22): 옛 로케일 화면의 대기 Alert `<pre>`가 사라졌다.
   * 두 `locales/page.tsx`가 전부 Sources로 보내는 리다이렉트가 되면서 그 블록이 통째로 없어졌고,
   * 같은 값(`base-locale:` 한 줄)은 Sources 상세가 **sans `<code>`**로 낸다.
   */
  const ALLOWED = [
    // 워크플로 YAML — 원본 줄바꿈과 들여쓰기가 값의 일부다.
    "components/onboarding/workflow-block.tsx",
  ];

  it("허용 목록 밖에서 `text-mono`를 쓰지 않는다", () => {
    const offenders = screens()
      .filter(({ path, source }) => source.includes("text-mono") && !ALLOWED.includes(path))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  /** ⚠️ 매칭이 0인 스캐너는 방어선이 아니라 장식이다 — 허용 목록이 실제로 살아 있는지 센다. */
  it("허용 목록의 자리는 실제로 `text-mono`를 든다", () => {
    const dead = ALLOWED.filter((path) => !bare(readFileSync(join(ROOT, path), "utf8")).includes("text-mono"));
    expect(dead).toEqual([]);
  });

  /**
   * ⚠️ **`<code>`·`<pre>`는 클래스를 떼도 mono로 남는다** — Tailwind preflight가 `code, kbd, samp, pre`에
   * mono 스택을 깐다. 그래서 `text-mono`를 지우는 것만으로는 화면이 안 바뀌고, 값 칩은 **`font-sans`를
   * 명시**해야 한다. 이 검사가 없으면 "클래스를 지웠으니 sans다"가 조용히 거짓이 된다.
   */
  it("`<code>`는 `font-sans`나 `text-mono` 중 하나를 명시한다", () => {
    // ⚠️ 매칭이 0인 스캐너는 장식이다 — 먼저 `<code>` 자리가 실재하는지 센다.
    expect(lines((text) => /<code\b/.test(text)).length).toBeGreaterThan(0);
    expect(lines((text) => /<code\b/.test(text) && !/font-sans|text-mono/.test(text))).toEqual([]);
  });
});

describe("DESIGN §6.3 — 인라인 링크에 밑줄을 쓰지 않는다", () => {
  /**
   * 2026-09-10 사용자 판정(전역 규칙). 8-1b가 소스 13곳을 전수로 걷었고 `Button` variant `link`도
   * 함께 바뀌었다 — 나가는 신호는 **색과 새 탭**이 든다.
   *
   * ⚠️ **`no-underline`은 다르다** — 그쪽은 브라우저 기본 밑줄을 **끄는** 쪽이라 규칙에 어긋나지 않는다.
   */
  const UNDERLINE = /(?<![\w-])(?:hover:|focus:|group-hover:)?underline\b/;

  it("`underline`·`hover:underline`이 0건이다", () => {
    expect(lines((text) => UNDERLINE.test(text))).toEqual([]);
  });

  /** 0건인 규칙은 정규식이 죽어도 green이라, 무엇을 잡는지 별도로 고정한다. */
  it("같은 정규식이 금지된 클래스를 잡는다", () => {
    expect(UNDERLINE.test('className="text-blue-600 underline"')).toBe(true);
    expect(UNDERLINE.test('className="hover:underline"')).toBe(true);
    // 끄는 쪽은 통과한다 — 이 예외가 없으면 규칙이 자기 해법을 금지한다.
    expect(UNDERLINE.test('className="no-underline"')).toBe(false);
  });
});
