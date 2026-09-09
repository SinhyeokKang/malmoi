import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
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

/**
 * **심링크를 따라가지 않는다** (sec-audit 발견 12).
 *
 * `statSync`는 심링크를 **따라가므로** 대상이 디렉터리면 그 안으로 들어간다. 대상 리포는 남이
 * 쓰는 트리이고 세 CLI(`ingest`·`scan`·`push:local`)가 전부 이 함수를 지난다 — 링크 하나로
 * 훑기가 리포 밖으로 나가거나(`ln -s /etc x`) 자기 자신으로 돌아 끝나지 않는다(`ln -s . loop`).
 */
describe("walkFiles — 심링크 (sec-audit 12)", () => {
  const sroot = mkdtempSync(join(tmpdir(), "walk-link-"));
  const outside = mkdtempSync(join(tmpdir(), "walk-outside-"));
  writeFileSync(join(outside, "secret.ts"), "");
  mkdirSync(join(sroot, "src"), { recursive: true });
  writeFileSync(join(sroot, "src/a.ts"), "");
  symlinkSync(join(outside, "secret.ts"), join(sroot, "src/link.ts"));
  symlinkSync(outside, join(sroot, "outdir"), "dir");
  symlinkSync(".", join(sroot, "loop"), "dir");
  afterAll(() => {
    rmSync(sroot, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it("리포 밖을 가리키는 심링크는 결과에 없다 — 파일 링크도 디렉터리 링크도", () => {
    expect(walkFiles(sroot)).toEqual(["src/a.ts"]);
  });

  it("자기 자신을 가리키는 심링크에서 종료한다 — 던지지도 않는다", () => {
    expect(() => walkFiles(sroot)).not.toThrow();
  });
});
