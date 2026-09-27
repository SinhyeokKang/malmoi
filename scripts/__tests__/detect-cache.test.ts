import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

/**
 * **캐시를 켤지의 판정** (action-run-cache r1). action의 준비 스텝이 러너의 시스템 Node로 이 파일을 돈다 — 그래서
 * TS가 아니라 `.cjs`이고, 여기서 `createRequire`로 부른다.
 *
 * ⚠️ `reason`은 `::warning` 줄에 실린다 — 대상 리포 파일의 문자열이 그대로 가면 개행·`::`가 워크플로 명령이 된다.
 */
type Files = { packageJson?: string; pnpmWorkspace?: string; npmrc?: string };
type Detect = (files: Files) => { cache: boolean; reason: string };

const { detectCache } = createRequire(import.meta.url)("../../.github/actions/malmoi-i18n-push/detect-cache.cjs") as { detectCache: Detect };

const pkg = (value: unknown) => ({ packageJson: JSON.stringify(value) });

describe("detectCache — 켠다", () => {
  it("파일이 하나도 없다", () => {
    expect(detectCache({})).toEqual({ cache: true, reason: "" });
  });

  it("`packageManager`가 pnpm이다 — 무결성 접미사가 붙어도", () => {
    expect(detectCache(pkg({ packageManager: "pnpm@10.33.0" })).cache).toBe(true);
    expect(detectCache(pkg({ packageManager: "pnpm@10.33.0+sha512.abc" })).cache).toBe(true);
  });

  it("`packageManager`가 없다", () => {
    expect(detectCache(pkg({ name: "x" })).cache).toBe(true);
  });

  /**
   * ⚠️ 깨진 `package.json`은 여기서 판정하지 않는다 — `pnpm/action-setup`이 v4·v6 모두 그 파일을 먼저 `JSON.parse`해
   * 캐시 복원 전에 던진다(v1에서도 red였다). 이 함수가 끄든 켜든 결과가 같으니 갈래를 만들지 않는다.
   */
  it("`package.json`이 JSON이 아니면 판정을 셋업에 넘긴다(켠다)", () => {
    expect(detectCache({ packageJson: "{" }).cache).toBe(true);
    expect(detectCache({ packageJson: "null" }).cache).toBe(true);
    expect(detectCache({ packageJson: "[]" }).cache).toBe(true);
    expect(detectCache({ packageJson: '"pnpm"' }).cache).toBe(true);
  });
});

describe("detectCache — 다른 패키지 매니저면 끈다", () => {
  it("yarn·npm이면 이름을 말한다", () => {
    expect(detectCache(pkg({ packageManager: "yarn@4.1.0" }))).toEqual({ cache: false, reason: "yarn" });
    expect(detectCache(pkg({ packageManager: "npm@10.0.0" }))).toEqual({ cache: false, reason: "npm" });
  });

  it("`devEngines.packageManager`가 `packageManager`보다 앞선다 — pnpm의 판정 순서", () => {
    expect(detectCache(pkg({ packageManager: "pnpm@10.33.0", devEngines: { packageManager: { name: "yarn" } } }))).toEqual({ cache: false, reason: "yarn" });
    expect(detectCache(pkg({ packageManager: "yarn@4.1.0", devEngines: { packageManager: { name: "pnpm" } } })).cache).toBe(true);
  });

  it("`devEngines.packageManager` 배열은 첫 항목이다", () => {
    expect(detectCache(pkg({ devEngines: { packageManager: [{ name: "bun" }, { name: "pnpm" }] } }))).toEqual({ cache: false, reason: "bun" });
    expect(detectCache(pkg({ devEngines: { packageManager: [{ name: "pnpm" }, { name: "yarn" }] } })).cache).toBe(true);
  });

  it("`devEngines`에 이름이 없으면 `packageManager`로 내려간다", () => {
    expect(detectCache(pkg({ packageManager: "yarn@4.1.0", devEngines: { packageManager: { version: "1" } } }))).toEqual({ cache: false, reason: "yarn" });
  });
});

describe("detectCache — 모양 밖 값은 이름을 싣지 않는다 (워크플로 명령 주입)", () => {
  it("개행·`::`가 든 이름", () => {
    const got = detectCache(pkg({ packageManager: "x\n::error::y@1" }));
    expect(got).toEqual({ cache: false, reason: "a package manager other than pnpm" });
    expect(got.reason).not.toMatch(/[\n:]/);
  });

  it("문자열이 아닌 `packageManager`·`devEngines` 이름", () => {
    expect(detectCache(pkg({ packageManager: 5 }))).toEqual({ cache: false, reason: "a package manager other than pnpm" });
    expect(detectCache(pkg({ devEngines: { packageManager: { name: ["yarn"] } } }))).toEqual({ cache: false, reason: "a package manager other than pnpm" });
  });
});

describe("detectCache — store 경로를 바꾼 리포는 끈다", () => {
  const custom = { cache: false, reason: "a custom pnpm store dir" };

  it("`pnpm-workspace.yaml`의 `storeDir` — 인용한 키도", () => {
    expect(detectCache({ pnpmWorkspace: "packages:\n  - a\nstoreDir: .pnpm-store\n" })).toEqual(custom);
    expect(detectCache({ pnpmWorkspace: '"storeDir": .pnpm-store\n' })).toEqual(custom);
    expect(detectCache({ pnpmWorkspace: "'storeDir' : /tmp/s\n" })).toEqual(custom);
  });

  it("`.npmrc`의 `store-dir`", () => {
    expect(detectCache({ npmrc: "store-dir=/tmp/s\n" })).toEqual(custom);
    expect(detectCache({ npmrc: "registry=https://x\n  store-dir = /tmp/s\n" })).toEqual(custom);
  });

  it("주석·다른 키는 무시한다", () => {
    expect(detectCache({ pnpmWorkspace: "# storeDir: x\npackages:\n  - a\n", npmrc: "; store-dir=/x\n# store-dir=/y\n" }).cache).toBe(true);
    expect(detectCache({ pnpmWorkspace: "virtualStoreDir: x\n" }).cache).toBe(true);
  });

  it("패키지 매니저 판정이 먼저다", () => {
    expect(detectCache({ ...pkg({ packageManager: "yarn@4.1.0" }), npmrc: "store-dir=/x\n" }).reason).toBe("yarn");
  });
});
