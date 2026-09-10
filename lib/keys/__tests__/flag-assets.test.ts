import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FLAG_INVENTORY } from "../flag";

/**
 * **보유 목록 ↔ 실제 파일 ↔ CSS 규칙**의 대조 (8-4 T0/T11).
 *
 * `flagFor`는 순수 함수라 fs를 볼 수 없고(2,709번 렌더되는 트리가 읽는다), 그래서 목록이 코드
 * 상수다. 어긋나면 **배경이 조용히 빈다** — 오류도 경고도 없다. 그 대가를 이 검사가 받는다.
 *
 * ⚠️ **셋 다 비어 있는 것이 정상 상태다** (2026-09-11): 국기 SVG는 사용자가 export 해서 준다
 * (`ui-rework/README.md` 규약 2). 에셋이 도착하면 **목록 · `public/flags/` · globals.css 규칙**이
 * 함께 늘어야 green이다.
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
  it("보유 목록과 `public/flags/`의 파일이 정확히 같다", () => {
    expect([...FLAG_INVENTORY].sort()).toEqual([...files].sort());
  });

  /**
   * ⚠️ **규칙이 없으면 `<span>`만 서고 배경이 비어 보인다.** 국기를 `<img>`가 아니라 CSS
   * `background-image`로 그리는 대가가 "표(코드)와 CSS 둘을 함께 고쳐야 한다"이고, 그것을 사람이
   * 기억하게 두지 않는다 (design §3.7).
   */
  it("목록의 국기마다 `globals.css`에 규칙이 있다", () => {
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
    const missing = FLAG_INVENTORY.filter((id) => !css.includes(`[data-flag="${id}"]`));
    expect(missing).toEqual([]);
  });

  /** 검사식이 실제로 어긋남을 잡는다 — 목록이 비어 있는 동안 위 둘이 공허하게 통과한다. */
  it("대조가 공허하지 않다 — 한쪽만 늘면 걸린다", () => {
    expect([...FLAG_INVENTORY, "zz"].sort()).not.toEqual([...files].sort());
  });
});
