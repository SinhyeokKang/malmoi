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
 * **ADD 행은 자기 증거가 하나 더 필요하다** (2026-10-14 R-A1 🔴 R1): 자기 `create`가 전달 목록에 있거나 자기 로케일이 base에서 관측될 때만
 * 만료한다. 값 0개 ADD는 효과 목록에 없어 목록 일치만으로는 "아직 보낼 것이 남았다"를 못 본다 — 첫 값 저장 전의 적재가 방금 추가한 언어를
 * orphan시킨다. 관측된 ADD는 목록 비교 없이 관측 그대로 active로 만료한다 — 보류된 ADD(`proposal-path-exists`)가 푸는 길이다(Y1).
 * 나머지 행의 목록 비교는 관측된 ADD의 효과를 뺀 목록으로 한다.
 *
 * ⚠️ **관측된 로케일 0개는 보류한다** (Y2) — "비었다"는 증거가 아니다(POSTMORTEM 2026-09-15). strict 적재도 빈 목록을 받지 않는다.
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

export type ExpiredLocale = { localeCode: string; operation: LocaleOperation; presence: "active" | "orphan" };
export type ExpiryHold = "pr-open" | "pr-check-failed" | "undelivered" | "base-unreadable" | "base-empty";
/** `held`는 만료되지 않고 남은 행의 이유다. 남은 행이 없으면 `null`. */
export type ExpiryPlan = { expired: ExpiredLocale[]; held: ExpiryHold | null };

export function planLocaleExpiry(input: ExpiryInput): ExpiryPlan {
  if (input.rows.length === 0) return { expired: [], held: null };
  if (input.observed.status === "unreadable") return { expired: [], held: "base-unreadable" };
  const live = liveLocalesOf(input.observed.locales);
  if (live.length === 0) return { expired: [], held: "base-empty" };
  const observedAdd = (row: ExpiryInput["rows"][number]) => row.operation === "ADD" && live.includes(row.localeCode);
  const expiring = input.rows.filter(row => row.operation === "ADD" && row.orphaned);
  let hold: ExpiryHold | null = input.pullRequest === "open" ? "pr-open" : input.pullRequest === "failed" ? "pr-check-failed" : null;
  if (hold === null) {
    const rest = input.rows.filter(row => !expiring.includes(row));
    expiring.push(...rest.filter(observedAdd));
    const resolved = new Set(expiring.filter(observedAdd).map(row => row.localeCode));
    const current = input.current.filter(effect => !(effect.effect === "create" && resolved.has(effect.localeCode)));
    const delivered = input.delivered?.filter(effect => !(effect.effect === "create" && resolved.has(effect.localeCode))) ?? null;
    if (delivered === null || !sameLocaleEffects(current, delivered)) hold = "undelivered";
    else {
      const createdBefore = (code: string) => delivered.some(effect => effect.localeCode === code && effect.effect === "create");
      expiring.push(...rest.filter(row => !expiring.includes(row) && (row.operation === "REMOVE" || createdBefore(row.localeCode))));
      // 남은 행은 자기 create가 전달된 적 없는 미관측 ADD뿐이다(빈 ADD 포함).
      if (expiring.length < input.rows.length) hold = "undelivered";
    }
  }
  const expired = expiring
    // 빈 관측은 위에서 보류했으므로 `unchanged`는 오지 않는다.
    .map(row => ({ localeCode: row.localeCode, operation: row.operation, presence: localePresence(live, row.localeCode) === "active" ? "active" as const : "orphan" as const }))
    .sort((a, b) => compareCodeUnits(a.localeCode, b.localeCode));
  return { expired, held: expiring.length === input.rows.length ? null : hold };
}
