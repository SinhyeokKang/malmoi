import { describe, expect, it } from "vitest";

import {
  connectionEvidence, hasRepoConnection, projectReadTarget, repoConnectionPinned, repoLocatorOf, repoTargetOf, sameAccessedRepository, sameRepoTarget, sameRepository,
  newRepoTarget, type RepoTarget,
} from "../target";

/**
 * 리포 호스트 경계의 입력 (gitlab-repositories design §3 "공통 경계"). 판정은 **저장된 행**만 본다 — 클라이언트 입력이 아니다.
 *
 * ⚠️ **`unpinned`를 `not-connected`로 접지 않는다** (sec-audit-2 #34 · ux-drift-unify D1). 설치가 있고 리포 id만 없는 행은 [Reconnect] 한 번으로
 * 끝나고, 설치가 없는 행은 Connect다 — 한 null로 접으면 설정·Home·번역·MCP의 안내가 한쪽으로 쏠린다.
 */

const row = { repoHost: "github", repoOwner: "acme", repoName: "web", installationId: "158107153", repositoryId: "1035512", gitlabConnectionId: null };
const target: RepoTarget = { host: "github", owner: "acme", name: "web", installationId: "158107153", repositoryId: "1035512" };

describe("repoTargetOf — 저장된 연결 증거 → 경계 입력", () => {
  it("설치와 리포 id가 있으면 ok — owner/name은 저장된 주소 그대로다", () => {
    expect(repoTargetOf(row)).toEqual({ status: "ok", target });
  });

  it("설치가 없으면 not-connected — 리포 id 유무와 무관하다", () => {
    expect(repoTargetOf({ ...row, installationId: null })).toEqual({ status: "not-connected" });
    expect(repoTargetOf({ ...row, installationId: null, repositoryId: null })).toEqual({ status: "not-connected" });
  });

  it("⚠️ 설치는 있고 리포 id가 없으면 unpinned다 — not-connected로 접히지 않는다", () => {
    expect(repoTargetOf({ ...row, repositoryId: null })).toEqual({ status: "unpinned" });
  });

  it("판정이 `storedConnection`과 같다(GitHub) — 연결 화면의 첫 렌더와 I/O 경계가 한 판정이다", async () => {
    const { storedConnection } = await import("@/lib/github-connect/health");
    for (const columns of [row, { ...row, installationId: null }, { ...row, repositoryId: null }, { ...row, installationId: null, repositoryId: null }]) {
      const result = repoTargetOf(columns);
      expect(result.status === "ok" ? null : { status: result.status }).toEqual(storedConnection(columns));
    }
  });
});

describe("sameRepoTarget — 잠금 안 재검증(재연결 감지)", () => {
  it("호스트·리포 id·연결 증거가 같으면 같다", () => {
    expect(sameRepoTarget(target, { ...target })).toBe(true);
  });

  it("⚠️ 연결 증거가 다르면 다르다 — 같은 리포라도 재설치는 재연결이다", () => {
    expect(sameRepoTarget(target, { ...target, installationId: "999" })).toBe(false);
  });

  it("리포 id가 다르면 다르다 — 같은 이름의 다른 리포", () => {
    expect(sameRepoTarget(target, { ...target, repositoryId: "1035513" })).toBe(false);
  });

  it("주소(owner/name)는 보지 않는다 — 리네임은 이 판정이 아니라 호출부의 주소 대조가 가른다", () => {
    expect(sameRepoTarget(target, { ...target, owner: "acme-renamed", name: "site" })).toBe(true);
  });
});

describe("sameRepository — 호출자 접근 결과 대 프로젝트(호스트 + 리포 id)", () => {
  it("연결이 달라도 같은 리포면 같다 — 호출자 연결 ≠ 프로젝트 참조 연결이 정상인 호스트가 있다", () => {
    expect(sameRepository({ host: "github", repositoryId: "1035512" }, target)).toBe(true);
  });

  it("리포 id가 다르면 다르다", () => {
    expect(sameRepository({ host: "github", repositoryId: "1" }, target)).toBe(false);
  });
});

describe("sameAccessedRepository — 온보딩 재대조(D16)", () => {
  const access = { host: "github", repositoryId: "1035512", installationId: "158107153", repoOwner: "acme", repoName: "web" } as const;

  it("같은 리포·같은 설치면 같다", () => {
    expect(sameAccessedRepository(access, target)).toBe(true);
  });

  it("⚠️ GitHub은 설치 id까지 같아야 한다 — App 재설치 뒤 옛 설치로 읽으러 가지 않고 repo-replaced·repo-forbidden으로 멈춘다", () => {
    expect(sameAccessedRepository({ ...access, installationId: "999" }, target)).toBe(false);
  });

  it("리포 id가 다르면 다르다", () => {
    expect(sameAccessedRepository({ ...access, repositoryId: "1" }, target)).toBe(false);
  });
});

// ── GitLab (gitlab-repositories B) ──────────────────────────────────────────

const gitlabRow = { repoHost: "gitlab", repoOwner: "group/sub", repoName: "app", installationId: null, repositoryId: "1035512", gitlabConnectionId: "conn-a" };
const gitlabTarget: RepoTarget = { host: "gitlab", owner: "group/sub", name: "app", repositoryId: "1035512", connectionId: "conn-a" };

describe("repoTargetOf — GitLab", () => {
  it("연결 참조와 리포 id가 있으면 ok — owner는 하위 그룹을 포함한 namespace 전체다", () => {
    expect(repoTargetOf(gitlabRow)).toEqual({ status: "ok", target: gitlabTarget });
  });

  it("⚠️ 연결 참조가 비면 connection-removed다(D21) — 연결자가 떠났거나 해제했다. 설치 없음(not-connected)·unpinned로 접지 않는다", () => {
    expect(repoTargetOf({ ...gitlabRow, gitlabConnectionId: null })).toEqual({ status: "connection-removed" });
    // 리포 id 없는 GitLab 행은 손상이다 — 이름으로 부르지 않으므로 연결 없음.
    expect(repoTargetOf({ ...gitlabRow, repositoryId: null })).toEqual({ status: "not-connected" });
  });

  it("⚠️ GitLab 행에 설치 id가 있어도 GitHub으로 읽지 않는다 — 호스트 열이 판정한다", () => {
    expect(repoTargetOf({ ...gitlabRow, installationId: "158107153" })).toEqual({ status: "ok", target: gitlabTarget });
    expect(repoTargetOf({ ...row, gitlabConnectionId: "conn-a" })).toEqual({ status: "ok", target });
  });

  it("모르는 호스트 값은 연결 없음이다 — fail-closed", () => {
    expect(repoTargetOf({ ...row, repoHost: "bitbucket" })).toEqual({ status: "not-connected" });
    expect(hasRepoConnection({ ...row, repoHost: "bitbucket" })).toBe(false);
    expect(repoConnectionPinned({ ...row, repoHost: "bitbucket" })).toBe(false);
  });
});

describe("hasRepoConnection · repoConnectionPinned — readiness와 [Reconnect]의 두 축", () => {
  it("readiness: GitHub은 설치 id, GitLab은 고정 리포다 — 참조가 빈 GitLab도 setup이 아니다", () => {
    expect(hasRepoConnection(row)).toBe(true);
    expect(hasRepoConnection({ ...row, installationId: null })).toBe(false);
    expect(hasRepoConnection(gitlabRow)).toBe(true);
    const leftBehind = { ...gitlabRow, gitlabConnectionId: null };
    expect(hasRepoConnection(leftBehind)).toBe(true);
    expect(repoConnectionPinned(leftBehind)).toBe(false);
    expect(hasRepoConnection({ ...gitlabRow, repositoryId: null })).toBe(false);
  });

  it("⚠️ 지금 쓸 수 있는가는 repoTargetOf의 ok와 같다 — 참조가 빈 GitLab·리포 id 없는 GitHub은 [Reconnect]다", () => {
    for (const repoHost of ["github", "gitlab", "bitbucket"])
      for (const installationId of ["1", null])
        for (const repositoryId of ["2", null])
          for (const gitlabConnectionId of ["c", null]) {
            const columns = { repoHost, repoOwner: "acme", repoName: "web", installationId, repositoryId, gitlabConnectionId };
            expect(repoConnectionPinned(columns), JSON.stringify(columns)).toBe(repoTargetOf(columns).status === "ok");
          }
  });
});

describe("repoLocatorOf — 권한 확인 대상", () => {
  it("GitHub은 주소, GitLab은 숫자 id 하나다 — GitLab을 이름으로 찾지 않는다", () => {
    expect(repoLocatorOf(row)).toEqual({ host: "github", owner: "acme", name: "web" });
    expect(repoLocatorOf(gitlabRow)).toEqual({ host: "gitlab", repositoryId: "1035512" });
  });

  it("리포 id 없는 GitLab 행은 불변식 위반이다 — 이름으로 대신 찾지 않고 던진다", () => {
    expect(() => repoLocatorOf({ ...gitlabRow, repositoryId: null })).toThrow();
  });
});

describe("다른 리포 호스트의 같은 id", () => {
  it("⚠️ 같은 숫자 id라도 호스트가 다르면 다른 리포다 — sameRepository·sameRepoTarget·sameAccessedRepository 셋 다", () => {
    expect(target.repositoryId).toBe(gitlabTarget.repositoryId);
    expect(sameRepository(target, gitlabTarget)).toBe(false);
    expect(sameRepoTarget(target, gitlabTarget)).toBe(false);
    expect(sameRepoTarget(gitlabTarget, target)).toBe(false);
    expect(sameAccessedRepository({ host: "gitlab", repositoryId: "1035512", connectionId: "conn-a", repoOwner: "group/sub", repoName: "app" }, target)).toBe(false);
    expect(sameAccessedRepository({ host: "github", repositoryId: "1035512", installationId: "158107153", repoOwner: "acme", repoName: "web" }, gitlabTarget)).toBe(false);
  });

  it("연결 증거도 호스트 접두로 갈린다 — 샘플 확인값이 다른 호스트로 새지 않는다", () => {
    expect(connectionEvidence(target)).toBe("github:158107153");
    expect(connectionEvidence({ ...gitlabTarget, connectionId: "158107153" })).toBe("gitlab:158107153");
  });
});

describe("GitLab 연결 비교 — 사람 단위 연결", () => {
  const callerAccess = { host: "gitlab", repositoryId: "1035512", connectionId: "conn-b", repoOwner: "group/sub", repoName: "app" } as const;

  it("⚠️ sameRepository는 연결이 달라도 같은 리포면 true다 — 연결자가 아닌 OWNER의 Sync·소스 추가가 repo-replaced가 되지 않는다", () => {
    expect(sameRepository(callerAccess, gitlabTarget)).toBe(true);
    expect(sameAccessedRepository(callerAccess, gitlabTarget)).toBe(true);
  });

  it("⚠️ sameRepoTarget은 연결이 다르면 false다 — 다른 OWNER의 재연결을 잠금 안에서 감지한다", () => {
    expect(sameRepoTarget(gitlabTarget, { ...gitlabTarget, connectionId: "conn-b" })).toBe(false);
    expect(sameRepoTarget(gitlabTarget, { ...gitlabTarget })).toBe(true);
  });

  it("새 리포는 호출자 자신의 연결로, 연결된 프로젝트는 프로젝트가 참조하는 연결로 연다", () => {
    expect(newRepoTarget(callerAccess)).toEqual({ ...gitlabTarget, connectionId: "conn-b" });
    expect(projectReadTarget(callerAccess, gitlabTarget)).toEqual(gitlabTarget);
  });

  it("GitHub은 확인한 접근의 값으로 연다 — 지금 동작 그대로(D16 ⑤)", () => {
    const githubAccess = { host: "github", repositoryId: "1035512", installationId: "158107153", repoOwner: "acme-renamed", repoName: "site" } as const;
    const opened = { host: "github", owner: "acme-renamed", name: "site", installationId: "158107153", repositoryId: "1035512" };
    expect(newRepoTarget(githubAccess)).toEqual(opened);
    expect(projectReadTarget(githubAccess, target)).toEqual(opened);
  });
});
