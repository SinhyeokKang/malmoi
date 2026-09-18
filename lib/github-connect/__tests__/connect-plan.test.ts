import { describe, expect, it } from "vitest";

import { planRepoConnect } from "../connect-plan";
import type { ProbeResult } from "../health";

/**
 * ARCHITECTURE §6의 **3중 검증이 값으로 판정되는 자리**. 5단계 프로젝트 생성 경로가
 * 이 함수를 그대로 재사용하므로, 여기가 닫히면 §5.7의 공격 시나리오 둘이 함께 닫힌다.
 *
 * ```
 * User에 GitHub Account가 연결됨            ← 껍데기가 먼저 본다 (not-connected)
 *   AND 로그인 사용자가 그 installation에 접근 가능   ← installation-forbidden
 *   AND installation이 선택한 repository에 접근 가능  ← repo-forbidden
 * ```
 *
 * ⚠️ **`installationId`는 클라이언트에서 오지 않는다.** `probe`가 App JWT 조회 결과이고, 사용자 쪽
 * 두 목록은 **제출 시점에 다시 부른 것**이다 — 렌더 때 본 목록을 폼에 실어 믿으면 클라이언트가
 * 보낸 값을 인가 근거로 쓰는 것이 된다 (ARCHITECTURE §6.00 ③).
 *
 * ⚠️ **조회 실패를 거부로 접지 않는다.** `probe`가 `error`면 `unavailable`이다 — 장애를 "권한 없음"으로
 * 말하면 사용자가 있는 권한을 없다고 믿는다 (POSTMORTEM 2026-09-03).
 */

const installed: ProbeResult = { status: "ok", installationId: "158107153", repositoryId: "1035512", fullName: "acme/web", defaultBranch: "main" };

function plan(over: Partial<Parameters<typeof planRepoConnect>[0]> = {}) {
  return planRepoConnect({
    probe: installed,
    userInstallationIds: ["158107153"],
    userRepoFullNames: ["acme/web"],
    ...over,
  });
}

describe("planRepoConnect — probe가 먼저다", () => {
  it("App이 그 리포에 설치돼 있지 않으면 repo-not-installed다", () => {
    expect(plan({ probe: { status: "not-installed" } })).toEqual({ status: "repo-not-installed" });
  });

  it("probe가 error면 unavailable이다 — 거부가 아니다", () => {
    expect(plan({ probe: { status: "error" } })).toEqual({ status: "unavailable" });
  });

  it("probe 실패가 사용자 목록 검사보다 앞이다 — 목록이 비어 있어도 사유는 probe 쪽이다", () => {
    expect(
      plan({ probe: { status: "not-installed" }, userInstallationIds: [], userRepoFullNames: [] }),
    ).toEqual({ status: "repo-not-installed" });
  });
});

describe("planRepoConnect — 사용자 ↔ 설치 (ARCHITECTURE §6 둘째 조건)", () => {
  it("그 설치가 사용자 목록에 없으면 installation-forbidden이다", () => {
    expect(plan({ userInstallationIds: ["99"] })).toEqual({ status: "installation-forbidden" });
  });

  it("설치 목록이 비어 있으면 installation-forbidden이다 — fail-closed", () => {
    expect(plan({ userInstallationIds: [] })).toEqual({ status: "installation-forbidden" });
  });

  it("설치 검사가 리포 검사보다 앞이다 — 볼 수 없는 설치의 리포 목록을 근거로 쓰지 않는다", () => {
    expect(plan({ userInstallationIds: ["99"], userRepoFullNames: [] })).toEqual({
      status: "installation-forbidden",
    });
  });
});

describe("planRepoConnect — 설치 ↔ 리포 (ARCHITECTURE §6 셋째 조건)", () => {
  it("그 리포가 사용자 리포 목록에 없으면 repo-forbidden이다", () => {
    expect(plan({ userRepoFullNames: ["acme/other"] })).toEqual({ status: "repo-forbidden" });
  });

  it("리포 목록이 비어 있으면 repo-forbidden이다 — fail-closed", () => {
    expect(plan({ userRepoFullNames: [] })).toEqual({ status: "repo-forbidden" });
  });

  it("대소문자만 다른 이름을 거짓 거부하지 않는다 — 정당한 재연결이 막히면 안 된다", () => {
    expect(plan({ userRepoFullNames: ["Acme/Web"] })).toEqual({
      status: "ok",
      installationId: "158107153",
      repoOwner: "acme",
      repoName: "web",
    });
  });
});

describe("planRepoConnect — 통과", () => {
  it("셋 다 통과하면 ok이고 **probe가 준** 설치 id와 리포 이름을 낸다", () => {
    expect(plan()).toEqual({
      status: "ok",
      installationId: "158107153",
      repoOwner: "acme",
      repoName: "web",
    });
  });

  it("리네임된 리포면 ok의 owner/name이 **새 이름**이다 — 재연결이 이름을 갱신하는 유일한 경로다", () => {
    expect(
      plan({
        probe: { ...installed, fullName: "newco/website" },
        userRepoFullNames: ["newco/website"],
      }),
    ).toEqual({
      status: "ok",
      installationId: "158107153",
      repoOwner: "newco",
      repoName: "website",
    });
  });

  it("설치 id가 여러 개인 목록에서도 probe가 준 것 하나만 본다", () => {
    expect(plan({ userInstallationIds: ["1", "158107153", "2"] })).toEqual({
      status: "ok",
      installationId: "158107153",
      repoOwner: "acme",
      repoName: "web",
    });
  });
});

describe("planRepoConnect — 모양이 이상한 full_name", () => {
  it("`owner/name` 모양이 아니면 unavailable이다 — 거부로 접지 않는다", () => {
    for (const fullName of ["acme", "acme/web/extra", "/web", "acme/", ""]) {
      expect(
        plan({
          probe: { ...installed, fullName },
          userRepoFullNames: [fullName],
        }),
      ).toEqual({ status: "unavailable" });
    }
  });
});
