import { createHash } from "node:crypto";
import { z } from "zod";

import { ADAPTERS, namespaceOf } from "@/lib/adapters/index";

/**
 * `/api/push`의 **판정 로직**. I/O가 없는 순수 함수라 테스트가 자기완결한다 —
 * DB 접근과 벌크 쓰기는 `apply.ts`가 맡는다.
 */

/** 원문 변경 감지용 해시. sha1이 아니라 sha256인 이유는 없다 — git blob과 무관한 내부 값이다. */
export function sourceHash(sourceText: string): string {
  return createHash("sha256").update(sourceText, "utf8").digest("hex");
}

// ── 페이로드 계약 ──────────────────────────────────────────────────────────

const ADAPTER_NAMES = ADAPTERS.map((a) => a.name);

const Format = z.object({
  adapter: z.enum(ADAPTER_NAMES as [string, ...string[]]),
  /**
   * per-locale 어댑터는 `{locale}`을 치환해 경로를 만들고, multi-locale 어댑터(`ts-dict`)는
   * 한 파일에 로케일이 여러 개라 글롭이다 — 그래서 `{locale}`을 요구하지 않는다.
   */
  pathTemplate: z.string().min(1),
  nested: z.boolean(),
  baseLocale: z.string().min(1),
});

const IncomingKey = z.object({
  key: z.string().min(1),
  sourceText: z.string(),
  namespace: z.string().min(1),
  description: z.string().optional(),
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
     * 대상 프로젝트. **서버의 `ACTIVE_PROJECT_SLUG`와 대조해 다르면 409다** (ARCHITECTURE §5.5.5).
     * 대상 지정을 서버 env에만 맡기면 리포가 둘 붙는 순간 오배송을 잡을 방법이 없다.
     */
    projectSlug: z.string().min(1),
    // 40자 hex — permalink 기준이라 형태가 틀리면 링크가 전부 깨진다.
    commitSha: z.string().regex(/^[0-9a-f]{40}$/, "commitSha는 40자 소문자 hex여야 한다"),
    /**
     * 커밋 시각 (`git show -s --format=%cI`). **역행하면 409다** — strict라 오래된 run의
     * Re-run이 DB를 그 시점으로 되돌린다. offset이 붙은 ISO 8601만 받는다.
     */
    commitAt: z.iso.datetime({ offset: true }),
    format: Format,
    locales: z.array(z.string().min(1)).min(1),
    // **키 0개를 거부한다.** 스캔이 조용히 아무것도 못 찾은 경우 전 프로젝트가 orphan된다.
    keys: z.array(IncomingKey).min(1),
    /**
     * 리포 파일에 있던 번역값. **DB를 덮는다** (strict — MVP §3.1). 변경 감지도 병합도 없다.
     * 대가는 편집 손실 창이다: pull PR이 머지되기 전의 편집은 다음 push가 지운다.
     */
    translations: z.array(z.object({
      locale: z.string().min(1),
      key: z.string().min(1),
      value: z.string(),
      /**
       * **그 로케일 파일이 실제로 갖고 있던** description. `keys[].description`(소스 키 메타데이터)과
       * 다른 것이다 — 합치면 base 값을 비-base에 복제하게 되고 그건 병합이다.
       */
      description: z.string().optional(),
      /**
       * chrome `placeholders` 블록. **모양을 검사하지 않는다** — 요구는 "잃지 않는다"뿐이고,
       * 스키마를 검증하기 시작하면 크롬 스펙을 따라다녀야 한다 (`LocaleEntry.placeholders`와 같은 계약).
       */
      placeholders: z.unknown().optional(),
    })),
    refs: z.array(z.object({
      key: z.string().min(1),
      path: z.string().min(1),
      line: z.number().int().positive(),
    })),
  })
  .refine((p) => p.locales.includes(p.format.baseLocale), {
    message: "baseLocale이 locales에 없다",
    path: ["format", "baseLocale"],
  })
  .refine((p) => p.translations.every((t) => p.locales.includes(t.locale)),
    { message: "translations에 locales에 없는 로케일이 있다", path: ["translations"] });

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
 * 남긴다 — 브랜치를 되돌리거나 기능을 복구하면 번역이 그대로 살아 돌아와야 한다 (MVP §2).
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

export function planPush(
  existingKeys: readonly ExistingKey[],
  incomingKeys: readonly IncomingKeyType[],
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
    staleKeyIds: staleKeyIds.sort(compare),
  };
}

function byKey(a: PlannedKey, b: PlannedKey): number {
  return compare(a.key, b.key);
}

/** 어댑터 writer와 같은 규칙 — `<` 비교로 환경 의존을 없앤다. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
