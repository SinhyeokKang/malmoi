import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **두 GitHub 자격증명이 소스에서 섞이지 않는다** (SAAS §9-6 · CLAUDE.md "두 GitHub 자격증명을
 * 섞지 않는다").
 *
 * - `lib/github.ts` — App **installation** 토큰. 커밋을 만든다. 개인키(`GITHUB_APP_PRIVATE_KEY`)를 문다.
 * - `lib/github-connect/` — **user-to-server** 토큰. **GET만 부른다.** 개인키를 몰라야 한다.
 *
 * OAuth 사용자 토큰이 커밋 경로에 들어가면 커밋이 개인 명의가 되고, 그 사람이 org를 떠나면
 * 파이프라인이 깨진다 (ARCHITECTURE §6). 반대로 App 개인키가 연결 경로로 새면 사용자 인가 판정에
 * 앱 권한이 섞인다.
 *
 * ⚠️ `entry-points.test.ts`와 같은 성질의 **상시 방어선**이다 — 읽어서 한 번 확인하는 것으로는
 * 다음 커밋에 무너진다.
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * App 개인키 경로에만 있어야 하는 것. `lib/github-connect/` 어디에도 없어야 한다.
 *
 * ⚠️ **`\bApp\b`로는 못 가른다.** 사용자 문구가 "이 리포에 App이 설치돼 있지 않아요"라고 말하고
 * 그건 주석이 아니라 코드다 — 넓은 패턴은 잡을 것을 잡는 대신 항상 red가 되어 이 방어선을
 * 통째로 버리게 만든다. **자격증명을 무는 형태**(octokit의 `App` import·생성자·개인키 헬퍼·
 * installation 토큰 발급)만 겨눈다.
 */
const APP_CREDENTIAL =
  /import\s*\{[^}]*\bApp\b[^}]*\}\s*from\s*["']octokit["']|new App\s*\(|parsePrivateKey|GITHUB_APP_PRIVATE_KEY|getInstallationOctokit/;

/**
 * **사용자 토큰을 다루는 모듈.** `lib/github.ts`가 이걸 물면 커밋 경로에 사용자 토큰이 들어온다.
 *
 * ⚠️ **`lib/github-connect/` 전체를 막지 않는다.** 그 디렉터리에는 순수 판정(`health.ts`의
 * `probeFromError`·`ProbeResult`)도 있고, `probeRepo`가 실패를 분류하려면 그것을 **불러야 한다** —
 * 안 부르고 자체 분기를 두면 판정이 두 벌이 되어 403이 한쪽에서만 `not-installed`가 된다
 * (`/code-review` 2026-09-06이 T2 위험으로 지목한 자리). 막아야 하는 것은 디렉터리가 아니라
 * **토큰을 쥔 모듈**이다.
 */
const USER_TOKEN_IMPORT = /from\s+["'](@\/lib\/github-connect\/(user|token-store)|\.\/github-connect\/(user|token-store))/;

function sourcesIn(dir: string, base: string): { rel: string; source: string }[] {
  const out: { rel: string; source: string }[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__") continue;
    const full = join(dir, entry);
    const rel = `${base}/${entry}`;
    if (statSync(full).isDirectory()) out.push(...sourcesIn(full, rel));
    else if (entry.endsWith(".ts")) out.push({ rel, source: readFileSync(full, "utf8") });
  }
  return out;
}

const CONNECT_SOURCES = sourcesIn(join(ROOT, "lib/github-connect"), "lib/github-connect");
const GITHUB_TS = readFileSync(join(ROOT, "lib/github.ts"), "utf8");
/**
 * **온보딩은 GitHub을 아예 모른다** (2026-09-07, design §3.10). 순수 판정과 DB 껍데기(`ingest.ts`)만 갖고,
 * App 개인키도 사용자 토큰도 **그리고 `lib/github.ts`도** import하지 않는다 — 두 토큰이 만나는 자리는
 * Server Action 하나여야 한다. 여기에 루트를 더하지 않으면 이 방어선이 새 디렉터리를 자동으로 덮지 않는다.
 */
const ONBOARDING_SOURCES = sourcesIn(join(ROOT, "lib/onboarding"), "lib/onboarding");
/** 커밋 경로(App 토큰) 모듈. 온보딩이 이걸 물면 두 자격증명이 한 파일에서 만날 길이 열린다. */
const COMMIT_PATH_IMPORT = /from\s+["'](@\/lib\/github|\.\.\/github)["']/;

/**
 * 주석은 뺀다 — 경계를 설명하는 문장이 그 이름을 인용한다. 블록 주석은 **통째로** 지운다:
 * 한 줄짜리 `/** … *\/`는 줄 앞이 `*`가 아니라 줄 단위 필터로 안 걸린다.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

describe("검사식이 실제로 잡는다 — 스캐너가 공허하게 통과하지 않는다", () => {
  it("교차 import를 넣으면 검사식이 걸린다", () => {
    // POSTMORTEM 2026-09-03: 주석이 계약을 단언했는데 그것을 검사한다는 테스트의 **이름만** 그랬다.
    // 일부러 위반 소스를 만들어 검사식이 red를 낼 수 있음을 보인다.
    expect(APP_CREDENTIAL.test('import { App } from "octokit";')).toBe(true);
    expect(APP_CREDENTIAL.test('import { App, OAuthApp } from "octokit";')).toBe(true);
    expect(APP_CREDENTIAL.test("return new App({ appId })")).toBe(true);
    expect(APP_CREDENTIAL.test('parsePrivateKey(requireEnv("GITHUB_APP_PRIVATE_KEY"))')).toBe(true);
    expect(APP_CREDENTIAL.test("await app.getInstallationOctokit(1)")).toBe(true);
    expect(USER_TOKEN_IMPORT.test('import { exchangeCode } from "@/lib/github-connect/user";')).toBe(true);
  });

  it("정상 소스는 걸리지 않는다 — 과잉 매칭으로 항상 red가 되지 않는다", () => {
    expect(APP_CREDENTIAL.test('import { OAuthApp } from "octokit";')).toBe(false);
    expect(APP_CREDENTIAL.test('requireEnv("GITHUB_APP_CLIENT_ID")')).toBe(false);
    expect(USER_TOKEN_IMPORT.test('import { createGitClient } from "@/lib/github";')).toBe(false);
    // 순수 판정 import는 허용이다 — 토큰을 쥐지 않는다.
    expect(USER_TOKEN_IMPORT.test('import { probeFromError } from "@/lib/github-connect/health";')).toBe(false);
    // 사용자 문구가 "App"을 말한다 — 이걸 잡으면 방어선이 항상 red라 버려진다.
    expect(APP_CREDENTIAL.test('return "이 리포에 App이 설치돼 있지 않아요.";')).toBe(false);
  });

  it("스캔 대상을 실제로 찾았다", () => {
    expect(CONNECT_SOURCES.length).toBeGreaterThan(3);
    expect(ONBOARDING_SOURCES.length).toBeGreaterThan(3);
  });

  it("커밋 경로 import 검사식이 실제로 잡는다", () => {
    expect(COMMIT_PATH_IMPORT.test('import { readRepoSnapshot } from "@/lib/github";')).toBe(true);
    expect(COMMIT_PATH_IMPORT.test('import { probeRepo } from "../github";')).toBe(true);
    // 이웃 디렉터리는 다른 모듈이다 — 넓게 잡으면 방어선이 항상 red가 된다.
    expect(COMMIT_PATH_IMPORT.test('import { probeFromError } from "@/lib/github-connect/health";')).toBe(false);
    expect(COMMIT_PATH_IMPORT.test('import { logFailure } from "@/lib/github-connect/log";')).toBe(false);
  });
});

describe("온보딩은 두 자격증명을 모른다 (design §3.10)", () => {
  it("lib/onboarding/이 App 자격증명을 참조하지 않는다", () => {
    const offenders = ONBOARDING_SOURCES.filter((f) => APP_CREDENTIAL.test(codeOnly(f.source))).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("lib/onboarding/이 사용자 토큰 모듈을 import하지 않는다", () => {
    const offenders = ONBOARDING_SOURCES.filter((f) => USER_TOKEN_IMPORT.test(codeOnly(f.source))).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("lib/onboarding/이 `@/lib/github`을 import하지 않는다 — 스냅샷·blob은 Server Action이 값으로 넘긴다", () => {
    const offenders = ONBOARDING_SOURCES.filter((f) => COMMIT_PATH_IMPORT.test(codeOnly(f.source))).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});

describe("사용자 토큰 경로가 App 개인키를 모른다", () => {
  it("lib/github-connect/ 전체가 App 자격증명을 참조하지 않는다", () => {
    const offenders = CONNECT_SOURCES.filter((f) => APP_CREDENTIAL.test(codeOnly(f.source))).map(
      (f) => f.rel,
    );
    expect(offenders).toEqual([]);
  });

  it("lib/github-connect/ 전체가 쓰기 메서드를 부르지 않는다 — GET만 부른다", () => {
    // 교환·갱신은 OAuthApp이 대신 POST한다. 우리 코드가 직접 POST/PATCH/PUT/DELETE를 조립하면
    // 사용자 토큰이 쓰기 경로로 들어간 것이다.
    const WRITE_REQUEST = /request\(\s*["'`](POST|PATCH|PUT|DELETE)\s/;
    const offenders = CONNECT_SOURCES.filter((f) => WRITE_REQUEST.test(codeOnly(f.source))).map(
      (f) => f.rel,
    );
    expect(offenders).toEqual([]);
  });
});

describe("커밋 경로가 사용자 토큰을 모른다", () => {
  it("lib/github.ts가 사용자 토큰 모듈을 import하지 않는다", () => {
    expect(USER_TOKEN_IMPORT.test(codeOnly(GITHUB_TS))).toBe(false);
  });

  it("lib/github.ts는 여전히 App 자격증명을 문다 — 경계가 반대로 무너지지 않았다", () => {
    // 이 단언이 없으면 `lib/github.ts`가 빈 파일이 돼도 위 검사가 통과한다.
    expect(APP_CREDENTIAL.test(codeOnly(GITHUB_TS))).toBe(true);
  });
});
