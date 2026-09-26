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
 *   AND 그 사람이 그 repository에 쓸 수 있음         ← repo-read-only (sec-audit-3 1a)
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
    userRepos: [{ fullName: "acme/web", push: true }],
    requirePush: true,
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
      plan({ probe: { status: "not-installed" }, userInstallationIds: [], userRepos: [] }),
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
    expect(plan({ userInstallationIds: ["99"], userRepos: [] })).toEqual({
      status: "installation-forbidden",
    });
  });
});

describe("planRepoConnect — 설치 ↔ 리포 (ARCHITECTURE §6 셋째 조건)", () => {
  it("그 리포가 사용자 리포 목록에 없으면 repo-forbidden이다", () => {
    expect(plan({ userRepos: [{ fullName: "acme/other", push: true }] })).toEqual({ status: "repo-forbidden" });
  });

  it("리포 목록이 비어 있으면 repo-forbidden이다 — fail-closed", () => {
    expect(plan({ userRepos: [] })).toEqual({ status: "repo-forbidden" });
  });

  it("대소문자만 다른 이름을 거짓 거부하지 않는다 — 정당한 재연결이 막히면 안 된다", () => {
    expect(plan({ userRepos: [{ fullName: "Acme/Web", push: true }] })).toEqual({
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
        userRepos: [{ fullName: "newco/website", push: true }],
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
          userRepos: [{ fullName, push: true }],
        }),
      ).toEqual({ status: "unavailable" });
    }
  });
});

/**
 * **토큰을 받는 사람이 리포에 이미 쓸 수 있어야 한다** (sec-audit-3 발견 1a). 생성자는 push 토큰을 받고,
 * 그 토큰이 페이로드로 정한 로케일·경로가 **설치 토큰의 커밋**이 된다 — 읽기 전용 협력자가 만들면 그 사람이
 * 가진 적 없는 쓰기 권한을 빌리는 것이다. 이미 쓸 수 있는 사람이면 sync 브랜치에 무엇이 커밋되든 상승이 아니다.
 *
 * ⚠️ **`permissions`가 응답에 없으면 거부가 아니라 `unavailable`이다** — 모르는 것을 "권한 없음"으로 말하지
 * 않는다 (POSTMORTEM 2026-09-03).
 */
describe("planRepoConnect — 리포 쓰기 권한 (sec-audit-3 1a)", () => {
  it("push가 false면 repo-read-only다", () => {
    expect(plan({ userRepos: [{ fullName: "acme/web", push: false }] })).toEqual({ status: "repo-read-only" });
  });

  it("push를 모르면(null) unavailable이다 — 거부로 접지 않는다", () => {
    expect(plan({ userRepos: [{ fullName: "acme/web", push: null }] })).toEqual({ status: "unavailable" });
  });

  it("push가 true면 ok다", () => {
    expect(plan({ userRepos: [{ fullName: "acme/web", push: true }] })).toMatchObject({ status: "ok" });
  });

  it("권한은 **그 리포 행**의 것만 본다 — 다른 리포의 쓰기 권한이 빌려지지 않는다", () => {
    expect(
      plan({ userRepos: [{ fullName: "acme/other", push: true }, { fullName: "acme/web", push: false }] }),
    ).toEqual({ status: "repo-read-only" });
  });

  it("쓰기를 요구하지 않는 호출(재적재)은 push를 보지 않는다 — false도 null도 ok다", () => {
    for (const push of [false, null]) {
      expect(plan({ requirePush: false, userRepos: [{ fullName: "acme/web", push }] })).toMatchObject({ status: "ok" });
    }
    expect(plan({ requirePush: false, userRepos: [] })).toEqual({ status: "repo-forbidden" });
  });

  it("목록에 없는 리포는 권한 판정 전에 repo-forbidden이다", () => {
    expect(plan({ userRepos: [{ fullName: "acme/other", push: false }] })).toEqual({ status: "repo-forbidden" });
  });
});
