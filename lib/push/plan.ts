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
  // `{locale}` 없이는 로케일별 경로를 만들 수 없다.
  pathTemplate: z.string().min(1).refine((v) => v.includes("{locale}"), {
    message: "pathTemplate에 {locale}이 없다",
  }),
  nested: z.boolean(),
  baseLocale: z.string().min(1),
});

const IncomingKey = z.object({
  key: z.string().min(1),
  sourceText: z.string(),
  namespace: z.string().min(1),
  description: z.string().optional(),
});

export const PushPayload = z
  .object({
    // 40자 hex — permalink 기준이라 형태가 틀리면 링크가 전부 깨진다.
    commitSha: z.string().regex(/^[0-9a-f]{40}$/, "commitSha는 40자 소문자 hex여야 한다"),
    format: Format,
    locales: z.array(z.string().min(1)).min(1),
    // **키 0개를 거부한다.** 스캔이 조용히 아무것도 못 찾은 경우 전 프로젝트가 orphan된다.
    keys: z.array(IncomingKey).min(1),
    /** 리포 파일에 있던 번역값. **없는 것만 채운다** (MVP §3.1) — 기존 행은 덮지 않는다. */
    translations: z.array(z.object({
      locale: z.string().min(1),
      key: z.string().min(1),
      value: z.string(),
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

export function planPush(
  existingKeys: readonly ExistingKey[],
  incomingKeys: readonly Omit<PlannedKey, "sourceHash">[],
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
