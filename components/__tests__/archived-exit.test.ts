import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { m } from "@/lib/i18n";

/**
 * **보관 화면의 출구 낱말은 하나다** (ux-drift-unify 4-Y24) — 같은 목적지(Settings의 보관 카드)를 보관 화면 셋이 각자의 키로 말했다
 * (`archive.empty.action` · `logs.archived.restoreAction`). 값이 같아도 키가 둘이면 한쪽만 바뀐다. 전부 `m.archive.empty.action`이다.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const SCREENS = ["components/project-archived.tsx", "components/sources/sources-archived.tsx", "app/(edit)/projects/[slug]/logs/page.tsx"];

describe("보관 화면 출구", () => {
  it.each(SCREENS)("%s의 설정 링크는 `m.archive.empty.action`이다", (path) => {
    expect(read(path)).toMatch(/href=\{routes\.settings\(slug\)\}[^>]*>\s*\{m\.archive\.empty\.action\}/);
  });

  it("옛 사본 키가 사전에 없다", () => {
    expect(Object.hasOwn(m.logs.archived, "restoreAction")).toBe(false);
  });
});
