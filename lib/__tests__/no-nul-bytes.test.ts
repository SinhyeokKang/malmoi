import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * `lib/**` 소스에 NUL 바이트가 없다.
 *
 * `code-dict.ts`가 dir·ext를 `\u0000`으로 잇는데(audit 2026-09-04 #12 — 공백으로 이으면 `my app/locale/`가
 * 쪼개진다), 2026-09-07 한 편집이 그 이스케이프를 **실제 NUL 바이트**로 바꿔 넣었다. 판정은 같았지만 git이
 * 파일을 binary로 잡아 diff·blame·PR 뷰가 전부 눈멀고, NUL을 떨어뜨리는 편집기·포매터를 한 번 지나면
 * 조이너가 소리 없이 사라진다 (code-review 2026-09-07 🟡1). `globals-css.test.ts`와 같은 소스 스캔 방어선이다.
 */

const root = fileURLToPath(new URL("../", import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

describe("lib/** 소스 — NUL 바이트 없음", () => {
  it("조이너는 `\\u0000` 이스케이프로 쓴다 — 실제 바이트는 파일을 binary로 만든다", () => {
    const offenders = walk(root).filter((f) => readFileSync(f, "utf8").includes("\u0000"));
    expect(offenders).toEqual([]);
  });
});
