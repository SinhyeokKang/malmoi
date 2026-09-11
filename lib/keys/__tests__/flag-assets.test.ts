import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FLAG_INVENTORY, flagFor } from "../flag";

/**
 * **보유 목록 ↔ 실제 파일**의 대조 (8-4 T0/T11).
 *
 * `flagFor`는 순수 함수라 fs를 볼 수 없고(로케일 배지가 `?ns=*`에서 2,709번 렌더되는 트리에 산다),
 * 그래서 목록이 코드 상수다. 어긋나면 **배경이 조용히 빈다** — 오류도 경고도 없다. 그 대가를 이
 * 검사가 받는다.
 */
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const FLAG_DIR = join(ROOT, "public/flags");

/** ⚠️ `public/fonts/`(생성물, gitignore)와 반대로 **커밋된 원본**이다 — `public/brand/`와 같은 부류. */
const files = existsSync(FLAG_DIR)
  ? readdirSync(FLAG_DIR)
      .filter((name) => name.endsWith(".svg"))
      .map((name) => name.slice(0, -".svg".length))
  : [];

describe("국기 에셋", () => {
  it("목록과 `public/flags/`의 파일이 정확히 같다", () => {
    expect([...FLAG_INVENTORY].sort()).toEqual([...files].sort());
  });

  it("스캐너가 조용히 0건이 되지 않는다", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("파일명이 전부 ISO 3166-1 alpha-2 소문자다", () => {
    expect(files.filter((id) => !/^[a-z]{2}$/.test(id))).toEqual([]);
  });

  /**
   * ⚠️ **원본 세트의 `GE-AB`·`GE-OS`는 일부러 안 들였다** — alpha-2가 아니라 로케일 하위태그로
   * 올 수 없다. 이 검사가 그 판정을 지운 채 다시 들어오는 것을 막는다.
   */
  it("alpha-2가 아닌 코드가 섞이지 않았다", () => {
    expect(files).not.toContain("ge-ab");
    expect(files).not.toContain("ge-os");
    expect(files).toContain("ge");
  });
});

/**
 * **사용자가 못 박은 세 규칙** (2026-09-11). 앞의 하나만 언어 표의 몫이고 뒤의 둘은 `flagFor`의
 * 판정 순서(하위태그가 먼저다)가 낸다 — 표에 지역별 항목을 더하면 규칙이 두 벌이 된다.
 */
describe("로케일 → 국기 (실제 보유 목록으로)", () => {
  it("`en`은 GB다 — 표에만 담기는 답이다", () => {
    expect(flagFor("en")).toBe("gb");
  });

  it("`en-GB`는 GB, `en-US`는 US다 — 하위태그가 언어 표를 이긴다", () => {
    expect(flagFor("en-GB")).toBe("gb");
    expect(flagFor("en-US")).toBe("us");
  });

  it("구분자가 `_`여도 같다 — 리포 파일명이 둘 다 쓴다", () => {
    expect(flagFor("en_US")).toBe("us");
    expect(flagFor("zh_CN")).toBe(flagFor("zh-CN"));
  });

  /** 전 세트를 들인 값이 여기다 — 표에 없는 언어도 지역 하위태그만 있으면 선다. */
  it("표에 없는 언어도 지역 하위태그로 선다", () => {
    expect(flagFor("pt-BR")).toBe("br");
    expect(flagFor("es-MX")).toBe("mx");
  });

  it("국가가 없는 언어와 임의 문자열은 `null`이다 — 폴백은 코드만이다", () => {
    expect(flagFor("ar")).toBeNull();
    expect(flagFor("weird")).toBeNull();
    expect(flagFor("__proto__")).toBeNull();
  });
});

/**
 * ⚠️ **URL을 배지가 인라인 `style`로 만든다** — 전역 CSS 규칙이 아니다(253개가 국기 없는 화면까지
 * 나가고, 손으로 소유하는 `globals.css`가 생성물이 된다). 그래서 **경로 규칙이 그 파일 한 줄**이고
 * 여기서 그것을 고정한다.
 */
describe("배지가 경로를 만드는 자리", () => {
  /** 주석을 벗기고 센다 — docstring이 자기가 **피하는 것**(`<img>`)을 이름으로 적는다. */
  const badge = readFileSync(join(ROOT, "components/translations/locale-badge.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

  it("`flagFor`가 낸 id로 `/flags/<id>.svg`를 만든다", () => {
    expect(badge).toMatch(/backgroundImage: `url\(\/flags\/\$\{flag\}\.svg\)`/);
    expect(badge).toMatch(/flagFor\(/);
  });

  it("`<img>`가 아니다 — `?ns=*`에서 2,709개의 요소가 늘지 않는다", () => {
    expect(badge).not.toMatch(/<img\b/);
    expect(badge).not.toMatch(/next\/image/);
  });

  it("전역 CSS 규칙을 되살리지 않았다", () => {
    expect(readFileSync(join(ROOT, "app/globals.css"), "utf8")).not.toContain("data-flag");
  });
});
