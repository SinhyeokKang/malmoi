import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import nextConfig from "@/next.config";
import { appVersion } from "@/lib/app-version";

/**
 * **앱 버전은 빌드가 박는 문자열 하나다** (2026-09-28 사용자 — LNB Changelog 행의 배지). 정본은 `package.json`의 `version`이고
 * `/merge` 4단계만 그것을 올린다 — 그래서 프로덕션은 그 배포의 릴리스 번호와 같고, dev·preview는 **마지막 릴리스 번호**다.
 *
 * ⚠️ 클라이언트(사이드바)가 `package.json`을 통째로 import하면 의존성 목록까지 번들에 실린다 — `next.config`의 `env`로 문자열만 넘긴다.
 */
const ROOT = process.cwd();
const PACKAGE_VERSION = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string }).version;

afterEach(() => vi.unstubAllEnvs());

describe("appVersion", () => {
  it("next.config가 package.json의 version을 APP_VERSION으로 넘긴다", () => {
    expect(nextConfig.env?.APP_VERSION).toBe(PACKAGE_VERSION);
    expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("빌드가 박은 값을 그대로 돌려준다 — x.y.z만, 접두 v 없음", () => {
    vi.stubEnv("APP_VERSION", "1.2.3");
    expect(appVersion()).toBe("1.2.3");
  });

  it("값이 없으면 빈 문자열이다", () => {
    vi.stubEnv("APP_VERSION", undefined);
    expect(appVersion()).toBe("");
  });
});
