import { afterEach, describe, expect, it, vi } from "vitest";

import { enabledLoginProviders, LOGIN_PROVIDER_ENV, loginProviderStates, present, withEnabled } from "../login-providers";

/**
 * 로그인 공급자의 켜진 집합 (optional-login-providers spec §4). 한 공급자의 ID·SECRET이 **둘 다** 값이 있으면 `enabled`,
 * 둘 다 비면 `absent`, 하나만이면 `partial`이다 — 공백만 있는 값은 빈 값(preflight `present`와 같은 규칙).
 */

afterEach(() => vi.unstubAllEnvs());

const BOTH = { AUTH_GITHUB_ID: "gh-id", AUTH_GITHUB_SECRET: "gh-secret", AUTH_GOOGLE_ID: "go-id", AUTH_GOOGLE_SECRET: "go-secret" };

describe("loginProviderStates", () => {
  it("공급자마다 enabled · absent · partial", () => {
    expect(loginProviderStates(BOTH)).toEqual({ github: "enabled", google: "enabled" });
    expect(loginProviderStates({})).toEqual({ github: "absent", google: "absent" });
    expect(loginProviderStates({ AUTH_GITHUB_ID: "x" })).toEqual({ github: "partial", google: "absent" });
    expect(loginProviderStates({ AUTH_GITHUB_SECRET: "x" })).toEqual({ github: "partial", google: "absent" });
    expect(loginProviderStates({ AUTH_GOOGLE_ID: "x", AUTH_GOOGLE_SECRET: "y" })).toEqual({ github: "absent", google: "enabled" });
    expect(loginProviderStates({ ...BOTH, AUTH_GOOGLE_SECRET: undefined })).toEqual({ github: "enabled", google: "partial" });
  });

  it("공백만 있는 값은 빈 값이다 — preflight와 같은 `present` 하나를 쓴다", () => {
    expect(loginProviderStates({ ...BOTH, AUTH_GITHUB_ID: "   " })).toEqual({ github: "partial", google: "enabled" });
    expect(loginProviderStates({ AUTH_GITHUB_ID: " ", AUTH_GITHUB_SECRET: "\t", AUTH_GOOGLE_ID: "", AUTH_GOOGLE_SECRET: "" }))
      .toEqual({ github: "absent", google: "absent" });
    expect(present("  ")).toBeUndefined();
    expect(present("")).toBeUndefined();
    expect(present(undefined)).toBeUndefined();
    expect(present(" v ")).toBe(" v ");
  });

  it("env 이름 표 — preflight와 SH-15 게이트가 같은 표를 본다", () => {
    expect(LOGIN_PROVIDER_ENV).toEqual({
      github: { id: "AUTH_GITHUB_ID", secret: "AUTH_GITHUB_SECRET" },
      google: { id: "AUTH_GOOGLE_ID", secret: "AUTH_GOOGLE_SECRET" },
    });
  });
});

describe("withEnabled", () => {
  const github = { id: "github", name: "GitHub" };
  const google = { id: "google", name: "Google" };

  it("켜진 것만 남기고 입력 순서를 지킨다", () => {
    expect(withEnabled([github, google], ["github", "google"])).toEqual([github, google]);
    expect(withEnabled([github, google], ["google"])).toEqual([google]);
    expect(withEnabled([github, google], ["github"])).toEqual([github]);
    expect(withEnabled([github, google], [])).toEqual([]);
    // 켜진 집합의 순서가 아니라 provider 목록의 순서다.
    expect(withEnabled([github, google], ["google", "github"])).toEqual([github, google]);
  });
});

describe("enabledLoginProviders", () => {
  it("테스트 기본(setup)은 hosted — 두 쌍 다 켜져 있다", () => {
    expect(enabledLoginProviders()).toEqual(["github", "google"]);
  });

  it("호출 시점의 env를 읽는다 — import가 값을 굳히지 않는다", () => {
    vi.stubEnv("AUTH_GITHUB_ID", "");
    vi.stubEnv("AUTH_GITHUB_SECRET", "");
    expect(enabledLoginProviders()).toEqual(["google"]);
    vi.stubEnv("AUTH_GITHUB_ID", "gh");
    vi.stubEnv("AUTH_GITHUB_SECRET", "secret");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "");
    expect(enabledLoginProviders()).toEqual(["github"]);
  });

  it("반쪽은 꺼진 것이다 — 순서는 언제나 github → google", () => {
    vi.stubEnv("AUTH_GITHUB_SECRET", " ");
    expect(enabledLoginProviders()).toEqual(["google"]);
  });
});
