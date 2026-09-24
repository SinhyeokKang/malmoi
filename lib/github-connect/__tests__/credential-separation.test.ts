import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **두 GitHub 자격증명이 소스에서 섞이지 않는다** (ARCHITECTURE §0-6 · CLAUDE.md "두 GitHub 자격증명을
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
 * **쓰기 호출.** 사용자 토큰으로 GitHub에 쓰면 커밋이 개인 명의가 되고 권한 면적이 넓어진다.
 *
 * ⚠️ **octokit의 입구가 넷이라 넷을 다 본다**:
 *
 * 1. `request("POST …")` — 리터럴 route
 * 2. `paginate("POST …")` — **실제 코드가 쓰는 형태다**(`user.ts`가 `paginate("GET /user/installations")`),
 *    그래서 가장 그럴듯한 회귀는 그 자리의 동사가 바뀌는 것이다. `request`만 보면 통째로 새는 자리다
 * 3. `rest.*`의 이름 붙은 쓰기 메서드 — 동사로 판정한다(`rest` 아래 메서드 이름은 안정된 규약이다:
 *    `create*`·`update*`·`delete*`·`replace*`·`add*`·`remove*`·`merge`·`set*`)
 * 4. `graphql`의 `mutation` — REST만 겨누면 이 입구가 남는다
 *
 * 1번만 보던 시절엔 나머지 셋이 조용히 통과했고, 그 상태로 문서가 "GET만 부른다"고 단언했다.
 */
const WRITE_CALL =
  /(?:request|paginate)\(\s*["'`](POST|PATCH|PUT|DELETE)\s|\brest\.[A-Za-z]+\.(create|update|delete|replace|add|remove|merge|set)[A-Za-z]*\s*[(,]|graphql\(\s*["'`][\s\S]{0,40}?\bmutation\b/;

/**
 * **사용자 토큰을 다루는 모듈.** `lib/github.ts`가 이걸 물면 커밋 경로에 사용자 토큰이 들어온다.
 *
 * ⚠️ **`lib/github-connect/` 전체를 막지 않는다.** 그 디렉터리에는 순수 판정(`health.ts`의
 * `probeFromError`·`ProbeResult`)도 있고, `probeRepo`가 실패를 분류하려면 그것을 **불러야 한다** —
 * 안 부르고 자체 분기를 두면 판정이 두 벌이 되어 403이 한쪽에서만 `not-installed`가 된다
 * (`/code-review` 2026-09-06이 T2 위험으로 지목한 자리). 막아야 하는 것은 디렉터리가 아니라
 * **토큰을 쥔 모듈**이다.
 */
const USER_TOKEN_IMPORT = /from\s+["'](@\/lib\/github-connect\/(user|token-store)|(\.\.?\/)+github-connect\/(user|token-store))/;

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
 * **온보딩은 GitHub을 아예 모른다** (2026-09-07, ARCHITECTURE §3.1). 순수 판정과 DB 껍데기(`ingest.ts`)만 갖고,
 * App 개인키도 사용자 토큰도 **그리고 `lib/github.ts`도** import하지 않는다 — 두 토큰이 만나는 자리는
 * Server Action 하나여야 한다. 여기에 루트를 더하지 않으면 이 방어선이 새 디렉터리를 자동으로 덮지 않는다.
 */
const ONBOARDING_SOURCES = [
  ...sourcesIn(join(ROOT, "lib/onboarding"), "lib/onboarding"),
  ...sourcesIn(join(ROOT, "lib/account-connect"), "lib/account-connect"),
];
/**
 * **App 토큰을 쓰는 쪽** — 커밋·PR·미리보기·열린 PR 조회 (launch-readiness L4.9). 이쪽은 `@/lib/github`을 정당하게 물고,
 * 사용자 토큰을 물면 두 자격증명이 한 파일에서 만난다. 전에는 이 루트들을 안 훑어 `lib/projects/open-pr.ts` 같은 자리가
 * 2홉 뒤에 사용자 토큰을 물어도 green이었다 (POSTMORTEM "2홉은 못 본다").
 */
const APP_TOKEN_SOURCES = ["lib/pull", "lib/push", "lib/projects", "lib/publish", "lib/import"].flatMap((dir) => sourcesIn(join(ROOT, dir), dir));
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
    // ⚠️ **상대 경로 깊이가 하나가 아니다** — `lib/onboarding/`에서는 `../github-connect/…`다. 전에는
    // `./github-connect/…`만 잡아 그 깊이가 통째로 새어 있었다 (code-review 2026-09-07 🟡4).
    expect(USER_TOKEN_IMPORT.test('import { ensureUserToken } from "../github-connect/token-store";')).toBe(true);
    expect(USER_TOKEN_IMPORT.test('import { x } from "./github-connect/user";')).toBe(true);
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
    // 다섯 다 들어왔는가 — 한 디렉터리가 이름이 바뀌면 조용히 0개가 된다.
    for (const dir of ["lib/pull", "lib/push", "lib/projects", "lib/publish", "lib/import"]) {
      expect(APP_TOKEN_SOURCES.some((f) => f.rel.startsWith(`${dir}/`)), dir).toBe(true);
    }
  });

  it("커밋 경로 import 검사식이 실제로 잡는다", () => {
    expect(COMMIT_PATH_IMPORT.test('import { readRepoSnapshot } from "@/lib/github";')).toBe(true);
    expect(COMMIT_PATH_IMPORT.test('import { probeRepo } from "../github";')).toBe(true);
    // 이웃 디렉터리는 다른 모듈이다 — 넓게 잡으면 방어선이 항상 red가 된다.
    expect(COMMIT_PATH_IMPORT.test('import { probeFromError } from "@/lib/github-connect/health";')).toBe(false);
    expect(COMMIT_PATH_IMPORT.test('import { logFailure } from "@/lib/github-connect/log";')).toBe(false);
  });
});

describe("온보딩은 두 자격증명을 모른다 (ARCHITECTURE §3.1)", () => {
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

describe("App 토큰 경로가 사용자 토큰을 모른다", () => {
  /**
   * **루트 목록이 손 목록이라 새 소비자를 놓친다** (audit #81). 감사 시점에 `lib/import/`가 `@/lib/github`을 세 파일에서
   * 물고 있었는데 목록 밖이라, 거기서 사용자 토큰을 물어도 green이었다. `lib/` 전체에서 커밋 경로를 무는 파일을
   * 찾아 목록 안인지 잰다 — 짝으로 실제 소비자가 0이 아님을 본다.
   */
  it("lib/에서 `@/lib/github`을 무는 파일은 전부 스캔 범위 안이다", () => {
    const scanned = new Set(APP_TOKEN_SOURCES.map((f) => f.rel));
    const consumers = sourcesIn(join(ROOT, "lib"), "lib").filter((f) => COMMIT_PATH_IMPORT.test(codeOnly(f.source)));
    expect(consumers.length).toBeGreaterThan(3);
    expect(consumers.map((f) => f.rel).filter((rel) => !scanned.has(rel))).toEqual([]);
  });

  it("lib/pull·push·projects·publish·import가 사용자 토큰 모듈을 import하지 않는다", () => {
    const offenders = APP_TOKEN_SOURCES.filter((f) => USER_TOKEN_IMPORT.test(codeOnly(f.source))).map((f) => f.rel);
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
    const offenders = CONNECT_SOURCES.filter((f) => WRITE_CALL.test(codeOnly(f.source))).map(
      (f) => f.rel,
    );
    expect(offenders).toEqual([]);
  });

  /**
   * ⚠️ **가드가 자기 눈으로 못 보는 형태가 있었다** (2026-09-07 `/doc-check`). 전 패턴은 리터럴
   * `request("POST"…)`만 봐서 **octokit이 제공하는 다른 세 입구가 통째로 열려 있었다** — `paginate`의 문자열 route,
   * `rest.*`의 이름 붙은 메서드, `graphql` mutation이다. 지금 코드는 실제로 GET뿐이라 red가 아니었고, 그래서
   * "GET만 부른다"는 문서 단언이 근거 없이 서 있었다.
   *
   * 아래가 그 네 입구를 각각 먹여 **스캐너가 red를 낼 수 있는지** 검사한다. 이게 없으면 패턴을
   * 넓혀도 넓혀졌는지 알 방법이 없다 (`focus-ring`의 "red를 낼 수 있는지"와 같은 계보).
   */
  it("가드가 네 입구를 다 잡는다 — request·paginate·rest.* 쓰기·graphql mutation", () => {
    const writes = [
      'await octokit.request("POST /repos/{o}/{r}/git/blobs", {});',
      'await octokit.request(`PATCH /repos/x`, {});',
      "await octokit.rest.git.createBlob({ owner, repo });",
      "await octokit.rest.pulls.create({ owner, repo });",
      "await octokit.rest.repos.update({ owner, repo });",
      "await octokit.paginate(octokit.rest.issues.create, {});",
      // ⚠️ **실제 코드가 쓰는 형태다** — `user.ts`가 `paginate("GET /user/installations")`처럼 route를
      // 문자열로 넘긴다. 그러므로 가장 그럴듯한 회귀는 그 자리의 동사가 바뀌는 것이다.
      'await octokit.paginate("POST /repos/{o}/{r}/issues");',
      'await octokit.paginate(`DELETE /repos/x`, {});',
      // graphql mutation도 쓰기다 — REST만 겨누면 이 입구가 남는다.
      'await octokit.graphql(`mutation { addComment(input: {}) { id } }`);',
    ];
    for (const line of writes) expect(WRITE_CALL.test(line), line).toBe(true);
  });

  it("가드가 읽기를 오탐하지 않는다", () => {
    const reads = [
      'await octokit.request("GET /user/installations");',
      "await octokit.rest.apps.listInstallationsForAuthenticatedUser();",
      "await octokit.paginate(octokit.rest.apps.listInstallationReposForAuthenticatedUser, {});",
      "const created = row.createdAt;",
      "// createBlob은 커밋 경로의 일이다",
    ];
    for (const line of reads) expect(WRITE_CALL.test(codeOnly(line)), line).toBe(false);
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
