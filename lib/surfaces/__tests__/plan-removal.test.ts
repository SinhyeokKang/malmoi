import { describe, expect, it } from "vitest";

import { en } from "@/messages/en";

import { planSurfaceRemoval, removalReason, type RemovalInput } from "../plan-removal";

/**
 * 소스 제거 판정 (sources-add-remove design §2·§3.1). 사전 차단(화면)과 서버 거부가 같은 판정을 지난다.
 * 기본 소스 승계 = 남은 활성 중 slug 오름차순 첫째(PRODUCT §7.1).
 */

const BASE: RemovalInput = {
  targetId: "s2",
  active: [{ id: "s1", slug: "web" }, { id: "s2", slug: "app" }, { id: "s3", slug: "admin" }],
  defaultSurfaceId: "s1",
  projectArchived: false,
  importing: false,
};

describe("planSurfaceRemoval", () => {
  it("기본이 아닌 소스는 승계 없이 제거된다", () => {
    expect(planSurfaceRemoval(BASE)).toEqual({ ok: true, nextDefaultId: null });
  });

  it("기본 소스를 빼면 남은 활성 중 slug 오름차순 첫째가 기본이 된다", () => {
    expect(planSurfaceRemoval({ ...BASE, targetId: "s1" })).toEqual({ ok: true, nextDefaultId: "s3" });
    expect(planSurfaceRemoval({ ...BASE, targetId: "s3", defaultSurfaceId: "s3" })).toEqual({ ok: true, nextDefaultId: "s2" });
  });

  it("slug 비교는 코드 단위다 — 로캘 정렬이 아니다", () => {
    const active = [{ id: "a", slug: "b" }, { id: "b", slug: "B" }, { id: "c", slug: "target" }];
    expect(planSurfaceRemoval({ ...BASE, active, targetId: "c", defaultSurfaceId: "c" })).toEqual({ ok: true, nextDefaultId: "b" });
  });

  it("기본 id가 비어 있으면(옛 행) 승계하지 않는다", () => {
    expect(planSurfaceRemoval({ ...BASE, targetId: "s1", defaultSurfaceId: null })).toEqual({ ok: true, nextDefaultId: null });
  });

  it("마지막 남은 활성 소스는 제거할 수 없다", () => {
    expect(planSurfaceRemoval({ ...BASE, active: [{ id: "s2", slug: "app" }], defaultSurfaceId: "s2" })).toEqual({ ok: false, error: "last-source" });
  });

  it("대상이 활성 목록에 없으면 not-found다 — 이미 제거됐거나 다른 프로젝트", () => {
    expect(planSurfaceRemoval({ ...BASE, targetId: "gone" })).toEqual({ ok: false, error: "not-found" });
  });

  it("첫 적재가 진행 중이면 importing이다", () => {
    expect(planSurfaceRemoval({ ...BASE, importing: true })).toEqual({ ok: false, error: "importing" });
  });

  it("프로젝트 보관이 맨 앞이다 — 보관 = Restore만", () => {
    expect(planSurfaceRemoval({ ...BASE, projectArchived: true, importing: true, targetId: "gone" })).toEqual({ ok: false, error: "archived" });
    expect(planSurfaceRemoval({ ...BASE, projectArchived: true, active: [{ id: "s2", slug: "app" }] })).toEqual({ ok: false, error: "archived" });
  });

  it("not-found가 importing·last-source보다 앞이다", () => {
    expect(planSurfaceRemoval({ ...BASE, targetId: "gone", importing: true, active: [{ id: "s1", slug: "web" }] })).toEqual({ ok: false, error: "not-found" });
  });
});

describe("removalReason", () => {
  it("판정 거부 셋은 제 문장, 인가 거부는 errors.access 문장이다 — 사전 차단과 서버 거부가 같은 함수다", () => {
    expect(removalReason(en, "last-source")).toBe(en.sources.removal.reasons["last-source"]);
    expect(removalReason(en, "importing")).toBe(en.sources.removal.reasons.importing);
    expect(removalReason(en, "stale-approval")).toBe(en.sources.removal.reasons["stale-approval"]);
    expect(removalReason(en, "archived")).toBe(en.errors.access.archived);
    expect(removalReason(en, "forbidden")).toBe(en.errors.access.forbidden);
    expect(removalReason(en, "not-found")).toBe(en.errors.access["not-found"]);
  });

  it("판정이 내는 거부는 전부 문장이 있다", () => {
    for (const error of ["last-source", "archived", "importing", "not-found"] as const) expect(removalReason(en, error)).not.toBe("");
  });
});
