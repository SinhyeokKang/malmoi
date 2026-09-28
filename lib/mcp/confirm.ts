import { verifySampleConfirmation } from "@/lib/onboarding/sample-confirmation";

/**
 * MCP `create_project`·`add_sources`의 샘플 확인값 소비 (mcp-connector design §2.2). **기존 서명·검증을 그대로 쓴다** — 서명 필드가
 * 이미 사용자·리포·설치·ref·head·포맷·발급 시각이라 확장이 필요 없다. 웹 Action은 확인값을 받지 않고 파일을 다시 읽어 검증하므로
 * 이 판정은 MCP 경로에만 붙는다(웹 입력 계약은 그대로).
 *
 * **전부 아니면 아무것도** — 후보 중 하나라도 실패하면 첫 실패의 index로 전체가 실패하고 호출부는 생성/추가 tx에 들어가지 않는다.
 * 자동 재탐지로 새 확인값을 만들어 쓰기를 이어가지 않는다 — 에이전트가 `detect_formats`를 다시 부른다.
 */

export type ConfirmedCandidate = {
  /** `detect_formats`가 준 확인값. MCP 입력에선 필수지만, 누락을 스키마 오류가 아니라 이 판정의 `invalid-input`으로 받는다. */
  confirmation: string | undefined;
  adapter: string;
  pathTemplate: string;
  baseLocale: string;
};

export type SampleConfirmationPlan =
  | { status: "ok" }
  /** 확인값 누락·후보 0개 — 인자가 틀렸다. 재탐지를 권할 일이 아니다. */
  | { status: "invalid-input"; index: number }
  /** 변조·만료·미래 시각·컨텍스트 불일치 — 기존 온보딩과 같은 낱말로 접는다. */
  | { status: "sample-expired"; index: number }
  /** 서명된 포맷과 고른 adapter·pathTemplate이 다르거나 baseLocale이 서명된 로케일 밖이다. */
  | { status: "manual-no-match"; index: number };

export function planSampleConfirmations(input: {
  candidates: readonly ConfirmedCandidate[];
  /** 인가 뒤 읽은 리포 스냅샷 — 적재에 쓸 **같은** head다(검증과 적재가 다른 head를 보지 않는다). */
  context: { userId: string; repositoryId: string; installationId: string; ref: string; headSha: string };
  secret: string;
  now: Date;
}): SampleConfirmationPlan {
  if (input.candidates.length === 0) return { status: "invalid-input", index: 0 };
  for (const [index, candidate] of input.candidates.entries()) {
    if (candidate.confirmation === undefined || candidate.confirmation === "") return { status: "invalid-input", index };
    const format = verifySampleConfirmation(candidate.confirmation, input.context, input.secret, input.now);
    if (format === null) return { status: "sample-expired", index };
    if (format.adapter !== candidate.adapter || format.pathTemplate !== candidate.pathTemplate || !format.locales.includes(candidate.baseLocale)) {
      return { status: "manual-no-match", index };
    }
  }
  return { status: "ok" };
}
