import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SKIP_DIR, sourceKind, walkFiles } from "../walk";

/**
 * 세 CLI가 공유하는 리포 훑기인데 테스트가 0이었다 (2026-09-04 audit #26). `scan.ts`가
 * `dist-log-viewer`를 안 건너뛰던 결함이 통합 이유였으니 그 규칙을 여기서 고정한다.
 */

const root = mkdtempSync(join(tmpdir(), "walk-"));
for (const d of ["src", "node_modules/x", ".git", "dist-log-viewer", "locales"]) mkdirSync(join(root, d), { recursive: true });
writeFileSync(join(root, "src/a.ts"), "");
writeFileSync(join(root, "node_modules/x/b.ts"), "");
writeFileSync(join(root, ".git/c.ts"), "");
writeFileSync(join(root, "dist-log-viewer/d.ts"), "");
writeFileSync(join(root, "locales/en.json"), "{}");
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("walkFiles", () => {
  it("SKIP_DIR 아래는 훑지 않고, 경로는 루트 기준 상대·정렬이다", () => {
    expect(walkFiles(root)).toEqual(["locales/en.json", "src/a.ts"]);
  });

  it("스캔 대상과 적재 대상이 같은 제외 목록을 쓴다 — dist-log-viewer가 그 목록에 있다", () => {
    expect(SKIP_DIR.has("dist-log-viewer")).toBe(true);
    expect(SKIP_DIR.has("node_modules")).toBe(true);
  });
});

describe("sourceKind", () => {
  it("ts/tsx는 ts, 그 외 텍스트 소스는 raw, 나머지는 undefined", () => {
    expect(sourceKind("a.tsx")).toBe("ts");
    expect(sourceKind("a.html")).toBe("raw");
    expect(sourceKind("a.json")).toBe("raw");
    expect(sourceKind("a.png")).toBeUndefined();
  });
});
