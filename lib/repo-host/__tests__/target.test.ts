import { describe, expect, it } from "vitest";

import { repoTargetOf, sameAccessedRepository, sameRepoTarget, sameRepository, type RepoTarget } from "../target";

/**
 * 리포 호스트 경계의 입력 (gitlab-repositories design §3 "공통 경계"). 판정은 **저장된 행**만 본다 — 클라이언트 입력이 아니다.
 *
 * ⚠️ **`unpinned`를 `not-connected`로 접지 않는다** (sec-audit-2 #34 · ux-drift-unify D1). 설치가 있고 리포 id만 없는 행은 [Reconnect] 한 번으로
 * 끝나고, 설치가 없는 행은 Connect다 — 한 null로 접으면 설정·Home·번역·MCP의 안내가 한쪽으로 쏠린다.
 */

const row = { repoOwner: "acme", repoName: "web", installationId: "158107153", repositoryId: "1035512" };
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

  it("판정이 `storedConnection`과 같다 — 연결 화면의 첫 렌더와 I/O 경계가 한 판정이다", async () => {
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
  const access = { host: "github", repositoryId: "1035512", installationId: "158107153" } as const;

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
