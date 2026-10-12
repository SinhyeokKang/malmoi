import { describe, expect, it } from "vitest";

import { GITHUB_APP_ENV, githubAppConfigured, planGitHubAppConfig } from "../github-app";

/**
 * GitHub App 구성 판정 (gitlab-repositories D4·D4a) — 다섯이 all-or-none이다. 화면 갈래(E-ui)와 셀프 호스팅 preflight(E-sh)가 이 판정 하나를 쓴다.
 */
const ALL = Object.fromEntries(GITHUB_APP_ENV.map((name) => [name, `value-of-${name}`]));

describe("planGitHubAppConfig", () => {
  it("다섯 다 있으면 complete — GitHub 연결 경로가 선다", () => {
    expect(planGitHubAppConfig(ALL)).toBe("complete");
    expect(githubAppConfigured(ALL)).toBe(true);
  });

  it("다섯 다 없으면 absent — GitLab 전용 설치다(빈 문자열도 없는 것이다)", () => {
    expect(planGitHubAppConfig({})).toBe("absent");
    expect(planGitHubAppConfig(Object.fromEntries(GITHUB_APP_ENV.map((name) => [name, ""])))).toBe("absent");
    expect(githubAppConfigured({})).toBe(false);
  });

  it("⚠️ 하나라도 빠지면 partial이다 — 화면은 GitHub 컨트롤을 그리지 않고 preflight는 기동을 거부한다", () => {
    for (const missing of GITHUB_APP_ENV) {
      const env = { ...ALL, [missing]: undefined };
      expect(planGitHubAppConfig(env), missing).toBe("partial");
      expect(githubAppConfigured(env), missing).toBe(false);
    }
    expect(planGitHubAppConfig({ GITHUB_APP_ID: "1" })).toBe("partial");
  });

  it("그룹은 정확히 다섯이다 — 슬러그도 든다(D4)", () => {
    expect([...GITHUB_APP_ENV].sort()).toEqual(["GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_SLUG"]);
  });
});
