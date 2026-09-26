import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FLAG_INVENTORY, LANGUAGE_FLAGS, flagFor } from "../flag";

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
   * ⚠️ **원본 세트의 지역 하위 코드는 일부러 안 들였다** — alpha-2가 아니라 로케일 하위태그로
   * 올 수 없다. 이 검사가 그 판정을 지운 채 다시 들어오는 것을 막는다. `ge-ab`·`ge-os`는 처음
   * 들인 Figma 세트의 이름이고, 지금 원본(`country-flag-icons` `3x2/`)에서는 `gb-eng`류다.
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
    expect(flagFor("weird")).toBeNull();
    expect(flagFor("__proto__")).toBeNull();
  });
});

/**
 * **언어 표의 경계** (2026-09-11 사용자 — "언어명과 나라가 사실상 1:1인 것만").
 *
 * ⚠️ **뺀 쪽이 이 검사의 본체다.** 주요 사용국이 둘 이상인 언어에 국기를 하나 고르면 **절반에게
 * 틀린 국기**가 되고, 그건 없는 것보다 나쁘다. 누가 편의로 `es`를 더하면 여기서 red다.
 */
describe("언어 표", () => {
  it("표의 국기가 전부 보유 목록에 있다 — 없으면 배경이 조용히 빈다", () => {
    const missing = [...LANGUAGE_FLAGS.entries()].filter(([, id]) => !FLAG_INVENTORY.includes(id));
    expect(missing).toEqual([]);
  });

  it("1:1인 언어들이 선다", () => {
    expect(flagFor("de")).toBe("de");
    expect(flagFor("cs")).toBe("cz");
    expect(flagFor("uk")).toBe("ua");
    expect(flagFor("el")).toBe("gr");
    expect(flagFor("vi")).toBe("vn");
    expect(flagFor("hi")).toBe("in");
  });

  /** ⚠️ 노르웨이어는 코드가 셋인데 나라가 하나다 — 셋 다 와서 셋 다 적었다. */
  it("노르웨이어 코드 셋이 같은 국기다", () => {
    expect([flagFor("no"), flagFor("nb"), flagFor("nn")]).toEqual(["no", "no", "no"]);
  });

  /**
   * ⚠️ **언어 코드와 국가 코드가 엇갈려 겹치는 두 쌍** — 오타로 보여서 "고쳐지기" 쉬운 자리다.
   */
  it("엇갈린 두 쌍이 서로를 안 먹는다", () => {
    expect(flagFor("ms")).toBe("my"); // 말레이어 → 말레이시아
    expect(flagFor("my")).toBe("mm"); // 버마어 → 미얀마
    expect(flagFor("sl")).toBe("si"); // 슬로베니아어 → 슬로베니아
    expect(flagFor("si")).toBe("lk"); // 싱할라어 → 스리랑카
  });

  it("주요 사용국이 여럿인 언어는 표에 없다 — 틀린 국기는 없는 것보다 나쁘다", () => {
    for (const code of ["es", "pt", "ar", "sw", "ta", "ca", "eu", "gl", "cy"]) {
      expect(flagFor(code), code).toBeNull();
    }
  });

  /** 그래도 하위태그가 붙으면 정확히 선다 — 그 경우 표를 지나지 않는다. */
  it("뺀 언어도 지역이 특정되면 선다", () => {
    expect(flagFor("es-MX")).toBe("mx");
    expect(flagFor("pt-BR")).toBe("br");
    expect(flagFor("ar-EG")).toBe("eg");
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
