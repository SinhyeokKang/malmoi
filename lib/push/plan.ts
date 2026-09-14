import { createHash } from "node:crypto";
import { z } from "zod";

import { compareKeys, exceedsGlobBudget } from "@/lib/adapters/shared";
import { isPathSafeLocale, isPathSafeRepoPath } from "@/lib/locale-code";

import { ADAPTERS, namespaceOf } from "@/lib/adapters/index";
import type { AdapterName } from "@/lib/adapters/types";

/**
 * `/api/push`의 **판정 로직**. I/O가 없는 순수 함수라 테스트가 자기완결한다 —
 * DB 접근과 벌크 쓰기는 `apply.ts`가 맡는다.
 */

/** 원문 변경 감지용 해시. sha1이 아니라 sha256인 이유는 없다 — git blob과 무관한 내부 값이다. */
export function sourceHash(sourceText: string): string {
  return createHash("sha256").update(sourceText, "utf8").digest("hex");
}

// ── 페이로드 계약 ──────────────────────────────────────────────────────────

// `AdapterName` 리터럴 유니온을 유지한다 — `string`으로 지우면 `isAdapterName`이 막은 오타 구멍이
// 계약 타입 쪽에 다시 열린다 (2026-09-04 audit #27). 튜플 단언은 `ADAPTERS`가 비어 있지 않다는
// 사실만 덧붙인다.
const ADAPTER_NAMES = ADAPTERS.map((a) => a.name) as [AdapterName, ...AdapterName[]];

/**
 * **크기 상한** (sec-audit 발견 10). 하나도 없었다.
 *
 * 근거는 실측이다 — prod 최대가 `ts-dict` 903키 · `StringKey` 3,297행 · `Translation` 12,783행이라
 * 아래는 **20배 여유**다. 넘으면 400이고 그 이유가 응답에 실린다(대상 리포 Actions 로그로 간다 —
 * `lib/failure.ts`의 판정대로 우리 메시지는 본문에 그대로 나간다).
 *
 * ⚠️ **`placeholders`는 여기 없다.** `z.unknown()`으로 두는 것이 계약이고("모양을 검사하지 않는다"),
 * 검증을 시작하면 크롬 스펙을 따라다녀야 한다. 상한은 **개수·길이** 축에서만 건다.
 */
const MAX_KEYS = 20_000;
const MAX_LOCALES = 200;
/** 번역 값·원문 한 건의 길이. 문단 몇 개짜리 마케팅 문자열도 이 안이다. */
const MAX_TEXT = 10_000;
/** 키·네임스페이스·파일 경로 한 건. */
const MAX_NAME = 1_000;
/** `translations`·`refs` 행 수 — 20,000키 × 10로케일이 이 안이다. */
const MAX_ROWS = 200_000;

/**
 * 로케일 코드는 **파일명 한 조각**이다 (sec-audit 발견 2). `applyPush`가 이 값을 그대로 저장하고
 * 야간 pull이 `pathTemplate`에 보간해 **설치 토큰으로** 커밋하므로, 검증이 없으면 push 토큰 하나가
 * 리포의 임의 파일에 쓰는 원시체가 된다 — `.github/workflows/pwn`은 `..` 없이도 성립한다.
 */
const LocaleCode = z.string().refine(isPathSafeLocale, {
  message: "locale code must be a safe path segment (letters, digits, - and _)",
});

const Format = z.object({
  adapter: z.enum(ADAPTER_NAMES),
  /**
   * per-locale 어댑터는 `{locale}`을 치환해 경로를 만들고, multi-locale 어댑터(`ts-dict`)는
   * 한 파일에 로케일이 여러 개라 글롭이다 — 그래서 `{locale}`을 요구하지 않는다.
   */
  pathTemplate: z
    .string()
    .min(1)
    // 경로를 벗어나는 템플릿(`..`·절대 경로)과 **글롭 예산 초과**를 함께 막는다. 뒤의 것은
    // `lib/adapters/shared.ts`가 이미 순수 함수 안에서도 걸지만(저장된 값이 cron으로 들어온다),
    // 경계에서 거부하면 그 값이 **애초에 저장되지 않는다**.
    .refine((t) => isPathSafeRepoPath(t) && !exceedsGlobBudget(t), {
      message: "pathTemplate must stay inside the repository and stay within the glob budget",
    }),
  nested: z.boolean(),
  /**
   * 파일 경로 → 그 파일이 중첩이었는지. **`nested`보다 이쪽이 정확하다** (ARCHITECTURE §1.35).
   *
   * optional인 것은 이 필드를 내지 않는 어댑터(chrome·ts-dict는 정의상 flat)와 구 CI를 받기
   * 위해서다 — 없으면 write가 `nested`로 폴백한다.
   */
  nestedByPath: z.record(z.string(), z.boolean()).optional(),
  baseLocale: LocaleCode,
});

const IncomingKey = z.object({
  key: z.string().min(1).max(MAX_NAME),
  sourceText: z.string().max(MAX_TEXT),
  namespace: z.string().min(1).max(MAX_NAME),
  description: z.string().max(MAX_TEXT).optional(),
  /**
   * base 로케일 **파일 안에서의** 키 위치 (`LocaleEntry.order`).
   *
   * **optional이고, 없으면 `sortIndex`가 null로 남는다 — 배열 인덱스로 채우지 않는다.**
   * `read`가 이미 코드 유닛 순으로 정렬해 돌려주므로 구 CI가 보내는 배열 인덱스는 곧 코드 유닛
   * 순위다. 그걸 박으면 "순서를 모른다"가 "코드 유닛이 원본 순서다"로 DB에 굳고, 바이트 결과가
   * 같아서 조용하다.
   */
  order: z.number().int().nonnegative().optional(),
});

export const PushPayload = z
  .object({
    /**
     * 대상 프로젝트. **Bearer 토큰이 정한 프로젝트의 slug와 대조해 다르면 409다** (ARCHITECTURE §5.5.5).
     * 이 필드로 행을 찾지 않는다 — 그러면 오배송 페이로드가 인증 대상을 고르게 된다 (design §3.8).
     */
    projectSlug: z.string().min(1),
    surfaceSlug: z.string().min(1).max(40),
    // 40자 hex — permalink 기준이라 형태가 틀리면 링크가 전부 깨진다.
    commitSha: z.string().regex(/^[0-9a-f]{40}$/, "commitSha must be 40 lowercase hex characters"),
    /**
     * 커밋 시각 (`git show -s --format=%cI`). **역행하면 409다** — strict라 오래된 run의
     * Re-run이 DB를 그 시점으로 되돌린다. offset이 붙은 ISO 8601만 받는다.
     */
    commitAt: z.iso.datetime({ offset: true }),
    format: Format,
    locales: z.array(LocaleCode).min(1).max(MAX_LOCALES),
    // **키 0개를 거부한다.** 스캔이 조용히 아무것도 못 찾은 경우 전 프로젝트가 orphan된다.
    keys: z.array(IncomingKey).min(1).max(MAX_KEYS),
    /**
     * 리포 파일에 있던 번역값. **DB를 덮는다** (strict — ARCHITECTURE §0 불변식 2). 변경 감지도 병합도 없다.
     * 대가는 편집 손실 창이다: pull PR이 머지되기 전의 편집은 다음 push가 지운다.
     */
    translations: z.array(z.object({
      locale: LocaleCode,
      key: z.string().min(1).max(MAX_NAME),
      value: z.string().max(MAX_TEXT),
      /**
       * **그 로케일 파일이 실제로 갖고 있던** description. `keys[].description`(소스 키 메타데이터)과
       * 다른 것이다 — 합치면 base 값을 비-base에 복제하게 되고 그건 병합이다.
       */
      description: z.string().max(MAX_TEXT).optional(),
      /**
       * chrome `placeholders` 블록. **모양을 검사하지 않는다** — 요구는 "잃지 않는다"뿐이고,
       * 스키마를 검증하기 시작하면 크롬 스펙을 따라다녀야 한다 (`LocaleEntry.placeholders`와 같은 계약).
       */
      placeholders: z.unknown().optional(),
    })).max(MAX_ROWS),
    refs: z.array(z.object({
      key: z.string().min(1).max(MAX_NAME),
      path: z.string().min(1).max(MAX_NAME),
      line: z.number().int().positive(),
    })).max(MAX_ROWS),
  })
  .refine((p) => p.locales.includes(p.format.baseLocale), {
    message: "baseLocale is not in locales",
    path: ["format", "baseLocale"],
  })
  .refine((p) => p.translations.every((t) => p.locales.includes(t.locale)),
    { message: "translations carry a locale that is not in locales", path: ["translations"] });

export type PushPayloadType = z.infer<typeof PushPayload>;

// ── 계획 ──────────────────────────────────────────────────────────────────

/** DB에 이미 있는 키. 계획을 세우는 데 필요한 최소 정보만 든다. */
export type ExistingKey = {
  id: string;
  key: string;
  sourceHash: string;
  orphaned: boolean;
};

export type PlannedKey = {
  key: string;
  sourceText: string;
  sourceHash: string;
  namespace: string;
  description?: string;
  /** base 파일에서의 키 위치. 없으면 "순서를 모른다"이고 DB에 null로 간다. */
  sortIndex?: number;
};

/**
 * **`toDelete`가 없는 것이 이 타입의 요지다.** 코드에서 사라진 키는 `orphaned`로 표시만 하고
 * 남긴다 — 브랜치를 되돌리거나 기능을 복구하면 번역이 그대로 살아 돌아와야 한다 (ARCHITECTURE §0).
 */
export type PushPlan = {
  toInsert: PlannedKey[];
  toUpdate: PlannedKey[];
  /** `orphaned = true`로 바꿀 키 id. 이미 orphaned인 키는 넣지 않는다(무의미한 UPDATE 방지). */
  toOrphan: string[];
  /** `orphaned = false`로 되돌릴 키 id. */
  toUnorphan: string[];
  /** 원문이 바뀐 키 id — base 아닌 번역에 `needsReview`를 전파할 대상. */
  staleKeyIds: string[];
};

/**
 * 페이로드가 주는 키 하나. **`order`(어댑터 어휘)를 `sortIndex`(DB 컬럼)로 옮기는 유일한 지점**이라
 * 순수 함수 안에 둔다 — 껍데기에서 매핑하면 이 홉을 테스트가 못 덮는다.
 */
export type IncomingKeyType = z.infer<typeof IncomingKey>;

/**
 * ⚠️ **`baseChanged`가 필수 인자다** (6b-3). optional로 두면 껍데기가 빼먹어도 컴파일러가 조용하고,
 * 그 침묵이 이 리포에 이미 기록된 실패다 (POSTMORTEM 2026-09-02). 판정 자체는
 * `isBaseLocaleChange`(`guard.ts`)가 하고 여기는 그 결론만 받는다.
 */
export type PlanOptions = {
  /**
   * 이 push가 base 로케일을 교체하는가. `true`면 **`needsReview` 전파를 건너뛴다** (design §3.13).
   *
   * ⚠️ **`sourceHash`가 바뀐 원인이 평소와 다르다.** 평소의 전파는 "개발자가 원문 문장을 고쳤다 →
   * 번역이 낡았을 수 있다"인데, base 변경은 **원문의 언어가 교체된 것**이고 의미는 그대로다 —
   * en→ko면 `sourceText`가 "Save"→"저장"이 되지만 fr의 "Enregistrer"는 여전히 정확하고 옛
   * base(en)의 값도 마찬가지다. 전파하면 **살아남는 키 전부**에 검토 표시가 붙어 903키
   * 프로젝트에서 `needsReview` 필터가 통째로 죽는다(6a T7이 만든 값 하나가 사라진다).
   */
  baseChanged: boolean;
};

export function planPush(
  existingKeys: readonly ExistingKey[],
  incomingKeys: readonly IncomingKeyType[],
  options: PlanOptions,
): PushPlan {
  // 같은 키가 두 번 오면 뒤가 이긴다 — Map이 그 의미를 그대로 준다.
  const incoming = new Map<string, PlannedKey>();
  for (const k of incomingKeys) {
    incoming.set(k.key, {
      key: k.key,
      sourceText: k.sourceText,
      sourceHash: sourceHash(k.sourceText),
      namespace: k.namespace || namespaceOf(k.key),
      ...(k.description === undefined ? {} : { description: k.description }),
      // ⚠️ `undefined` 검사다 — `k.order ? …`로 쓰면 **0이 falsy라 파일의 첫 키가 사라진다.**
      ...(k.order === undefined ? {} : { sortIndex: k.order }),
    });
  }

  const existing = new Map(existingKeys.map((e) => [e.key, e]));

  const toInsert: PlannedKey[] = [];
  const toUpdate: PlannedKey[] = [];
  const toUnorphan: string[] = [];
  const staleKeyIds: string[] = [];

  for (const [key, planned] of incoming) {
    const prev = existing.get(key);
    if (!prev) {
      toInsert.push(planned);
      continue;
    }
    toUpdate.push(planned);
    // stale 판정은 원문 해시로만 한다 — description·namespace가 바뀐 것으로 번역을
    // 검토 대상으로 만들면 needsReview가 노이즈가 되어 필터가 무용지물이 된다.
    if (prev.sourceHash !== planned.sourceHash) staleKeyIds.push(prev.id);
    if (prev.orphaned) toUnorphan.push(prev.id);
  }

  const toOrphan: string[] = [];
  for (const prev of existingKeys) {
    if (incoming.has(prev.key)) continue;
    // 이미 orphaned면 건드리지 않는다.
    if (prev.orphaned) continue;
    toOrphan.push(prev.id);
  }

  // 정렬해서 낸다 — 계획이 결정적이어야 같은 페이로드가 같은 SQL을 만든다.
  return {
    toInsert: toInsert.sort(byKey),
    toUpdate: toUpdate.sort(byKey),
    toOrphan: toOrphan.sort(compare),
    toUnorphan: toUnorphan.sort(compare),
    // **전파만 끈다** — 갱신·orphan·unorphan은 그대로다. 비면 `apply.ts`의 전파 SQL이 애초에 안 나간다.
    staleKeyIds: options.baseChanged ? [] : staleKeyIds.sort(compare),
  };
}

function byKey(a: PlannedKey, b: PlannedKey): number {
  return compare(a.key, b.key);
}

/** 어댑터 writer와 같은 규칙 — 재구현하지 않고 그 함수를 쓴다 (ARCHITECTURE §1.1). */
const compare = compareKeys;
