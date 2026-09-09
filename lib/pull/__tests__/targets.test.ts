import { describe, expect, it } from "vitest";

import { selectPullTargets } from "../targets";

/**
 * 야간 cron이 돌 프로젝트 고르기 (design §3.9). **준비 안 된 프로젝트를 돌리면 던진다** —
 * `installationId`가 null이면 `runPull`(`run.ts:78`)이, 포맷 컬럼이 null이면 `formatFromProject`
 * (`plan.ts:78-83`)가 던지고, 그 실패가 매일 밤 로그를 채운다. 그래서 필터가 판정층에 있다.
 *
 * ⚠️ **`lastCommitSha`가 "첫 적재가 끝났다"의 증거다** — `planProjectReadiness`(`lib/onboarding/readiness.ts`)와
 * 같은 두 컬럼을 본다. 그쪽은 화면용 3갈래이고 여기는 순회 대상 필터라 목적이 다르지만, 조건이 갈리면
 * "화면은 준비됐다는데 cron이 안 돈다"가 된다.
 */

const project = (over: Partial<{ slug: string; installationId: string | null; lastCommitSha: string | null }> = {}) => ({
  slug: "acme",
  installationId: "1",
  lastCommitSha: "a".repeat(40),
  ...over,
});

describe("selectPullTargets — 준비된 프로젝트만", () => {
  it("`installationId`와 `lastCommitSha`가 둘 다 있어야 대상이다", () => {
    expect(selectPullTargets([project()], 50).targets).toEqual(["acme"]);
  });

  it("`installationId`가 null이면 뺀다 — `runPull`이 던지는 자리를 미리 막는다", () => {
    expect(selectPullTargets([project({ installationId: null })], 50).targets).toEqual([]);
  });

  it("`lastCommitSha`가 null이면 뺀다 — 첫 적재 전이라 포맷 컬럼도 비어 있다", () => {
    expect(selectPullTargets([project({ lastCommitSha: null })], 50).targets).toEqual([]);
  });

  it("`skillflo-web` 모양(설치 없음 + 더미 SHA)은 **의도적으로** 빠진다 (spec §5)", () => {
    const rows = [
      project({ slug: "skillflo-web", installationId: null, lastCommitSha: "deadbeef" }),
      project({ slug: "order-check" }),
    ];
    expect(selectPullTargets(rows, 50).targets).toEqual(["order-check"]);
  });

  it("빈 목록은 빈 배열이다 — 대상 0개가 오류가 아니다", () => {
    expect(selectPullTargets([], 50).targets).toEqual([]);
  });
});

describe("selectPullTargets — 순서가 결정적이다", () => {
  it("`slug` 오름차순이다 — 실패 지점을 재현하려면 순서가 고정돼야 한다", () => {
    const rows = [project({ slug: "zulu" }), project({ slug: "alpha" }), project({ slug: "mike" })];
    expect(selectPullTargets(rows, 50).targets).toEqual(["alpha", "mike", "zulu"]);
  });

  it("입력 순서를 바꿔도 결과가 같다", () => {
    const rows = [project({ slug: "b" }), project({ slug: "a" }), project({ slug: "c" })];
    expect(selectPullTargets(rows, 50)).toEqual(selectPullTargets(rows.slice().reverse(), 50));
  });

  it("정렬은 코드 유닛 비교다 — `localeCompare`는 로케일에 따라 순서가 흔들린다", () => {
    expect(selectPullTargets([project({ slug: "B" }), project({ slug: "a" })], 50).targets).toEqual(["B", "a"]);
  });

  it("입력 배열을 제자리에서 바꾸지 않는다", () => {
    const rows = [project({ slug: "b" }), project({ slug: "a" })];
    selectPullTargets(rows, 50);
    expect(rows.map((r) => r.slug)).toEqual(["b", "a"]);
  });
});

/**
 * **상한 없는 직렬 순회는 조용히 잘린다** (sec-audit 발견 26).
 *
 * cron은 준비된 전 프로젝트를 `for` 루프로 돈다. 프로젝트가 늘면 `maxDuration = 60`에서 **slug
 * 정렬 뒤쪽이 통째로 안 돌고**, 응답은 항상 200 배열이라 cron 실행은 성공으로 표시된다 — 요약에도
 * "못 돈 것"이 없어 **관측값이 정상과 같다**(POSTMORTEM 2026-09-06의 형태).
 *
 * ⚠️ **상한이 문제를 없애지 않는다 — 시끄럽게 만든다.** 잘린 수를 세어 응답과 로그에 실으면,
 * 프로젝트가 그만큼 늘었을 때 cron 분할을 볼 시점이 관측된다.
 */
describe("selectPullTargets — 순회 상한 (sec-audit 26)", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => project({ slug: `p${String(i).padStart(3, "0")}` }));

  it("상한 안이면 전부 돌고 미처리가 0이다", () => {
    expect(selectPullTargets(many(3), 50)).toEqual({
      targets: ["p000", "p001", "p002"],
      unprocessed: 0,
    });
  });

  it("상한을 넘으면 앞에서 자르고 남은 수를 센다", () => {
    const out = selectPullTargets(many(53), 50);
    expect(out.targets).toHaveLength(50);
    expect(out.unprocessed).toBe(3);
    // 자르는 위치도 결정적이다 — 정렬 뒤에 자른다(매일 밤 같은 앞부분이 돈다는 뜻이기도 하다)
    expect(out.targets[0]).toBe("p000");
    expect(out.targets[49]).toBe("p049");
  });

  it("준비 안 된 프로젝트는 상한을 안 먹는다 — 필터가 자르기보다 앞이다", () => {
    const rows = [...many(2), project({ slug: "zzz", installationId: null })];
    expect(selectPullTargets(rows, 2)).toEqual({ targets: ["p000", "p001"], unprocessed: 0 });
  });
});
