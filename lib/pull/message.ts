import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";
import { isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";

import type { PullResult } from "./run";

/**
 * pull 결과 → 편집 UI 문구.
 *
 * **순수 함수로 둔 이유는 케이스 누락을 컴파일 타임에 막는 것이다** — `PullResult`에 상태가
 * 늘면 아래 `switch`의 `never` 검사가 터진다. JSX 안 삼항 사슬에는 그런 장치가 없다.
 *
 * **문구에 git 어휘를 쓰지 않는다.** 읽는 사람은 번역 편집자(비개발자 동료)이고, spec이 그의
 * 가치를 "자기가 고친 값이 실제 제품으로 돌아가는 것을 본다"로 정의했다 — "PR이 열렸다"는
 * 그 가치를 전달하지 못한다. 링크 라벨도 같다.
 *
 * **문구 일곱 · tone 넷이다** — success가 둘이고, 7단계가 게이트 거부 둘(`info`)을 더했다.
 */

/**
 * `runPull`은 실패 시 던지므로, 그것을 잡은 쪽이 이 모양으로 바꿔 넘긴다.
 *
 * ⚠️ **게이트 거부도 같은 모양이다** (7단계 — sync-runs design 결정 5). `status: "failed"`인 이유가
 * 둘이다: `header.tsx`의 refresh 분기가 `status !== "failed"`라 그대로 맞고, 실패에는
 * `router.refresh()`를 부르지 않는다는 2026-09-08 규칙이 거부에도 옳다(바뀐 것이 없다).
 */
export type PullOutcome =
  | PullResult
  | { status: "failed"; error: string; retryAfterSeconds?: number };

/**
 * 게이트 거부의 사유 (`lib/sync/plan.ts`의 판정에서 온다). **sync 오류가 아니다** — 행에 남지 않고
 * (design 결정 6) 다음 시도가 그대로 통과한다.
 */
export type SyncGateError = "already-running" | "too-soon";

const SYNC_GATE_ERRORS: ReadonlySet<string> = new Set<SyncGateError>(["already-running", "too-soon"]);

/** `isAccessError`·`isOnboardError`와 같은 형 — 화면이 토큰을 그대로 흘리지 않게 한다. */
export function isSyncGateError(value: unknown): value is SyncGateError {
  return typeof value === "string" && SYNC_GATE_ERRORS.has(value);
}

/** `Alert` variant와 같은 이름이다 (DESIGN §6.2) — 화면이 매핑 표를 또 들지 않는다. */
export type PublishTone = "info" | "success" | "warning" | "danger";

export type PullMessage = {
  tone: PublishTone;
  text: string;
  /** 있으면 링크로 보인다. */
  href?: string;
  linkLabel?: string;
};

export function pullMessage(outcome: PullOutcome): PullMessage {
  switch (outcome.status) {
    case "committed": {
      const dropped = outcome.warnings?.length ?? 0;
      return {
        // ⚠️ **버린 값이 있으면 success가 아니다** (SAAS 불변식 9). 보내긴 했으므로 danger도 아니다.
        tone: dropped === 0 ? "success" : "warning",
        text:
          dropped === 0
            ? outcome.pr === "created"
              ? m.translations.publish.created
              : m.translations.publish.updated
            : m.translations.publish.partial(dropped, true),
        href: outcome.prUrl,
        linkLabel: m.translations.publish.viewLink,
      };
    }
    case "skipped": {
      // **두 스킵 이유를 편집자에게 구별해 보이지 않는다.** "편집이 없다"와 "파일이 안 바뀐다"의
      // 차이는 내부 판정 층의 구분이고, 편집자에게는 둘 다 "보낼 것이 없다"다.
      const dropped = outcome.warnings?.length ?? 0;
      // ⚠️ **스킵에도 warnings가 붙는다**(2층 스킵 + writer 경고). 그것을 info로 접으면 버린 값을
      // 조용히 숨기는 것이라 같은 불변식 위반이다 — 다만 "Sent"라고 쓰지도 않는다(아무것도 안 갔다).
      if (dropped > 0) return { tone: "warning", text: m.translations.publish.partial(dropped, false) };
      return { tone: "info", text: m.translations.publish.nothing };
    }
    case "failed":
      /**
       * ⚠️ **게이트 거부가 먼저다.** 고장이 아니라 "이미 보내고 있다"·"방금 보냈다"라 **tone이 `info`**이고,
       * `danger`는 `role="alert"`라 스크린리더가 읽던 것을 끊는다 (design 결정 5·§6.1).
       *
       * `retryAfterSeconds`가 outcome에 실려 오는 이유: 이 함수는 결정성 테스트 아래라 `Date.now()`를
       * 볼 수 없고, 문구가 상수를 따로 들면 판정과 갈린다 (`lib/sync/plan.ts` §1.1).
       */
      if (isSyncGateError(outcome.error)) {
        return {
          tone: "info",
          text:
            outcome.error === "too-soon"
              ? m.translations.publish.gate["too-soon"](outcome.retryAfterSeconds ?? 0)
              : m.translations.publish.gate["already-running"],
        };
      }
      // 인가 거부·장애는 `accessErrorMessage`가 사람 말로 바꾼다 — 이 자리만 `not-found`를 영어
      // 토큰으로 흘렸다 (code-review 2026-09-06 🟡9).
      if (isAccessError(outcome.error)) return { tone: "danger", text: accessErrorMessage(outcome.error) };
      // ⚠️ **온보딩 갈래도 읽는다** — `not-ready`가 여기로 오는데 위 판정만 보면 내부 토큰이 그대로
      // 나간다 (2026-09-07, T6). 두 union이 겹치는 것은 `unavailable`·`unauthorized`뿐이고 뜻이 같다.
      if (isOnboardError(outcome.error)) return { tone: "danger", text: onboardErrorMessage(outcome.error) };
      // 그 밖의 원인은 그대로 싣는다 — 삼키면 개발자에게 물어보는 것 말고 방법이 없어진다.
      // 남의 라이브러리 메시지는 Action이 이미 `ref`로 접었다.
      return { tone: "danger", text: m.translations.publish.failed(outcome.error) };
    default: {
      // 상태를 추가하면 여기서 컴파일 에러가 난다.
      const exhaustive: never = outcome;
      return exhaustive;
    }
  }
}
