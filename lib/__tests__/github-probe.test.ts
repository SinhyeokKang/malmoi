import { afterEach, describe, expect, it, vi } from "vitest";

import { MissingEnvError } from "@/lib/failure";
import { probeRepo } from "@/lib/github";

/**
 * `probeRepo`는 GitHub 실패를 값(`not-installed`·`error`)으로 접는다 — 그건 맞다. 그러나 **설정 오류는
 * 그 안에 있으면 안 된다** (code-review 2026-09-07 🟡1). `GITHUB_APP_ID`가 빠진 배포에서 `error`로
 * 접히면 화면이 "확인할 수 없어요 — 잠시 뒤 다시"를 영원히 보이고 로그도 없다. 2026-09-06 개인키
 * 사고가 정확히 그 화면이었다 (POSTMORTEM). `requireSecret`(state.ts)이 빈 키를 `state-mismatch`로
 * 접지 않고 던지는 것과 같은 판단이다 — 사용자가 할 수 있는 일이 없는 오류는 500이 정직하다.
 *
 * 네트워크는 부르지 않는다: 환경변수가 없으면 App 생성 전에 던져야 하고, 그 순서가 곧 이 테스트다.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("probeRepo — 설정 오류는 값으로 접지 않는다", () => {
  it("GITHUB_APP_ID가 없으면 MissingEnvError를 던진다 — error로 접어 '잠시 뒤 다시'로 위장하지 않는다", async () => {
    vi.stubEnv("GITHUB_APP_ID", "");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "");
    await expect(probeRepo("o", "r")).rejects.toBeInstanceOf(MissingEnvError);
  });
});
