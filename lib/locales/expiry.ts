import { sameLocaleEffects, type LocaleEffect, type LocaleOperation } from "./effects";
import { liveLocalesOf, localePresence } from "./presence";
import { compareCodeUnits } from "@/lib/compare";

/**
 * **언어 변경 의도 만료 판정** (locale-add design §1 "만료와 strict 적재").
 *
 * 만료 조건: 열린 sync PR/MR이 없다고 **성공한 조회로** 확인됨 ∧ 현재 효과 목록 = 전달 목록 ∧ base 파일 트리를 관측함.
 * 만료된 행의 활성/orphan은 strict 적재와 같은 함수(`localePresence`)가 관측만으로 정한다 — 의도와 리포를 견줘 고르지 않는다.
 *
 * ⚠️ **조회 실패·응답 유실·확인 안 된 전달 목록은 만료로 접지 않는다** (수락 기준 15). 접으면 종료된 줄 알았던 요청이 사라지거나,
 * 아직 열린 PR의 삭제가 다음 Publish에서 빠진다. ⚠️ base를 못 읽은 것은 파일 부재가 아니다(POSTMORTEM 2026-09-27).
 *
 * **모순 행**(orphan인데 ADD 행 — 구버전 롤백 구간의 잔재, design §7)은 PR·목록과 무관하게 만료한다. 구버전이 그 언어를 렌더에서
 * 뺐으므로 열린 PR에 그 파일이 실려 있지 않다. 관측은 여전히 필요하다.
 *
 * 호출부는 `Project`→`TranslationSurface` 잠금 뒤 다시 읽은 행·목록으로 부르고, 결과대로 행을 지우고 사건을 남긴다.
 */

export type PullRequestCheck = "none-open" | "open" | "failed";

export type ExpiryInput = {
  pullRequest: PullRequestCheck;
  current: readonly LocaleEffect[];
  /** `null`은 확인 안 됨(무효화 중). */
  delivered: readonly LocaleEffect[] | null;
  rows: readonly { localeCode: string; operation: LocaleOperation; orphaned: boolean }[];
  /** base head에서 관측한 이 소스의 로케일 — strict 적재의 `payload.locales`와 같은 뜻이다. */
  observed: { status: "observed"; locales: readonly string[] } | { status: "unreadable" };
};

export type ExpiredLocale = { localeCode: string; operation: LocaleOperation; presence: "active" | "orphan" | "unchanged" };
export type ExpiryHold = "pr-open" | "pr-check-failed" | "undelivered" | "base-unreadable";
/** `held`는 만료되지 않고 남은 행의 이유다. 남은 행이 없으면 `null`. */
export type ExpiryPlan = { expired: ExpiredLocale[]; held: ExpiryHold | null };

export function planLocaleExpiry(input: ExpiryInput): ExpiryPlan {
  if (input.rows.length === 0) return { expired: [], held: null };
  if (input.observed.status === "unreadable") return { expired: [], held: "base-unreadable" };
  const live = liveLocalesOf(input.observed.locales);
  const hold = gate(input);
  const expiring = hold === null ? input.rows : input.rows.filter(row => row.operation === "ADD" && row.orphaned);
  const expired = expiring
    .map(row => ({ localeCode: row.localeCode, operation: row.operation, presence: localePresence(live, row.localeCode) }))
    .sort((a, b) => compareCodeUnits(a.localeCode, b.localeCode));
  return { expired, held: expiring.length === input.rows.length ? null : hold };
}

function gate(input: ExpiryInput): ExpiryHold | null {
  if (input.pullRequest === "open") return "pr-open";
  if (input.pullRequest === "failed") return "pr-check-failed";
  if (input.delivered === null || !sameLocaleEffects(input.current, input.delivered)) return "undelivered";
  return null;
}
