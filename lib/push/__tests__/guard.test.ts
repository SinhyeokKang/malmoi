import { describe, expect, it } from "vitest";
import { checkCommitOrder, checkProjectSlug, guardStatus } from "../guard";

const at = (iso: string) => new Date(iso);

describe("checkProjectSlug — 오배송 거부", () => {
  it("페이로드 slug가 운영 대상과 같으면 통과", () => {
    expect(checkProjectSlug("skillflo", "skillflo")).toBe("ok");
  });

  it("다르면 거부한다 — 남의 프로젝트에 적용되면 키가 전부 orphan되고 되돌릴 수 없다", () => {
    expect(checkProjectSlug("bugshot-2", "skillflo")).toBe("wrong-project");
  });

  it("앞뒤 공백은 무시한다 — Actions가 개행을 흘릴 수 있다", () => {
    expect(checkProjectSlug(" skillflo\n", "skillflo")).toBe("ok");
  });

  it("부분 일치는 거부한다", () => {
    expect(checkProjectSlug("skill", "skillflo")).toBe("wrong-project");
    expect(checkProjectSlug("skillflo-2", "skillflo")).toBe("wrong-project");
  });

  it("대소문자가 다르면 거부한다 — slug는 우리가 정한 식별자라 GitHub 핸들과 달리 정확 일치다", () => {
    expect(checkProjectSlug("SkillFlo", "skillflo")).toBe("wrong-project");
  });

  it("⚠️ 양쪽이 다 비어도 통과시키지 않는다 (fail-closed 이중 차단)", () => {
    // lib/auth/allow.ts와 같은 원리 — 빈 값끼리의 일치를 통과로 읽으면
    // 설정 누락이 곧 무제한 라우팅이 된다.
    expect(checkProjectSlug("", "")).toBe("wrong-project");
    expect(checkProjectSlug("   ", "  ")).toBe("wrong-project");
  });

  it("운영 대상이 비어 있으면 어떤 페이로드도 통과하지 못한다", () => {
    expect(checkProjectSlug("skillflo", "")).toBe("wrong-project");
  });

  it("페이로드 slug가 비어 있으면 거부한다", () => {
    expect(checkProjectSlug("", "skillflo")).toBe("wrong-project");
  });
});

describe("checkCommitOrder — 역행 거부", () => {
  const last = at("2026-08-31T10:00:00Z");

  it("더 새로운 커밋은 통과", () => {
    expect(checkCommitOrder(at("2026-08-31T10:00:01Z"), last)).toBe("ok");
  });

  it("**같은 시각은 통과한다** — 같은 커밋 재전송은 strict에서 결과가 같고 정당하다", () => {
    expect(checkCommitOrder(at("2026-08-31T10:00:00Z"), last)).toBe("ok");
  });

  it("과거 커밋은 거부한다 — 오래된 run의 Re-run이 DB를 그 시점으로 되돌린다", () => {
    expect(checkCommitOrder(at("2026-08-31T09:59:59Z"), last)).toBe("stale-commit");
  });

  it("1밀리초 과거도 거부한다 — 판정에 관용 구간을 두지 않는다", () => {
    expect(checkCommitOrder(at("2026-08-31T09:59:59.999Z"), last)).toBe("stale-commit");
  });

  it("첫 push(lastCommitAt이 null)는 통과", () => {
    expect(checkCommitOrder(at("2020-01-01T00:00:00Z"), null)).toBe("ok");
  });

  it("타임존이 달라도 절대 시각으로 비교한다", () => {
    // 2026-08-31T19:00:00+09:00 === 10:00:00Z — 같은 순간이므로 통과.
    expect(checkCommitOrder(at("2026-08-31T19:00:00+09:00"), last)).toBe("ok");
    // 18:59:59+09:00 === 09:59:59Z — 과거다.
    expect(checkCommitOrder(at("2026-08-31T18:59:59+09:00"), last)).toBe("stale-commit");
  });

  it("파싱 불가능한 날짜는 거부한다 — Invalid Date를 통과시키면 비교가 조용히 무너진다", () => {
    expect(checkCommitOrder(new Date("nope"), last)).toBe("stale-commit");
    expect(checkCommitOrder(new Date("nope"), null)).toBe("stale-commit");
  });
});

describe("guardStatus", () => {
  it("거부는 409다 — 페이로드 형식이 아니라 상태 충돌이라 400이 아니다", () => {
    expect(guardStatus("wrong-project")).toBe(409);
    expect(guardStatus("stale-commit")).toBe(409);
  });

  it("통과는 200", () => {
    expect(guardStatus("ok")).toBe(200);
  });
});
