import "server-only";

import { checkContentBudget } from "./budget";
import type { PrismaClient } from "@/generated/prisma/client";
import type { AdapterError, DetectedFormat } from "@/lib/adapters/types";
import { applyPush } from "@/lib/push/apply";
import { assemblePushInput } from "@/lib/push/assemble";
import { PushPayload } from "@/lib/push/plan";
import { fail } from "@/lib/failure";
import { buildPushPayload } from "@/lib/push/payload";

import { makeProbe } from "./detect";

/**
 * 서버측 첫 적재 (design §4). **기존 경로를 그대로 지난다**:
 *
 * ```
 * assemblePushInput  → selectLocaleFiles + adapter.read + base 판정 (CLI와 같은 함수)
 * buildPushPayload   → 페이로드의 유일한 생산자
 * applyPush          → 키·번역·refs·lastCommit* 를 한 배열형 트랜잭션으로
 * ```
 *
 * ⚠️ **셋을 우회하지 않는다.** 리터럴로 조립했다가 필수 필드가 늘어도 컴파일러가 침묵한 전례가 있고
 * (POSTMORTEM 2026-08-31), 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았던" 전례도 있다 (2026-09-02).
 *
 * ⚠️ **GitHub을 모른다.** 스냅샷과 blob은 **값으로** 받는다 — `lib/onboarding/`이 `@/lib/github`을
 * import하지 않는 것이 경계이고, 두 자격증명이 만나는 자리는 Server Action 하나다 (design §3.10).
 * `credential-separation.test.ts`가 소스에서 상시로 센다.
 */

export type FirstIngestResult = {
  /** 적재한 키 수(base 로케일 기준). 화면 헤드라인의 앞 숫자다 (`ingestHeadline`). */
  count: number;
  /** 읽지 못한 항목 수 = read 에러 + 중복으로 접힌 키. **0이 아니면 성공 문구를 쓰지 않는다** (불변식 9). */
  failed: number;
  /** 상위 몇 건을 화면에 보이기 위해. 후보를 떨어뜨리지 않는다 (ARCHITECTURE §4의 연장). */
  errors: AdapterError[];
};

export async function ingestFirstSnapshot(
  prisma: PrismaClient,
  input: {
    projectId: string;
    startedAt: Date;
    projectSlug: string;
    format: DetectedFormat;
    baseLocale: string;
    headSha: string;
    /** base head 커밋의 시각. ⚠️ `new Date()`면 CI 첫 push가 `stale-commit` 409다 (design §4). */
    headCommittedAt: string;
    /** 스냅샷의 트리 경로 전부. `selectLocaleFiles`가 여기서 실재하는 파일만 고른다. */
    paths: readonly string[];
    /**
     * **내려받기를 시도한 로케일 파일 경로**(`ingestTargets`의 결과). 여기 있는데 `blobs`에 없으면
     * 다운로드가 실패한 것이고, 그것은 "리포에 없음"과 **다르다** — 접으면 12개 중 3개가 5xx로 빠져도
     * 화면이 "N개 키를 적재했어요"를 쓴다 (code-review 2026-09-07 🔴1 · 불변식 9).
     */
    targets: readonly string[];
    /** 내려받은 로케일 파일의 내용. */
    blobs: ReadonlyMap<string, string>;
  },
): Promise<FirstIngestResult> {
  // 내려받지 못한 파일은 **실패로 센다.** 빈 내용을 먹이면 그 로케일의 키를 통째로 잃고, 조용히 빼면
  // 성공 문구가 나간다 — 둘 다 값이 사라진 것을 사용자가 모른다.
  let totalBytes = 0;
  for (const [path, content] of input.blobs) totalBytes = checkContentBudget(path, content, totalBytes);
  const missing = input.targets.filter((p) => !input.blobs.has(p));

  const { read, baseLocale } = assemblePushInput({
    paths: input.paths.filter((p) => input.blobs.has(p)),
    probe: makeProbe(input.blobs),
    format: input.format,
    baseLocale: input.baseLocale,
  });

  const { payload, duplicateKeys } = buildPushPayload({
    projectSlug: input.projectSlug,
    commitSha: input.headSha,
    commitAt: input.headCommittedAt,
    format: input.format,
    read,
    baseLocale,
    // ⚠️ **서버는 리포를 체크아웃하지 않아 ts-morph를 돌릴 수 없다.** `applyPush`가 refs를 전체 교체하므로
    // 빈 배열은 "참조 없음"으로 저장되고, CI가 처음 push하면 채워진다 — 화면이 그 사실을 한 줄로 알린다.
    scanRefs: [],
  });

  if (payload.keys.length === 0) return { count: 0, failed: Math.max(1, read.errors.length + missing.length), errors: read.errors };
  if (!PushPayload.safeParse(payload).success) fail("first ingest exceeds the push payload contract");

  const errors = [
    ...read.errors,
    ...missing.map((path): AdapterError => ({ path, code: "download-failed" })),
  ];
  const failed = errors.length + duplicateKeys;

  // 첫 적재라 base가 바뀔 수 없다 — 이 프로젝트는 아직 `baseLocale`이 null이다 (design §3.13).
  //
  // ⚠️ **결과를 같은 트랜잭션에 싣는다** (projects-list design §3.35). 빠진 파일이 있으면 데이터는
  // 들어간 채로 `partial-import`가 남는다 — throw가 없어도 성공 문구를 쓰지 않는 것과 같은 축이다
  // (불변식 9). 그래서 `failed`를 applyPush **앞에서** 센다.
  await applyPush(prisma, input.projectId, payload, {
    previousBaseLocale: null,
    startedAt: input.startedAt,
    importOutcome: failed === 0 ? null : "partial-import",
  });

  return {
    count: payload.keys.length,
    // **단위가 셋이라 각각 센다** — 파일(read 실패·다운로드 실패)과 엔트리(중복). 한 숫자로 합치는 것은
    // 화면 문구가 "M건을 읽지 못했어요" 하나라서다.
    failed,
    errors,
  };
}
