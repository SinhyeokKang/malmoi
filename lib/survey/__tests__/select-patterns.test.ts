import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { LOCALES_PATH } from "../../adapters/chrome-locales";
import { CODE_FILE } from "../../adapters/code-dict";
import { JSON_FILE, LOCALE_DIR_FILE } from "../../adapters/json-catalog";
import { NEVER, YAML_FILE } from "../../adapters/yaml-catalog";

/**
 * **측정기가 어댑터의 경로 규칙을 사본으로 들지 않는다** (audit #73).
 *
 * ⚠️ POSTMORTEM 2026-09-02 — 어댑터가 새 경로 모양을 받았는데 `select.ts`의 사본을 안 고쳐 `yaml-catalog`가 3회차 내내
 * 1순위 0개였다. 사본이 있는 한 "같은 커밋에서 고친다"는 규율이고, import면 구조다.
 */
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const src = readFileSync(join(ROOT, "lib/survey/select.ts"), "utf8");

const SHARED = { LOCALES_PATH, CODE_FILE, JSON_FILE, LOCALE_DIR_FILE, NEVER, YAML_FILE };

describe("survey/select — 경로 정규식은 어댑터의 것이다", () => {
  it("어댑터 정규식의 리터럴 사본이 없다", () => {
    const copies = Object.entries(SHARED)
      .filter(([, pattern]) => src.includes(`/${pattern.source}/`))
      .map(([name]) => name);
    expect(copies).toEqual([]);
  });

  /** ⚠️ 사본이 0인 것만으로는 부족하다 — 이름을 바꿔 새 사본을 만들어도 위 검사는 못 본다. 실제로 import하는지 센다. */
  it("여섯을 어댑터 모듈에서 import한다", () => {
    for (const name of Object.keys(SHARED)) {
      expect(src, name).toMatch(new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from "\\.\\./adapters/`));
    }
  });
});
