import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **클라이언트 컴포넌트의 import 그래프가 서버 전용 무게를 끌어오지 않는다.**
 *
 * 2026-09-07에 실제로 밟았다: `components/translation-input.tsx`가 `lib/onboarding/message`를
 * 물었고 그 모듈이 `./slug` → `lib/pull/trigger` → `lib/pull/run` → `lib/adapters` → `ts-dict` →
 * **`ts-morph`(TypeScript 컴파일러 전체)** 로 이어져 **7.2MB 클라이언트 청크**가 세 페이지에 붙었다.
 *
 * ⚠️ **`pnpm build`가 통과한다.** 번들러는 그것을 오류로 보지 않고, `next build`의 라우트 표에도
 * 청크 크기가 안 나온다. 그때 내가 한 확인은 `@octokit`만 grep한 것이었고 — 그건 정말로 없었다 —
 * 그래서 "트리 셰이킹이 떼어낸다"는 잘못된 결론을 문서에 남겼다. **경계를 지키는 것은 grep 한 번이
 * 아니라 상시 검사다** (`credential-separation`·`entry-points`와 같은 계열).
 *
 * 검사 방식: `"use client"` 파일에서 시작해 `@/lib/**`·상대 경로를 **값 import만** 따라가고
 * (`import type`은 지운다), 그 그래프에 **허용 목록 밖의 패키지**가 나타나면 red.
 *
 * ⚠️ **금지 목록이 아니라 허용 목록이다** (2026-09-07 리뷰 🟡5). 전에는 다섯 개를 나열했는데 그건
 * 사고의 원인이었던 "자기가 고른 패턴만 답한다"와 같은 형태다 — `yaml`·`zod`처럼 목록에 없는
 * 무게는 통과했고, 목록에 있던 `server-only`조차 **이 리포가 쓰는 형태**(`import "server-only"`)를
 * 정규식이 못 봤다. 허용 목록은 새 의존성을 조용히 통과시키지 않는다.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * 클라이언트 번들에 들어와도 되는 패키지. **실측에서 나온 목록이다** — 늘리는 것은 의도된 결정이어야
 * 하고, 그 결정을 이 파일에서 한 번 하게 만드는 것이 요지다.
 *
 * `next/*`는 접두로 허용한다 — 프레임워크가 서브패스를 여러 개 쓰고(`next/link`·`next/navigation`)
 * 그것을 하나씩 등재하면 목록이 프레임워크 버전을 따라다닌다.
 */
const ALLOWED = [
  "react",
  "react-dom",
  "clsx",
  "tailwind-merge",
  /**
   * ⚠️ **셋은 프리미티브(`components/ui/`)가 쓴다** — 이 리포가 그 디렉터리를 소유하면서 들어왔다
   * (ARCHITECTURE §0). `SKIP_DIR`의 `ui`는 **진입점 탐색**만 건너뛰므로 import를 따라가면
   * 여기로 들어온다. **이것이 그 "여기서 한 번 하는 의도된 결정"이고**, 아래 메타 테스트가 셋을
   * 각자 고정한다 — 하나라도 목록에서 빠지면 red다.
   */
  "radix-ui",
  "class-variance-authority",
  "lucide-react",
  /**
   * ⚠️ **8-1b가 다시 들였다.** 2026-09-08에 "사용 0"으로 제거하면서 이 파일의 **메타 반례**로
   * 남겨 뒀던 패키지다 — 그때 근거는 *"피드백은 셀 인라인과 `Alert`이고 토스트는 그것을 둘로
   * 가른다"*였고, 8단계가 **토스트로 통일**하기로 뒤집었다(2026-09-10 사용자, 두 번 재확인).
   *
   * **경계가 규약 8에 있다**: 토스트 = 전역 결과를 내는 이벤트 / 인라인 = 대상이 있는 판정 ·
   * 지속되는 조건 · 페이지 콘텐츠 자체. 그 경계가 없으면 셀 저장 상태 4종과 초대 화면의
   * `not-found`까지 토스트로 밀려간다.
   *
   * ⚠️ 그래서 아래 메타 반례에서 **빠졌다** — 목록과 반례에 동시에 있으면 한 파일 안에서 모순이다.
   */
  "sonner",
  /**
   * ⚠️ **`components/ui/resizable.tsx`가 쓴다** (2026-09-14, 패널 구분선). 셸의 LNB와 새 프로젝트
   * 모달 ②가 드래그로 폭을 바꾸는데, 그 판정(포인터 히트 영역·전역 커서·`data-resize-handle-state`)이
   * 전부 document 레벨이라 CSS로 대신할 수 없다. **9KB 남짓이고 의존성이 없다** — 이 목록이 막는
   * 부류(7.2MB `ts-morph`)와 다르지만, **그 판단을 여기서 한 번 한다**는 것이 이 목록의 요지다.
   */
  "react-resizable-panels",
];

function allowed(specifier: string, list: readonly string[] = ALLOWED): boolean {
  if (specifier === "next" || specifier.startsWith("next/")) return true;
  return list.some((ok) => specifier === ok || specifier.startsWith(`${ok}/`));
}

/**
 * 과거에 실제로 새어 나갔거나 새면 곧바로 무거워지는 것들. **판정에 쓰지 않는다** — 아래 메타
 * 테스트가 "스캐너가 이것들을 실제로 집는지"를 확인하는 데만 쓴다(목록이 낡아도 판정은 안 좁아진다).
 */
const KNOWN_OFFENDERS = ["ts-morph", "octokit", "@prisma/client", "node:fs", "server-only", "yaml", "zod"];

/**
 * **클라이언트가 닿아도 되는 `lib/**` 파일 — 정확 일치다** (launch-readiness L4.9, POSTMORTEM 2026-09-09 재발).
 *
 * 위 패키지 허용 목록은 **npm 이름**만 본다. 그래서 `lib/keys/view.ts` → `lib/adapters/shared` → `json-style`처럼
 * **리포 안 모듈만으로 이어진 서버 그래프**는 패키지가 하나도 안 나와 green이었다 — 금지 목록 방식이라 재발을 못 본 것과
 * 같은 형이다. 여기서 뒤집는다: 닿는 파일 집합 자체를 고정한다. 클라이언트가 새 `lib/**` 모듈을 값으로 읽으면 red이고,
 * 그 모듈이 **잎인지 확인한 뒤** 이 목록에 한 줄을 더하는 것이 그 결정이다(`lib/i18n`·`lib/keys/filters` 잎 검사와 같은 형).
 */
const CLIENT_LIB_FILES = [
  "lib/account/plan.ts",
  "lib/auth/member-identity.ts",
  "lib/auth/membership.ts",
  "lib/auth/message.ts",
  "lib/auth/permission.ts",
  "lib/compare.ts",
  // Logs의 필터 바가 값으로 읽는 잎 둘 — 조회(`lib/events/query.ts`)는 이 그래프에 없다.
  "lib/events/filter.ts",
  "lib/events/payload.ts",
  // Settings recovery now owns its card notice; this leaf only assembles public URLs.
  "lib/github-connect/installation-url.ts",
  "lib/github-connect/message.ts",
  "lib/i18n/adapter-errors.ts",
  "lib/i18n/index.ts",
  "lib/import/confirm.ts",
  "lib/import/refusal.ts",
  "lib/import/result.ts",
  "lib/keys/edit-command.ts",
  "lib/keys/filters.ts",
  "lib/keys/flag.ts",
  "lib/keys/refocus.ts",
  "lib/login-link/message.ts",
  "lib/login-link/policy.ts",
  "lib/onboarding/base-pending.ts",
  "lib/onboarding/branch.ts",
  "lib/onboarding/create-plan.ts",
  "lib/onboarding/key-gap.ts",
  "lib/onboarding/language-name.ts",
  "lib/onboarding/locale-picker.ts",
  "lib/onboarding/message.ts",
  "lib/onboarding/next-enabled.ts",
  "lib/onboarding/select-surfaces.ts",
  "lib/onboarding/slug.ts",
  "lib/projects/import-failure.ts",
  // Settings share these pure status/name/selection planners; no server dependencies.
  "lib/projects/plan.ts",
  "lib/import/surface-status.ts",
  "lib/onboarding/readiness.ts",
  "lib/surfaces/plan-add.ts",
  "lib/projects/pr-url.ts",
  "lib/publish/plan.ts",
  "lib/publish/warnings.ts",
  "lib/publish/words.ts",
  "lib/pull/branch-name.ts",
  "lib/pull/ref-slug.ts",
  "lib/relative-time.ts",
  "lib/routes.ts",
  "lib/session-revocation/message.ts",
  "lib/settings/message.ts",
  "lib/shell/nav.ts",
  "lib/shell/panel-size.ts",
  "lib/signin/dot-field.ts",
  "lib/sources/actions.ts",
  "lib/sources/base-language.ts",
  "lib/surfaces/plan.ts",
  "lib/tone.ts",
  // translation-rework 작업 화면의 잎 여섯 — 전부 import가 서로와 `lib/routes.ts`뿐이다(`lib/translations/context.ts`는 서버 전용이라 없다).
  "lib/translations/draft.ts",
  "lib/translations/layout.ts",
  "lib/translations/navigation.ts",
  "lib/translations/query.ts",
  "lib/translations/saved-rows.ts",
  "lib/translations/summary.ts",
  "lib/upload/image.ts",
  "lib/upload/message.ts",
  "lib/utc-time.ts",
  "lib/utils.ts",
];

const SKIP_DIR = new Set(["ui", "__tests__", "node_modules", "generated"]);

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

/** `import type { … }`·`import { type A }`·`export type { … }`처럼 런타임에 남지 않는 절인가. */
function typeOnly(clause: string): boolean {
  if (/^\s*type\s/.test(clause)) return true;
  const braces = /\{([\s\S]*)\}/.exec(clause);
  if (braces === null || /^\s*$/.test(braces[1] ?? "")) return false;
  const named = (braces[1] ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "");
  const hasValue = named.some((s) => !s.startsWith("type "));
  const hasDefaultOrNamespace = /^[^{]*[A-Za-z_$]/.test(clause.split("{")[0] ?? "");
  return !hasValue && !hasDefaultOrNamespace;
}

/**
 * 그 파일에서 **런타임에 실제로 이어지는** 모듈 지정자 전부. 입구가 셋이라 셋을 다 본다:
 *
 * 1. `import … from "x"` — 기본형
 * 2. `import "x"` — **부수효과 전용.** `from`이 없어 1번 정규식에 안 걸린다. 이 리포에서
 *    `server-only`를 쓰는 **유일한 형태**라(`lib/db.ts`·`lib/auth/session.ts`), 못 보면 그 경계가
 *    원리적으로 검사되지 않는다 (2026-09-07 리뷰 🟡5).
 * 3. `export … from "y"` — **재수출도 값이 흐르는 길이다.** 배럴이 무거운 모듈을 재수출하면
 *    그 무게가 따라온다 — 7.2MB 사고가 트리 셰이킹에 기대면 안 된다는 것을 이미 보였다.
 */
function valueImports(source: string): string[] {
  const specifiers: string[] = [];
  for (const m of source.matchAll(/^\s*import\s+([\s\S]*?)from\s*["']([^"']+)["']/gm)) {
    if (!typeOnly(m[1] ?? "")) specifiers.push(m[2] ?? "");
  }
  for (const m of source.matchAll(/^\s*import\s*["']([^"']+)["']\s*;?\s*$/gm)) {
    specifiers.push(m[1] ?? "");
  }
  for (const m of source.matchAll(/^\s*export\s+((?:\*|\{[\s\S]*?\})\s*)from\s*["']([^"']+)["']/gm)) {
    if (!typeOnly(m[1] ?? "")) specifiers.push(m[2] ?? "");
  }
  return specifiers;
}

/** `@/lib/x` · `./y` → 실제 파일 경로. 패키지는 그대로 돌려준다(그 이름으로 판정한다). */
function resolveModule(from: string, specifier: string): string | null {
  if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return null;
  const base = specifier.startsWith("@/")
    ? join(ROOT, specifier.slice(2))
    : join(from, "..", specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // 다음 후보를 본다 — 없는 경로는 정상이다.
    }
  }
  return null;
}

/** 클라이언트 진입점에서 도달하는 파일 전부 + 마주친 패키지 이름. */
function walk(entries: string[]): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, "utf8");
    /**
     * ⚠️ **`"use server"` 파일에서 멈춘다.** Next는 Server Action 모듈을 클라이언트 참조 스텁으로
     * 대체하므로 그 안쪽(prisma·octokit)은 번들에 들어오지 않는다 — 따라 들어가면 방어선이 항상
     * red가 되어 통째로 버려진다.
     */
    if (/^["']use server["']/.test(source.trimStart())) continue;
    for (const specifier of valueImports(source)) {
      const resolved = resolveModule(file, specifier);
      if (resolved === null) packages.add(specifier);
      else queue.push(resolved);
    }
  }
  return { files, packages };
}

const CLIENT_ENTRIES = [...sourceFiles(join(ROOT, "components")), ...sourceFiles(join(ROOT, "app"))].filter(
  (file) => /^["']use client["']/.test(readFileSync(file, "utf8").trimStart()),
);

describe("클라이언트 그래프", () => {
  it("`use client` 진입점을 실제로 찾았다 — 스캐너가 조용히 0건이 되지 않는다", () => {
    expect(CLIENT_ENTRIES.length).toBeGreaterThan(3);
  });

  it("`use server` 진입점 안쪽을 세지 않는다 — Action은 스텁으로 대체된다", () => {
    const actions = join(ROOT, "app/(edit)/projects/actions.ts");
    // 그 파일은 prisma·octokit을 문다. 클라이언트 컴포넌트가 그것을 import해도 번들에 오지 않는다.
    expect(walk([actions]).packages.size).toBe(0);
  });

  it("타입 전용 import는 그래프에 넣지 않는다 — 그것까지 세면 방어선이 항상 red다", () => {
    expect(valueImports('import type { A } from "x";')).toEqual([]);
    expect(valueImports('import { type A, type B } from "x";')).toEqual([]);
    expect(valueImports('import { a } from "x";')).toEqual(["x"]);
    expect(valueImports('import { type A, b } from "x";')).toEqual(["x"]);
    expect(valueImports('import x from "x";')).toEqual(["x"]);
    expect(valueImports('export type { A } from "x";')).toEqual([]);
  });

  /**
   * ⚠️ **입구를 하나씩 먹여 스캐너가 각각을 집는지 센다** (POSTMORTEM 2026-09-07 세 번째 항목의 관용구).
   * 이게 없으면 정규식이 좁아져도 통과가 보고되고, **좁은 검사는 자기 좁음을 신고할 수 없다.**
   */
  it("세 입구를 다 잡는다 — from 있는 import · 부수효과 import · 재수출", () => {
    // 이 리포가 `server-only`를 쓰는 유일한 형태다. 전 정규식은 이것을 통째로 못 봤다.
    expect(valueImports('import "server-only";')).toEqual(["server-only"]);
    expect(valueImports("import 'node:fs';")).toEqual(["node:fs"]);
    // 재수출: `lib/pull/trigger.ts`가 `./ref-slug`를 이 형태로 내보낸다.
    expect(valueImports('export { REF_SAFE_SLUG, isRefSafeSlug } from "./ref-slug";')).toEqual(["./ref-slug"]);
    expect(valueImports('export * from "ts-morph";')).toEqual(["ts-morph"]);
  });

  it("허용 판정이 실제로 가른다 — 목록 밖은 전부 걸린다", () => {
    for (const ok of ["react", "next/link", "next/navigation", "clsx", "tailwind-merge"]) {
      expect(allowed(ok), ok).toBe(true);
    }
    for (const bad of KNOWN_OFFENDERS) expect(allowed(bad), bad).toBe(false);
    // 목록에 없는 **아무** 패키지도 통과하지 못한다 — 그게 금지 목록과의 차이다.
    for (const bad of ["@tanstack/react-virtual", "lodash", "date-fns"]) expect(allowed(bad), bad).toBe(false);
  });

  /**
   * ⚠️ **의도된 확장이 실제로 필요한지, 그리고 그 셋만인지 센다.** 목록을 넓히는 것은 결정이므로
   * 그 결정이 지워졌을 때(누가 셋 중 하나를 지웠을 때) 검사가 조용해지면 안 된다.
   */
  it("의도적으로 허용된 다섯 — 하나씩 빼면 걸린다", () => {
    for (const pkg of ["radix-ui", "class-variance-authority", "lucide-react", "sonner", "react-resizable-panels"]) {
      expect(allowed(pkg), pkg).toBe(true);
      expect(allowed(pkg, ALLOWED.filter((ok) => ok !== pkg)), pkg).toBe(false);
    }
  });

  /**
   * ⚠️ **사전은 잎이어야 한다** (ARCHITECTURE §0). 클라이언트 컴포넌트가 `@/lib/i18n`을
   * 읽으므로 그 그래프가 곧 번들이다 — 사전이 `@/lib/**`를 하나라도 물면 7.2MB 사고의 재현이다.
   * 실 소비자는 T6부터 생기고, **그 전까지 이 검사가 공허하지 않도록** 여기서 직접 건다.
   */
  it("`@/lib/i18n`은 잎이다 — 사전 말고 아무것도 물지 않는다", () => {
    const { files, packages } = walk([join(ROOT, "lib/i18n/index.ts")]);
    expect([...packages].filter((name) => !allowed(name))).toEqual([]);
    expect([...files].map((file) => file.slice(ROOT.length)).sort()).toEqual([
      "lib/i18n/index.ts",
      "messages/en.tsx",
    ]);
  });

  /**
   * ⚠️ **`lib/keys/filters.ts`·`lib/keys/flag.ts`도 잎이어야 한다** (ARCHITECTURE §0). 칩 행과
   * 로케일 배지가 그것을 값으로 읽는데, 이웃한 `lib/keys/view.ts`는 잎이 아니다
   * (`compareKeys` → `lib/adapters/shared` → `json-style`).
   *
   * ⚠️ **위 패키지 검사로는 못 잡는다** — `view.ts`가 무는 것이 전부 리포 안 모듈이라 npm 패키지가
   * 하나도 안 나오고, 그래서 클라이언트가 그것을 값으로 읽어도 **green이다**. 그래서 `lib/i18n`과
   * 같은 형으로 **파일 목록을 정확 일치**로 고정한다.
   */
  it("칩·국기 판정은 잎이다 — `lib/keys/view.ts`를 물지 않는다", () => {
    const chips = walk([join(ROOT, "lib/keys/filters.ts")]);
    expect([...chips.files].map((file) => file.slice(ROOT.length)).sort()).toEqual([
      "lib/keys/filters.ts",
      "lib/routes.ts",
    ]);

    const flag = walk([join(ROOT, "lib/keys/flag.ts")]);
    expect([...flag.files].map((file) => file.slice(ROOT.length)).sort()).toEqual(["lib/keys/flag.ts"]);
  });

  it("새 표면 선택 모듈을 소비자 연결 전에도 직접 검사한다", () => {
    const entry = join(ROOT, "lib/onboarding/select-surfaces.ts");
    const { files, packages } = walk([entry]);
    expect(files.has(entry)).toBe(true);
    expect([...packages].filter(name => !allowed(name))).toEqual([]);
    expect([...files].some(file => file.includes("/adapters/") || file.includes("/push/"))).toBe(false);
  });

  /**
   * ⚠️ **보호 판정은 화면이 값으로 읽고, 지문은 서버만 계산한다** (sync-edit-protection — DIRECTORY의 `lib/protection/`). 두 모듈이
   * 같은 디렉터리라 `plan.ts`가 `./fingerprint`를 한 줄만 물어도 `node:crypto`가 번들로 온다 — 소비자
   * 연결(T13) 전에도 검사가 공허하지 않도록 여기서 직접 걸고, **음성 대조로 fingerprint 쪽은 실제로 걸리는지** 센다.
   */
  it("`lib/protection/plan.ts`는 잎이다 — `fingerprint.ts`(crypto)를 물지 않는다", () => {
    const plan = walk([join(ROOT, "lib/protection/plan.ts")]);
    expect([...plan.files].map((file) => file.slice(ROOT.length)).sort()).toEqual(["lib/protection/plan.ts"]);
    expect([...plan.packages].filter((name) => !allowed(name))).toEqual([]);

    const fingerprint = walk([join(ROOT, "lib/protection/fingerprint.ts")]);
    expect([...fingerprint.packages].filter((name) => !allowed(name))).not.toEqual([]);
  });

  /**
   * ⚠️ **Logs의 판정 모듈은 잎이어야 한다** (logs-rework design §1 — 조회는 `lib/events/query.ts`가
   * `server-only`로 든다). 소비자(T6 이후)가 붙기 전에도 검사가 공허하지 않도록 여기서 직접 건다 —
   * `lib/protection/plan.ts`와 같은 형이다. 판정이 조회를 물면 그 순간 Prisma가 번들에 들어온다
   * (POSTMORTEM 2026-09-07의 7.2MB 청크).
   */
  it("`lib/events`의 판정 모듈 셋은 잎이다 — 조회를 물지 않는다", () => {
    const view = walk([join(ROOT, "lib/events/view.ts")]);
    expect([...view.files].map((file) => file.slice(ROOT.length)).sort()).toEqual([
      "lib/events/view.ts",
      "lib/i18n/index.ts",
      // 언어 이름은 이미 잎이다(import 0) — 온보딩 ③이 같은 함수를 쓴다.
      "lib/onboarding/language-name.ts",
      "lib/projects/import-failure.ts",
      "messages/en.tsx",
    ]);
    expect([...view.packages].filter((name) => !allowed(name))).toEqual([]);

    const filter = walk([join(ROOT, "lib/events/filter.ts")]);
    expect([...filter.files].map((file) => file.slice(ROOT.length)).sort()).toEqual([
      "lib/events/filter.ts",
      "lib/events/payload.ts",
    ]);
    expect([...filter.packages].filter((name) => !allowed(name))).toEqual([]);

    const search = walk([join(ROOT, "lib/events/search.ts")]);
    expect([...search.files].map((file) => file.slice(ROOT.length)).sort()).toEqual(["lib/events/search.ts"]);
    expect([...search.packages].filter((name) => !allowed(name))).toEqual([]);
  });

  it("클라이언트 그래프가 닿는 `lib/**` 파일이 허용 목록과 정확히 같다", () => {
    const { files } = walk(CLIENT_ENTRIES);
    const reached = [...files].map((file) => file.slice(ROOT.length)).filter((rel) => rel.startsWith("lib/")).sort();
    expect(reached).toEqual([...CLIENT_LIB_FILES].sort());
  });

  // 음성 대조 — 실제로 새어 나갔던 경로(2026-09-09)가 이 목록 밖으로 나가는지 센다. 공허한 목록이 아니다.
  it("`lib/keys/view.ts`의 그래프는 허용 목록 밖으로 나간다 — 그 재발을 이 검사가 잡는다", () => {
    const { files } = walk([join(ROOT, "lib/keys/view.ts")]);
    const outside = [...files].map((file) => file.slice(ROOT.length)).filter((rel) => rel.startsWith("lib/") && !CLIENT_LIB_FILES.includes(rel));
    expect(outside).toContain("lib/keys/view.ts");
    expect(outside.some((rel) => rel.startsWith("lib/adapters/"))).toBe(true);
  });

  it("허용 목록 밖의 패키지가 클라이언트 그래프에 없다", () => {
    const { files, packages } = walk(CLIENT_ENTRIES);
    const offenders = [...packages].filter((name) => !allowed(name));
    expect({ offenders, reached: files.size }).toMatchObject({ offenders: [] });
    // 그래프를 실제로 걸었다 — 0건 통과를 성공으로 읽지 않는다.
    expect(files.size).toBeGreaterThan(10);
    expect(packages.size).toBeGreaterThan(0);
  });
});
