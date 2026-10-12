import { describe, expect, it } from "vitest";

import { isGitLabConnectError, projectDisconnected } from "../errors";

describe("GitLab 연결 실패 갈래", () => {
  it("가드가 GitLab 코드만 받는다 — 호스트 중립 거부는 GitHub 갈래와 같은 문구를 쓴다", () => {
    for (const code of ["token-invalid", "token-fine-grained", "token-scope-missing", "account-mismatch", "gitlab-not-connected", "gitlab-reconnect", "gitlab-repo-archived", "gitlab-repo-unsupported", "gitlab-project-disconnected"]) {
      expect(isGitLabConnectError(code), code).toBe(true);
    }
    for (const code of ["repo-forbidden", "unavailable", "unauthorized", "invalid input", "toString", 1, null]) expect(isGitLabConnectError(code), String(code)).toBe(false);
  });

  it("⚠️ 연결이 빈 프로젝트의 거부가 호스트로 갈린다 — GitLab 프로젝트에 'App을 설치하라'를 보이지 않는다", () => {
    expect(projectDisconnected("github")).toBe("repo-not-installed");
    expect(projectDisconnected("gitlab")).toBe("gitlab-project-disconnected");
  });
});
