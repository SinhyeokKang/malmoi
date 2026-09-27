import { describe, expect, it } from "vitest";

import {
  compareVersion,
  formatVersion,
  latestReleaseTag,
  nextVersion,
  parseVersion,
  planRelease,
  recommendLevel,
  type Semver,
} from "../release";

/**
 * **`/merge` 3단계의 버전 판정** (release-versioning). 태그 필터와 seed·재실행 판정이 산문 명령으로는 조용히 틀린다 —
 * `git describe --tags`가 `malmoi-i18n-push-v1`을 "직전 릴리스"로 준다(실측). 그래서 판정을 여기 두고 `pnpm test`가 본다.
 */

const v = (major: number, minor: number, patch: number): Semver => ({ major, minor, patch });
const c = (subject: string, body = "") => ({ subject, body });

describe("parseVersion · formatVersion", () => {
  it("x.y.z만 받는다", () => {
    expect(parseVersion("1.2.3")).toEqual(v(1, 2, 3));
    expect(parseVersion("0.0.0")).toEqual(v(0, 0, 0));
    expect(parseVersion("10.20.30")).toEqual(v(10, 20, 30));
  });

  it.each(["v1.2.3", "1.2", "01.2.3", "1.02.3", "1.2.3-rc.1", "1.2.3+build", "", " 1.2.3", "1.2.3\n"])(
    "%j → null",
    (s) => {
      expect(parseVersion(s)).toBeNull();
    },
  );

  it.each(["1.2.3", "0.0.0", "10.20.30"])("formatVersion(parseVersion(%j))는 원문이다", (s) => {
    const parsed = parseVersion(s);
    expect(parsed).not.toBeNull();
    expect(formatVersion(parsed!)).toBe(s);
  });
});

describe("compareVersion", () => {
  it("자리별 숫자 비교다 — 사전순이 아니다", () => {
    expect(compareVersion(v(1, 10, 0), v(1, 9, 0))).toBe(1);
    expect(compareVersion(v(1, 2, 3), v(1, 2, 3))).toBe(0);
    expect(compareVersion(v(1, 2, 3), v(2, 0, 0))).toBe(-1);
    expect(compareVersion(v(1, 2, 4), v(1, 2, 3))).toBe(1);
  });
});

describe("latestReleaseTag", () => {
  it("앱 릴리스 꼴(v<x.y.z>)이 아닌 태그는 보지 않는다", () => {
    expect(latestReleaseTag(["malmoi-i18n-push-v1", "l10n-push-v1", "doc-check-wip-20260923", "v1"])).toBeNull();
    expect(latestReleaseTag([])).toBeNull();
    expect(latestReleaseTag(["v1.2.3-rc.1", "1.2.3", "v01.2.3"])).toBeNull();
  });

  it("생성 순·사전순이 아니라 semver 최대다", () => {
    expect(latestReleaseTag(["v1.9.0", "v1.10.0", "v1.2.3"])).toEqual(v(1, 10, 0));
    expect(latestReleaseTag(["malmoi-i18n-push-v1", "v1.0.0"])).toEqual(v(1, 0, 0));
  });
});

describe("recommendLevel", () => {
  it.each([
    [[c("feat!: drop the v1 payload")]],
    [[c("fix(api)!: rename the input")]],
    [[c("chore: bump"), c("refactor: move", "details\n\nBREAKING CHANGE: inputs renamed")]],
  ])("!: 또는 BREAKING CHANGE → major (%#)", (commits) => {
    expect(recommendLevel(commits).level).toBe("major");
  });

  it("feat가 하나라도 있으면 minor", () => {
    expect(recommendLevel([c("docs: x"), c("feat(ui): add a button"), c("fix: y")]).level).toBe("minor");
  });

  it.each([[[c("docs: x")]], [[c("fix: y")]], [[c("Merge branch 'dev'")]], [[]]])(
    "그 밖은 patch — 비-Conventional 제목·빈 목록 포함 (%#)",
    (commits) => {
      expect(recommendLevel(commits).level).toBe("patch");
    },
  );

  it("본문의 BREAKING CHANGE는 줄 머리에서만 센다 — 문장 중간 언급은 아니다", () => {
    expect(recommendLevel([c("docs: note", "we never write BREAKING CHANGE: lightly")]).level).toBe("patch");
  });

  it("feat 제목이 feature·feats 같은 다른 타입과 헷갈리지 않는다", () => {
    expect(recommendLevel([c("feature: x"), c("feats: y")]).level).toBe("patch");
  });

  it("2026-09-27 dev의 157커밋 분포 → minor, 근거는 feat 개수", () => {
    const commits = [
      ...Array.from({ length: 76 }, (_, i) => c(`docs(PRODUCT): d${i}`)),
      ...Array.from({ length: 24 }, (_, i) => c(`fix: f${i}`)),
      ...Array.from({ length: 20 }, (_, i) => c(`feat(publish): n${i}`)),
      ...Array.from({ length: 16 }, (_, i) => c(`test: t${i}`)),
      ...Array.from({ length: 10 }, (_, i) => c(`chore: c${i}`)),
      ...Array.from({ length: 9 }, (_, i) => c(`refactor: r${i}`)),
      c('Revert "feat: something"'),
      c("build: pin"),
    ];
    expect(commits).toHaveLength(157);
    expect(recommendLevel(commits)).toEqual({ level: "minor", reason: "feat 20 → minor" });
  });

  it("reason은 판정 근거의 개수를 싣는다", () => {
    expect(recommendLevel([c("feat!: a"), c("fix!: b")]).reason).toBe("breaking 2 → major");
    expect(recommendLevel([c("fix: a")]).reason).toBe("feat 0 → patch");
  });
});

describe("nextVersion", () => {
  it("올린 자리 아래는 0으로", () => {
    expect(nextVersion(v(1, 2, 3), "patch")).toEqual(v(1, 2, 4));
    expect(nextVersion(v(1, 2, 3), "minor")).toEqual(v(1, 3, 0));
    expect(nextVersion(v(1, 2, 3), "major")).toEqual(v(2, 0, 0));
  });
});

type PlanInput = Parameters<typeof planRelease>[0];
/** 평시엔 dev가 main을 품는다 — `/merge` 10단계(또는 `/sync`)가 매번 그렇게 만든다. */
const plan = (input: Omit<PlanInput, "devContainsMain"> & { devContainsMain?: boolean }) =>
  planRelease({ devContainsMain: true, ...input });

describe("planRelease — design §4 표, 위에서부터 첫 일치", () => {
  const commits = [c("feat: a"), c("docs: b")];
  const COMPARE = "https://github.com/SinhyeokKang/malmoi/compare/";

  it("① main의 버전에 태그가 없으면 unreleased-on-main — 머지할 커밋이 0이어도 이것이 먼저다", () => {
    // 9단계(Release 생성)가 실패한 뒤의 모양: main이 1.0.0, 태그 없음, dev == main.
    expect(plan({ pkgVersion: "1.0.0", mainVersion: "1.0.0", tags: [], commits: [] })).toEqual({
      action: "error",
      error: "unreleased-on-main",
      version: "1.0.0",
      lastTag: null,
      compareBase: null,
    });
    // 태그가 있어도 main이 그보다 앞서 있으면 같다.
    expect(
      plan({ pkgVersion: "1.1.0", mainVersion: "1.1.0", tags: ["v1.0.0"], commits: [] }),
    ).toMatchObject({ action: "error", error: "unreleased-on-main", version: "1.1.0", lastTag: "1.0.0" });
  });

  it("main의 버전에 태그가 있으면 ①을 지나간다", () => {
    expect(
      plan({ pkgVersion: "1.0.0", mainVersion: "1.0.0", tags: ["v1.0.0"], commits: [] }),
    ).toMatchObject({ action: "error", error: "nothing-to-release" });
  });

  it("② 커밋이 없으면 nothing-to-release", () => {
    expect(plan({ pkgVersion: null, mainVersion: null, tags: [], commits: [] })).toEqual({
      action: "error",
      error: "nothing-to-release",
      lastTag: null,
      compareBase: null,
    });
  });

  it("③ dev의 version이 x.y.z가 아니면 invalid-version", () => {
    expect(plan({ pkgVersion: "1.0", mainVersion: null, tags: [], commits })).toMatchObject({
      action: "error",
      error: "invalid-version",
    });
  });

  it("main의 version이 x.y.z가 아니어도 invalid-version — 조용히 ①을 건너뛰지 않는다", () => {
    expect(plan({ pkgVersion: null, mainVersion: "latest", tags: [], commits })).toMatchObject({
      action: "error",
      error: "invalid-version",
    });
  });

  it("④ 태그 없음 + version 없음 → seed: 1.0.0 고정, 질문 없음", () => {
    const seed = plan({
      pkgVersion: null,
      mainVersion: null,
      tags: ["malmoi-i18n-push-v1", "l10n-push-v1"],
      commits,
    });
    expect(seed).toEqual({
      action: "bump",
      seed: true,
      lastTag: null,
      compareBase: null,
      candidates: { patch: "1.0.0", minor: "1.0.0", major: "1.0.0" },
    });
  });

  it("⑤ 태그 없음 + version 있음 → none (seed bump가 이미 dev에 있다)", () => {
    expect(plan({ pkgVersion: "1.0.0", mainVersion: null, tags: [], commits })).toEqual({
      action: "none",
      next: "1.0.0",
      lastTag: null,
      compareBase: null,
    });
  });

  it("⑥ version < 직전 태그 → behind-last-tag", () => {
    expect(
      plan({ pkgVersion: "1.0.0", mainVersion: "1.2.0", tags: ["v1.2.0"], commits }),
    ).toMatchObject({ action: "error", error: "behind-last-tag", lastTag: "1.2.0" });
  });

  it("⑦ version == 직전 태그 → bump, 후보 셋 + 추천", () => {
    expect(plan({ pkgVersion: "1.0.0", mainVersion: "1.0.0", tags: ["v1.0.0"], commits })).toEqual({
      action: "bump",
      seed: false,
      lastTag: "1.0.0",
      compareBase: `${COMPARE}v1.0.0...`,
      candidates: { patch: "1.0.1", minor: "1.1.0", major: "2.0.0" },
      recommended: { level: "minor", reason: "feat 1 → minor" },
    });
  });

  it("⑦ version이 없는데 태그가 있으면 직전 태그에서 올린다", () => {
    expect(
      plan({ pkgVersion: null, mainVersion: null, tags: ["v1.0.0"], commits: [c("fix: a")] }),
    ).toMatchObject({
      action: "bump",
      seed: false,
      candidates: { patch: "1.0.1", minor: "1.1.0", major: "2.0.0" },
      recommended: { level: "patch" },
    });
  });

  it("⑧ version > 직전 태그 → none (재실행 — 두 번 올리지 않는다)", () => {
    expect(plan({ pkgVersion: "1.1.0", mainVersion: "1.0.0", tags: ["v1.0.0"], commits })).toEqual({
      action: "none",
      next: "1.1.0",
      lastTag: "1.0.0",
      compareBase: `${COMPARE}v1.0.0...`,
    });
  });

  it("직전 태그는 semver 최대이고 action 태그는 섞이지 않는다", () => {
    expect(
      plan({
        pkgVersion: "1.10.0",
        mainVersion: "1.10.0",
        tags: ["v1.9.0", "malmoi-i18n-push-v1", "v1.10.0", "v1.2.3"],
        commits,
      }),
    ).toMatchObject({ action: "bump", lastTag: "1.10.0", candidates: { minor: "1.11.0" } });
  });

  it("dev가 main을 품지 않으면 dev-not-synced — 이미 squash된 커밋이 다시 릴리스되지 않는다", () => {
    // 10단계 lease가 거부된 뒤의 모양: main은 v1.0.0으로 태그됐고, dev엔 squash 전 커밋이 그대로다.
    expect(
      plan({ pkgVersion: "1.0.0", mainVersion: "1.0.0", tags: ["v1.0.0"], commits, devContainsMain: false }),
    ).toEqual({ action: "error", error: "dev-not-synced", lastTag: "1.0.0", compareBase: `${COMPARE}v1.0.0...` });
    // 커밋이 0이어도(= 판정 대상이 없어도) 같은 답이다 — 원인이 동기화이기 때문이다.
    expect(
      plan({ pkgVersion: null, mainVersion: null, tags: [], commits: [], devContainsMain: false }),
    ).toMatchObject({ action: "error", error: "dev-not-synced" });
  });

  it("unreleased-on-main이 dev-not-synced보다 앞선다 — 9단계 재실행은 dev와 무관하게 먼저 할 일이다", () => {
    expect(
      plan({ pkgVersion: "1.0.0", mainVersion: "1.0.0", tags: [], commits, devContainsMain: false }),
    ).toMatchObject({ action: "error", error: "unreleased-on-main" });
  });

  it.each([
    ["5.0.0", ["v1.2.0"]],
    ["1.2.2", ["v1.2.0"]],
    ["1.3.1", ["v1.2.0"]],
    ["2.0.1", ["v1.2.0"]],
    ["0.1.0", []],
    ["2.0.0", []],
  ])("손으로 건너뛴 version %s (태그 %j) → unexpected-version", (pkgVersion, tags) => {
    const mainVersion = tags.length > 0 ? "1.2.0" : null;
    expect(plan({ pkgVersion, mainVersion, tags, commits })).toMatchObject({
      action: "error",
      error: "unexpected-version",
    });
  });

  it.each(["1.2.1", "1.3.0", "2.0.0"])("직전 태그 1.2.0의 다음 후보 %s는 none(재실행)", (pkgVersion) => {
    expect(plan({ pkgVersion, mainVersion: "1.2.0", tags: ["v1.2.0"], commits })).toMatchObject({
      action: "none",
      next: pkgVersion,
    });
  });

  it("결정적이다 — 같은 입력 두 번이 같은 판정", () => {
    const input = { pkgVersion: "1.0.0", mainVersion: "1.0.0", tags: ["v1.0.0"], commits };
    expect(plan(input)).toStrictEqual(plan(input));
  });
});
