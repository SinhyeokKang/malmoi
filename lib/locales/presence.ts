import { compareCodeUnits } from "@/lib/compare";

/**
 * **strict 적재의 로케일 존재 판정** — 관측된 로케일은 활성, 나머지는 orphan, 관측이 비면 아무것도 바꾸지 않는다.
 *
 * `lib/push/apply.ts`의 Locale upsert·orphan 문장이 이 규칙을 SQL로 들고, 언어 변경 만료(`./expiry`)가 같은 함수로 판정한다
 * (locale-add design §1 "존재 판정은 적재와 같은 순수 함수"). 의도와 리포 관측을 비교해 고르는 코드는 여기에 없다 — 관측만 본다.
 *
 * ⚠️ 정렬은 결정성용이다 — 이 배열이 SQL 인자로 가고 순서가 흔들리면 문장이 매번 달라진다. 중복도 접는다 — 같은 문장이 같은 행을
 * 두 번 치면 트랜잭션 전체가 거부된다 (2026-09-04 audit #13).
 */
export function liveLocalesOf(observed: readonly string[]): string[] {
  return [...new Set(observed)].sort(compareCodeUnits);
}

/** ⚠️ 빈 관측은 `unchanged`다 — 적재는 그때 orphan 문장을 내지 않는다(`<> ALL('{}')`이 전 로케일을 orphan시킨다). */
export function localePresence(live: readonly string[], code: string): "active" | "orphan" | "unchanged" {
  if (live.length === 0) return "unchanged";
  return live.includes(code) ? "active" : "orphan";
}
