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

  it("⚠️ 하나라도 빠지면 partial이다 — preflight는 기동을 거부한다(그룹 규칙은 다섯 그대로)", () => {
    for (const missing of GITHUB_APP_ENV) {
      const env = { ...ALL, [missing]: undefined };
      expect(planGitHubAppConfig(env), missing).toBe("partial");
    }
    expect(planGitHubAppConfig({ GITHUB_APP_ID: "1" })).toBe("partial");
  });

  it("그룹은 정확히 다섯이다 — 슬러그도 든다(D4)", () => {
    expect([...GITHUB_APP_ENV].sort()).toEqual(["GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_SLUG"]);
  });
});

/**
 * **D28 — 화면 갈래는 자격증명 넷으로 판정한다.** 슬러그(`GITHUB_APP_SLUG`)는 설치 링크만 가른다 — hosted에서 슬러그가 빠지면 지금처럼 설치 버튼만
 * 사라지고 GitHub 연결 카드·탭은 선다(CLAUDE.md "조용히 사라진다"). preflight의 다섯 그룹 규칙(위)은 바꾸지 않는다.
 */
describe("githubAppConfigured (D28)", () => {
  it("슬러그만 없으면 GitHub 경로가 선다", () => {
    expect(githubAppConfigured({ ...ALL, GITHUB_APP_SLUG: undefined })).toBe(true);
  });

  it.each(["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET"])("%s가 없으면 GitHub 경로가 서지 않는다", (missing) => {
    expect(githubAppConfigured({ ...ALL, [missing]: undefined })).toBe(false);
  });

  it("다섯 다 있으면 서고, 다 없으면 서지 않는다", () => {
    expect(githubAppConfigured(ALL)).toBe(true);
    expect(githubAppConfigured({})).toBe(false);
  });
});
