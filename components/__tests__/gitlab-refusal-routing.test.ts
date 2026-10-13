import { describe, expect, it, vi } from "vitest";

import { en } from "@/messages/en";

vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: vi.fn(), reconnectGitLabRepository: vi.fn() }));

const { failureText } = await import("@/components/onboarding/failure");

/**
 * **GitLab 거부 문장 라우팅** (R-Eui 🟡1) — 세 화면 함수가 GitLab 코드를 GitLab 문장(`gitlabConnectErrorMessage`)으로 보낸다. 갈래가 빠지면
 * GitHub 연결 폴백("The GitHub connection failed")이나 일반 폴백으로 떨어진다(세 갈래 삭제 뮤테이션 → 12 red 확인). ⚠️ 지금 `isOnboardError`는
 * 이 코드를 모르므로 순서는 하중이 아니지만, `ONBOARD_ERRORS`가 GitLab 코드를 품는 날을 대비해 GitLab 판정을 앞에 둔다.
 */
const CODES = ["gitlab-project-disconnected", "gitlab-reconnect", "gitlab-repo-archived", "gitlab-not-connected"] as const;

describe("failureText (①·소스 추가)", () => {
  it.each(CODES)("%s → GitLab 문장", (code) => {
    expect(failureText(en, code)).toBe(en.errors.gitlab[code]);
    expect(failureText(en, code)).not.toMatch(/github/i);
  });
});

describe("Sync 결과 reasonMessage", () => {
  it.each(CODES)("%s → GitLab 문장", async (code) => {
    const { reasonMessage } = await import("@/components/home/sync-result");
    expect(reasonMessage(en, code)).toBe(en.errors.gitlab[code]);
  });
});

describe("재연결 버튼 messageFor", () => {
  it.each(CODES)("%s → GitLab 문장", async (code) => {
    const { messageFor } = await import("@/components/reconnect-button");
    expect(messageFor(en, code)).toBe(en.errors.gitlab[code]);
  });
});
