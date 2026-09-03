import type { PullResult } from "./run";

/**
 * pull 결과 → 편집 UI 문구.
 *
 * **순수 함수로 둔 이유는 케이스 누락을 컴파일 타임에 막는 것이다** — `PullResult`에 상태가
 * 늘면 아래 `switch`의 `never` 검사가 터진다. JSX 안 삼항 사슬에는 그런 장치가 없다.
 *
 * **문구에 git 어휘를 쓰지 않는다.** 읽는 사람은 번역 편집자(비개발자 동료)이고, spec이 그의
 * 가치를 "자기가 고친 값이 실제 제품으로 돌아가는 것을 본다"로 정의했다 — "PR이 열렸다"는
 * 그 가치를 전달하지 못한다.
 */

/** `runPull`은 실패 시 던지므로, 그것을 잡은 쪽이 이 모양으로 바꿔 넘긴다. */
export type PullOutcome = PullResult | { status: "failed"; error: string };

export type PullMessage = {
  tone: "success" | "muted" | "destructive";
  text: string;
  /** 있으면 링크로 보인다. */
  href?: string;
  linkLabel?: string;
};

export function pullMessage(outcome: PullOutcome): PullMessage {
  switch (outcome.status) {
    case "committed":
      return {
        tone: "success",
        text: `변경 사항을 개발자에게 보냈어요. 검토 후 제품에 반영됩니다.${dropped(outcome.warnings ?? [])}`,
        href: outcome.prUrl,
        linkLabel: "보낸 내용 보기",
      };
    case "skipped":
      // **두 스킵 이유를 편집자에게 구별해 보이지 않는다.** "편집이 없다"와 "파일이 안 바뀐다"의
      // 차이는 내부 판정 층의 구분이고, 편집자에게는 둘 다 "보낼 것이 없다"다.
      return {
        tone: "muted",
        text: `이미 최신 상태예요 — 보낼 변경이 없어요.${dropped(outcome.warnings ?? [])}`,
      };
    case "failed":
      // 원인을 그대로 싣는다 — 삼키면 개발자에게 물어보는 것 말고 방법이 없어진다.
      return { tone: "destructive", text: `내보내기에 실패했어요: ${outcome.error}` };
    default: {
      // 상태를 추가하면 여기서 컴파일 에러가 난다.
      const exhaustive: never = outcome;
      return exhaustive;
    }
  }
}

/**
 * writer가 버린 항목이 있으면 덧붙인다. 편집자가 고칠 수 있는 일이 아니라 **개발자에게 알리라**고만
 * 말한다 — 어느 키인지는 서버 로그(`warnings`)에 있다. 삼키면 값이 사라진 것을 아무도 모른다.
 */
function dropped(warnings: readonly string[]): string {
  return warnings.length === 0 ? "" : ` 다만 ${warnings.length}건은 반영되지 못했어요 — 개발자에게 알려 주세요.`;
}
