import { describe, expect, it } from "vitest";

import { en } from "@/messages/en";
import { es } from "@/messages/es";
import { ko } from "@/messages/ko";

import type { GitLabConnectError } from "../errors";
import { gitlabConnectErrorMessage } from "../message";

/**
 * GitLab 연결 실패 → 화면 문구 (gitlab-repositories tasks §5 · B 인계). `connectErrorMessage`와 같은 형 — 갈래 누락은 컴파일이,
 * 모르는 값은 폴백이 막는다. 호스트 중립 거부(`repo-forbidden`·`repo-read-only`)는 GitHub 갈래와 **같은 문장**을 쓴다(문구 두 벌 금지).
 */

const CODES: GitLabConnectError[] = [
  "token-invalid",
  "token-fine-grained",
  "token-scope-missing",
  "account-mismatch",
  "gitlab-not-connected",
  "gitlab-reconnect",
  "gitlab-repo-archived",
  "gitlab-repo-unsupported",
  "gitlab-project-disconnected",
];

describe.each([["en", en], ["ko", ko], ["es", es]] as const)("%s", (_lang, m) => {
  it.each(CODES)("%s는 자기 문장이 있고 폴백이 아니다", (code) => {
    const text = gitlabConnectErrorMessage(m, code);
    expect(text).not.toBe(m.errors.gitlab.fallback);
    expect(text).not.toMatch(/github|pull request/i);
  });

  it("일시 장애는 GitLab 문장이고 '무효'로 접지 않는다", () => {
    expect(gitlabConnectErrorMessage(m, "unavailable")).toBe(m.errors.gitlab.unavailable);
    expect(m.errors.gitlab.unavailable).not.toBe(m.errors.gitlab["token-invalid"]);
  });

  it("호스트 중립 거부는 GitHub 갈래와 같은 문장이다", () => {
    expect(gitlabConnectErrorMessage(m, "repo-forbidden")).toBe(m.errors.connect["repo-forbidden"]);
    expect(gitlabConnectErrorMessage(m, "repo-read-only")).toBe(m.errors.connect["repo-read-only"]);
  });

  it.each(["invalid input", "unauthorized", "toString", "__proto__", "repo-not-installed"])("모르는·다른 호스트 값 %s는 GitLab 폴백이다", (code) => {
    expect(gitlabConnectErrorMessage(m, code)).toBe(m.errors.gitlab.fallback);
  });
});

it("MCP의 GitLab 거부 문장은 화면 문장과 같다 — 같은 거부에 문구 두 벌 금지 (D2 인계)", () => {
  for (const [code, text] of Object.entries(en.mcp.errors.gitlab)) expect(text, code).toBe(gitlabConnectErrorMessage(en, code));
});
