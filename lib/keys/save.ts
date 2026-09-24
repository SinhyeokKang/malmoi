import { z } from "zod";
import { normalizeTranslationValue } from "@/lib/translations/draft";

/**
 * 번역값 저장 판정. **유일한 사용자 mutation이다** — 키·로케일 CRUD는 없다.
 *
 * 순수 함수라 테스트가 자기완결하고, DB 접근은 Server Action이 맡는다.
 */

export type SavePlan = { action: "noop" } | { action: "upsert"; value: string };

/**
 * @param current DB의 현재 값. 행이 없으면 `null`.
 * @param next 사용자가 입력한 값.
 *
 * **`delete`를 만들지 않는다.** 행이 사라지면 export에서 그 키가 빠지고, pull이 리포 파일에서
 * 키를 지운다 — 코드가 참조하는 키가 사라져 런타임에 깨진다. 빈 문자열은 "번역 없음"을
 * 표현하면서 키를 남긴다.
 */
export function planSave(current: string | null, next: string): SavePlan {
  // 공백만 입력은 미번역 의도다. 단 값 안의 앞뒤 공백은 보존한다 —
  // 번역에 의미 있는 공백이 있을 수 있어 trim을 값에 적용하지 않는다.
  const value = normalizeTranslationValue(next);

  // 행이 없는데 빈 값이면 저장할 것이 없다.
  if (current === null && value === "") return { action: "noop" };
  if (current === value) return { action: "noop" };
  return { action: "upsert", value };
}

/**
 * 키 단위 저장의 상한 (translation-rework — design §4 · §10.2).
 *
 * `totalLength`는 변경값 합계의 UTF-16 길이다 — 최악의 UTF-8은 코드 유닛당 3바이트(CJK)라 3MB이고,
 * `next.config.ts`의 `serverActions.bodySizeLimit: "4mb"` 안에 든다. 그 한도를 올리지 않고 여기서 막는다.
 */
export const KEY_SAVE_LIMITS = { valueLength: 10_000, locales: 200, totalLength: 1_000_000 } as const;

/**
 * Server Action은 **공개 엔드포인트다** — 클라이언트가 직접 호출할 수 있으므로 입력을 검증한다. 값 상한도 그 이유다.
 */
export const KeySaveInput = z.object({
  /**
   * ⚠️ **어느 프로젝트인가를 클라이언트가 보낸다 — 그리고 서버는 그것을 믿지 않는다.**
   * 이 값은 "무엇을 열려고 하는가"일 뿐이고, 실제 대상은 `getSurfaceAccess`가 멤버십 행에서
   * 꺼낸 `projectId`다 (ARCHITECTURE §6.00 ③·§7.7). 환경변수 기본값으로 떨어지지 않는 것이 요지다.
   */
  slug: z.string().min(1),
  surfaceSlug: z.string().min(1),
  keyId: z.string().min(1),
  changes: z.array(z.object({
    localeCode: z.string().min(1),
    value: z.string().max(KEY_SAVE_LIMITS.valueLength),
  })).max(KEY_SAVE_LIMITS.locales),
});

export type KeySaveInputType = z.infer<typeof KeySaveInput>;

export type KeySavePlan =
  | { ok: true; writes: { localeCode: string; value: string }[] }
  | { ok: false; error: "empty" | "too-many" | "payload-too-large" }
  | { ok: false; error: "duplicate-locale" | "unknown-locale" | "too-long" | "cannot-clear"; localeCodes: string[] };

/**
 * **수술적 표면의 비-base 셀은 비울 수 없다** (delivery-invariants D2 · 감사 #2). 수술적 writer는 값을 지울 줄 몰라 비운 셀은 원본
 * 리터럴이 그대로 남고, pull이 그 토큰을 전달 확인으로 해제해 "보냈다"가 거짓이 됐다. 도달 불가능한 상태를 애초에 만들지 않는다.
 * base는 원문으로 폴백하고(`buildWriteEntries`) 재생성은 키를 파일에서 빼므로 둘 다 전달된다.
 *
 * ⚠️ `value`는 **정규화 뒤** 값이다 — 정규화 전 값을 보면 공백만의 입력으로 우회된다.
 * ⚠️ **PRODUCT §10 "명시적 빈값 export"가 생기면 풀릴 임시 규칙이다.** Revert(`lib/keys/revert.ts`)는 이 판정을 지나지 않는다 —
 * 기준값 `""`로의 복원은 원래 비어 있던 셀의 정당한 복원이다.
 */
export function planClearability(input: { writeStrategy: "regenerate" | "surgical"; isBase: boolean; value: string }): "ok" | "cannot-clear" {
  return input.value === "" && input.writeStrategy === "surgical" && !input.isBase ? "cannot-clear" : "ok";
}

/**
 * @param current 그 소스의 **활성** 로케일 → 현재 값(행이 없으면 `null`). 여기 없는 코드는 저장할 수 없다.
 *
 * ⚠️ **전부 검증·계획한 뒤에만 쓰기 목록을 낸다** — 셀 루프 도중 거부하면 앞 셀이 이미 커밋될 수 있다.
 * 셀 판정은 `planSave`를 그대로 쓴다(공백 정규화·no-op의 정본이 하나여야 한다).
 */
export function planKeySave(
  current: ReadonlyMap<string, string | null>,
  changes: readonly { localeCode: string; value: string }[],
  /** 그 표면의 쓰기 방식과 실제 적용 base. 비우기 판정의 입력이다 — 빠뜨리면 컴파일이 막는다(기본값을 두지 않는다). */
  surface: { writeStrategy: "regenerate" | "surgical"; baseLocale: string | null },
): KeySavePlan {
  if (changes.length === 0) return { ok: false, error: "empty" };
  if (changes.length > KEY_SAVE_LIMITS.locales) return { ok: false, error: "too-many" };
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const change of changes) (seen.has(change.localeCode) ? duplicates : seen).add(change.localeCode);
  if (duplicates.size > 0) return { ok: false, error: "duplicate-locale", localeCodes: [...duplicates] };
  const unknown = changes.filter(change => !current.has(change.localeCode)).map(change => change.localeCode);
  if (unknown.length > 0) return { ok: false, error: "unknown-locale", localeCodes: unknown };
  const tooLong = changes.filter(change => change.value.length > KEY_SAVE_LIMITS.valueLength).map(change => change.localeCode);
  if (tooLong.length > 0) return { ok: false, error: "too-long", localeCodes: tooLong };
  if (changes.reduce((sum, change) => sum + change.value.length, 0) > KEY_SAVE_LIMITS.totalLength) return { ok: false, error: "payload-too-large" };

  const writes: { localeCode: string; value: string }[] = [];
  for (const change of changes) {
    const plan = planSave(current.get(change.localeCode) ?? null, change.value);
    if (plan.action === "upsert") writes.push({ localeCode: change.localeCode, value: plan.value });
  }
  // no-op이 아닌 쓰기만 본다 — 이미 빈 셀에 빈 값을 보낸 것은 비운 것이 아니다. 하나라도 걸리면 키 전체를 거부한다.
  const uncleared = writes.filter(write => planClearability({ writeStrategy: surface.writeStrategy, isBase: write.localeCode === surface.baseLocale, value: write.value }) === "cannot-clear");
  if (uncleared.length > 0) return { ok: false, error: "cannot-clear", localeCodes: uncleared.map(write => write.localeCode) };
  return { ok: true, writes };
}
