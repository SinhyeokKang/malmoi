import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * ⚠️ **`pushTokenHash`는 해시라도 RSC 페이로드에 싣지 않는다** (project-card-tabs design §6) — Home `CI` 행은 유무만 말한다.
 * 페이지가 select 직후 boolean으로 접어 `project`에서 떼므로, 그 뒤 `project`를 어디로 넘겨도 해시가 따라가지 않는다.
 * typecheck는 이것을 못 본다 — 문자열이 클라이언트 props로 흘러도 타입은 맞다. 그래서 소스를 센다.
 */
const code = (file: string) => readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

describe("Home의 push 토큰 해시 비노출", () => {
  const page = code("app/(edit)/projects/[slug]/(home)/page.tsx");

  it("페이지가 select 직후 해시를 떼고 유무만 남긴다", () => {
    expect(page).toContain("pushTokenHash: true");
    expect(page).toMatch(/const \{ pushTokenHash, \.\.\.project \} = projectRow;/);
    expect(page).toContain("const ciConfigured = pushTokenHash !== null;");
    // 위 셋 말고 해시를 읽는 자리가 없다.
    expect(page.match(/pushTokenHash/g)).toHaveLength(3);
  });

  it("조회 행(projectRow)을 통째로 넘기지 않는다", () => {
    expect(page.match(/\bprojectRow\b/g)).toHaveLength(3);
  });

  it.each(["components/home/meta-column.tsx", "components/home/meta-tabs.tsx", "lib/home/meta.ts"])("%s에 해시가 없다", (file) => {
    expect(code(file)).not.toContain("pushTokenHash");
  });
});
