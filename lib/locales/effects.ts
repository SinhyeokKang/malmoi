import { compareCodeUnits } from "@/lib/compare";

/**
 * **언어 변경의 파일 집합 효과** (locale-add design §1).
 *
 * 현재 효과 목록은 `LocaleChange` 행에서, 전달 목록은 `DeliveryConfirmation.deliveredLocaleChanges`에서 온다. 둘이 다르면 언어 변경
 * 작업이 남은 것이다 — 전이 이력이나 실행 참조를 따로 두지 않는다. sync 브랜치를 매번 base에서 다시 만들므로 이 비교 하나로 충분하다.
 *
 * ⚠️ 코드를 객체 프로퍼티로 쓰지 않는다 — 값 수는 Map, 비교는 정규화한 배열이다(`__proto__`).
 */

export type LocaleOperation = "ADD" | "REMOVE";
export type LocaleChangeRow = { localeCode: string; operation: LocaleOperation };
export type LocaleEffect = { localeCode: string; effect: "create" | "delete" };

/** 행 + 로케일별 값 있는 번역 수 → 정규화 목록. 값 0개 ADD는 파일을 내지 않으므로 빠진다. */
export function localeEffects(rows: readonly LocaleChangeRow[], valueCounts: ReadonlyMap<string, number>): LocaleEffect[] {
  return normalizeLocaleEffects(rows.flatMap((row): LocaleEffect[] => {
    if (row.operation === "REMOVE") return [{ localeCode: row.localeCode, effect: "delete" }];
    return (valueCounts.get(row.localeCode) ?? 0) > 0 ? [{ localeCode: row.localeCode, effect: "create" }] : [];
  }));
}

/** 코드순(코드 유닛) 정렬 + 중복 제거. 저장·비교가 같은 바이트를 보도록 한 형태만 둔다. */
export function normalizeLocaleEffects(effects: readonly LocaleEffect[]): LocaleEffect[] {
  const seen = new Set<string>();
  const unique: LocaleEffect[] = [];
  for (const effect of effects) {
    // 배열 튜플로 묶는다 — 구분자 이어붙이기는 코드에 그 구분자가 들어오면 경계가 움직인다.
    const key = JSON.stringify([effect.localeCode, effect.effect]);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ localeCode: effect.localeCode, effect: effect.effect });
  }
  return unique.sort((a, b) => compareCodeUnits(a.localeCode, b.localeCode) || compareCodeUnits(a.effect, b.effect));
}

export function sameLocaleEffects(a: readonly LocaleEffect[], b: readonly LocaleEffect[]): boolean {
  const left = normalizeLocaleEffects(a);
  const right = normalizeLocaleEffects(b);
  return left.length === right.length && left.every((effect, index) => effect.localeCode === right[index]?.localeCode && effect.effect === right[index]?.effect);
}
