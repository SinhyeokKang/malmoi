/**
 * **`/merge` 3단계의 버전 판정** (release-versioning). 순수 함수만 둔다 — git 호출은 `scripts/release-plan.ts`가 한다.
 *
 * 판정을 스킬 본문이 아니라 여기 두는 이유는 **태그 필터와 seed·재실행 판정**이다: 산문 명령으로는 조용히 틀린다 —
 * `git describe --tags`가 `malmoi-i18n-push-v1`을 "직전 릴리스"로 준다(실측). 여기 있어야 `pnpm test`가 본다.
 *
 * ⚠️ **설정·옵션을 두지 않는다** — 태그 접두어·레벨 규칙·리포 URL은 상수다. prerelease·빌드 메타데이터는 받지 않는다.
 * ⚠️ `lib/`가 아닌 이유: 앱 런타임이 쓰지 않는 하네스 로직이다(`scripts/format.ts`와 같은 선례).
 */

export type Semver = { major: number; minor: number; patch: number };
export type Level = "major" | "minor" | "patch";
export type Commit = { subject: string; body: string };
export type Recommendation = { level: Level; reason: string };

type Candidates = Record<Level, string>;
type Context = { lastTag: string | null; compareBase: string | null };

export type Plan =
  | ({ action: "bump"; seed: true; candidates: Candidates } & Context)
  | ({ action: "bump"; seed: false; candidates: Candidates; recommended: Recommendation } & Context)
  | ({ action: "none"; next: string } & Context)
  | ({ action: "error"; error: "unreleased-on-main"; version: string } & Context)
  | ({ action: "error"; error: "nothing-to-release" | "invalid-version" | "behind-last-tag" } & Context);

const COMPARE_URL = "https://github.com/SinhyeokKang/malmoi/compare/";
const SEED = "1.0.0";

// 앞자리 0은 semver가 금지한다 — "01.2.3"을 받으면 "1.2.3"과 같은 버전이 두 표기로 선다
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseVersion(s: string): Semver | null {
  const m = VERSION.exec(s);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function formatVersion(v: Semver): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

export function compareVersion(a: Semver, b: Semver): -1 | 0 | 1 {
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  return 0;
}

/** 앱 릴리스 태그(`v<x.y.z>`) 중 semver 최대. action 태그(`malmoi-i18n-push-v1`)·`v1`은 이 꼴이 아니라 빠진다. */
export function latestReleaseTag(tags: string[]): Semver | null {
  let latest: Semver | null = null;
  for (const tag of tags) {
    const v = tag.startsWith("v") ? parseVersion(tag.slice(1)) : null;
    if (v && (latest === null || compareVersion(v, latest) > 0)) latest = v;
  }
  return latest;
}

const CONVENTIONAL = /^([a-z]+)(\([^)]*\))?(!)?:/;
const BREAKING_BODY = /^BREAKING CHANGE:/m;

/** 커밋 타입 규칙의 판정. `/merge` 3단계 질문의 **추천 선택지**일 뿐 — 레벨은 사람이 고른다. */
export function recommendLevel(commits: Commit[]): Recommendation {
  let breaking = 0;
  let feat = 0;
  for (const { subject, body } of commits) {
    const m = CONVENTIONAL.exec(subject);
    if (m?.[3] === "!" || BREAKING_BODY.test(body)) breaking++;
    if (m?.[1] === "feat") feat++;
  }
  if (breaking > 0) return { level: "major", reason: `breaking ${breaking} → major` };
  if (feat > 0) return { level: "minor", reason: `feat ${feat} → minor` };
  return { level: "patch", reason: `feat 0 → patch` };
}

export function nextVersion(v: Semver, level: Level): Semver {
  if (level === "major") return { major: v.major + 1, minor: 0, patch: 0 };
  if (level === "minor") return { major: v.major, minor: v.minor + 1, patch: 0 };
  return { ...v, patch: v.patch + 1 };
}

/**
 * design §4 표를 **위에서부터 첫 일치**로 판정한다. ⚠️ `unreleased-on-main`이 `nothing-to-release`보다 앞선다 —
 * 9단계(Release 생성)가 실패한 뒤엔 머지할 커밋이 0이라, 순서가 반대면 진짜 원인이 가려진다.
 * 후보 셋을 한 번에 내므로 레벨을 고른 뒤 다시 부르지 않는다.
 */
export function planRelease(input: {
  pkgVersion: string | null;
  mainVersion: string | null;
  tags: string[];
  commits: Commit[];
}): Plan {
  const last = latestReleaseTag(input.tags);
  const context: Context = {
    lastTag: last && formatVersion(last),
    compareBase: last && `${COMPARE_URL}v${formatVersion(last)}...`,
  };

  // main의 값이 깨져 있으면 ①을 조용히 건너뛰지 않는다 — 그 판정이 "태그 없는 릴리스"를 잡는 유일한 자리다
  const main = input.mainVersion === null ? null : parseVersion(input.mainVersion);
  if (input.mainVersion !== null && main === null) return { action: "error", error: "invalid-version", ...context };
  if (main && !input.tags.includes(`v${formatVersion(main)}`) && (last === null || compareVersion(main, last) > 0)) {
    return { action: "error", error: "unreleased-on-main", version: formatVersion(main), ...context };
  }

  if (input.commits.length === 0) return { action: "error", error: "nothing-to-release", ...context };

  const pkg = input.pkgVersion === null ? null : parseVersion(input.pkgVersion);
  if (input.pkgVersion !== null && pkg === null) return { action: "error", error: "invalid-version", ...context };

  if (last === null) {
    if (pkg === null) return { action: "bump", seed: true, candidates: { patch: SEED, minor: SEED, major: SEED }, ...context };
    return { action: "none", next: formatVersion(pkg), ...context };
  }

  // version이 없는데 태그가 있으면 직전 태그와 같은 것으로 본다 — 거기서 올린다
  if (pkg !== null) {
    const order = compareVersion(pkg, last);
    if (order < 0) return { action: "error", error: "behind-last-tag", ...context };
    if (order > 0) return { action: "none", next: formatVersion(pkg), ...context };
  }

  return {
    action: "bump",
    seed: false,
    candidates: {
      patch: formatVersion(nextVersion(last, "patch")),
      minor: formatVersion(nextVersion(last, "minor")),
      major: formatVersion(nextVersion(last, "major")),
    },
    recommended: recommendLevel(input.commits),
    ...context,
  };
}
