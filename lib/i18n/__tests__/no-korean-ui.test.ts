import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **화면에 닿는 소스에 한글 리터럴이 없다** (CLAUDE.md 코드 컨벤션).
 *
 * UI 문자열의 단일 출처는 `messages/en.tsx`이고, 그 규칙을 지키는 것은 리뷰가 아니라 이 검사다.
 *
 * ✅ **2026-09-08 6b-1에서 목록이 둘로 줄고 `lib/adapters/**` 제외가 풀렸다.** 남은 둘은 화면이 아니다 —
 * `auth.ts`의 서버 로그 · `lib/push/apply.ts`의 SQL 주석. 즉 **`app/`·`components/`·`lib/adapters/`에
 * 대해서는 전면 방어선이고**, 새 화면이나 어댑터가 한글 리터럴을 심으면 그 커밋이 red다.
 *
 * **단언이 둘인 것이 요지다**: 목록 **밖**은 0자(회귀 즉시 red) · 목록 **안**은 ≥1자(낡은 항목 금지).
 * 처음 초안의 `it.fails`는 세 방향으로 무너졌다(QA 검수): 중간 커밋이 한글을 0으로 만드는 순간 red ·
 * 그 사이 새 한글 회귀를 못 봄 · 뒤집기를 잊을 수 있음.
 *
 * ⚠️ **주석은 벗기고 센다.** 이 리포의 주석은 CLAUDE.md대로 한국어라 벗기지 않으면 검사가 성립하지
 * 않는다. 그리고 **벗기기가 좁아지면 검사도 조용히 좁아지므로**, 아래 메타 테스트가 주석 종류 셋을
 * 하나씩 먹여 각각을 실제로 벗기는지 본다 (POSTMORTEM 2026-09-07 "좁은 검사는 자기 좁음을 신고할 수 없다").
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * 스캔 대상 루트. `lib/`은 아래 `EXCLUDED_PREFIX`로 다시 좁힌다.
 *
 * **`messages/`가 여기 있는 것이 중요하다** — 사전 자체에 한국어 **값**이 들어가는 것이 이 검사가
 * 막으려는 실패의 원형이다(주석은 벗기므로 한국어로 남는다).
 */
const ROOTS = ["app", "components", "lib", "messages"];

/**
 * ⚠️ **리포 루트의 `.ts`·`.tsx`도 본다** (2026-09-08 code-review 🟡5). `auth.ts`·`middleware.ts`가
 * `ROOTS` 밖이라 거기 UI 문자열이 생기면 이 방어선이 **영원히 조용하다** — "좁은 검사는 자기 좁음을
 * 신고할 수 없다"(POSTMORTEM 2026-09-07)의 정확한 형태다. 설정 파일은 UI가 아니라 뺀다.
 */
const ROOT_FILES = ["auth.ts", "middleware.ts"];

/**
 * 스캔에서 빼는 갈래 (CLAUDE.md 코드 컨벤션).
 *
 * - `lib/survey/**`·`lib/scan/**` — 웹 UI가 아니라 `pnpm adapter-survey`·`pnpm scan`의 **터미널 출력**이다.
 *
 * ✅ **`lib/adapters/**`가 2026-09-08 6b-1에서 빠졌다** — 오류 문구가 `AdapterErrorCode`로 바뀌어
 * 문장은 사전이 낸다. 그 디렉터리가 다시 한글 리터럴을 들면 이제 이 검사가 red다.
 */
const EXCLUDED_PREFIX = ["lib/survey/", "lib/scan/"];

const SKIP_DIR = new Set(["__tests__", "node_modules", "generated"]);

/**
 * **아직 한글이 남아 있는 파일.** 줄어들기만 한다 — 늘리려면 그 커밋이 UI 문자열을 새로 심는 것이므로
 * 리뷰에서 막는다.
 *
 * ⚠️ **`lib/push/apply.ts`는 목록에서 나가지 않는다** — 남은 한글이 `$queryRaw` 템플릿 안의 **SQL 주석**이고,
 * 그건 코드 주석이라 CLAUDE.md대로 한국어다. 스캐너가 JS 주석만 벗기므로 여기 남는다.
 *
 * ✅ **`lib/pull/render.ts`가 6b-1에서 빠졌다** — `missingOriginal`이 `original-file-missing` 코드가 됐다.
 *
 * ⚠️ **`lib/pull/run.ts`는 목록에 없다.** 그 파일도 어댑터 오류를 warnings로 조립하지만 그건 **런타임 값**이라
 * 소스 스캐너가 원리적으로 못 본다 — 이 검사가 답하는 것은 "리터럴이 있는가"뿐이다.
 */
const KOREAN_ALLOWED = [
  // ⚠️ 사용자 문자열이 아니라 **서버 로그**다(`console.warn`) — 화면에 닿지 않으므로 옮길 대상이 아니고,
  // 이 목록에 이름이 있어야 스캐너가 루트 파일을 실제로 훑는다는 것이 고정된다.
  "lib/push/apply.ts",
];

/**
 * 주석을 벗긴다. 셋을 다 벗겨야 한다:
 *
 * 1. `/* … *\/` — JSDoc 포함
 * 2. `{/* … *\/}` — JSX 주석. 바깥 중괄호만 남고 안쪽은 1번이 먹는다
 * 3. `// …` — 줄 주석. **`https://`를 주석으로 읽지 않도록** 앞 문자가 `:`이면 건너뛴다
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function scanned(): { path: string; korean: number }[] {
  return [...ROOTS.flatMap((root) => sourceFiles(join(ROOT, root))), ...ROOT_FILES.map((f) => join(ROOT, f))]
    .map((file) => relative(ROOT, file))
    .filter((path) => !EXCLUDED_PREFIX.some((prefix) => path.startsWith(prefix)))
    .map((path) => ({
      path,
      korean: (stripComments(readFileSync(join(ROOT, path), "utf8")).match(/[가-힣]/g) ?? []).length,
    }));
}

describe("UI 문자열은 사전에서 온다 — 소스에 한글 리터럴이 없다", () => {
  it("스캐너가 실제로 파일을 걸었다 — 조용히 0건이 되지 않는다", () => {
    expect(scanned().length).toBeGreaterThan(50);
  });

  it("리포 루트 파일도 스캔 대상이다 — 그 자리가 비면 검사가 조용해진다", () => {
    const paths = scanned().map(({ path }) => path);
    for (const file of ROOT_FILES) expect(paths, file).toContain(file);
  });

  it("허용 목록 밖의 파일에 한글이 없다", () => {
    const offenders = scanned()
      .filter(({ path, korean }) => korean > 0 && !KOREAN_ALLOWED.includes(path))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("허용 목록에 낡은 항목이 없다 — 옮긴 파일은 목록에서 빠져야 한다", () => {
    const byPath = new Map(scanned().map(({ path, korean }) => [path, korean]));
    const stale = KOREAN_ALLOWED.filter((path) => (byPath.get(path) ?? 0) === 0);
    expect(stale).toEqual([]);
  });
});

/**
 * ⚠️ **스캐너가 자기 좁음을 신고할 수 없으므로 하나씩 먹인다.** 주석 종류 하나를 못 벗기면 그 종류의
 * 한글이 "코드 안 한글"로 잡혀 목록이 영원히 안 줄고, 반대로 코드 안 한글을 못 잡으면 방어선이 공허해진다.
 */
describe("스캐너 메타 — 주석 셋을 벗기고 코드 안 한글은 잡는다", () => {
  it("줄 주석을 벗긴다", () => {
    expect(stripComments('const a = 1; // 한글 주석\n')).not.toMatch(/[가-힣]/);
  });

  it("블록 주석을 벗긴다", () => {
    expect(stripComments("/** 한글 JSDoc */\nconst a = 1;")).not.toMatch(/[가-힣]/);
  });

  it("JSX 주석을 벗긴다", () => {
    expect(stripComments("<div>{/* 한글 JSX 주석 */}</div>")).not.toMatch(/[가-힣]/);
  });

  it("URL의 `//`를 주석으로 읽지 않는다 — 그 뒤의 한글을 놓치면 안 된다", () => {
    expect(stripComments('const u = "https://x"; const t = "한글";')).toMatch(/[가-힣]/);
  });

  it("코드 안 한글 리터럴은 잡는다 — 벗기기가 넓어져 방어선이 비지 않는다", () => {
    expect(stripComments('const label = "저장";')).toMatch(/[가-힣]/);
    expect(stripComments("const label = `저장 ${n}건`;")).toMatch(/[가-힣]/);
    expect(stripComments("<p>저장됨</p>")).toMatch(/[가-힣]/);
  });
});
