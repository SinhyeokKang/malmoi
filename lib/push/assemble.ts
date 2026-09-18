import { adapterFor } from "@/lib/adapters";
import type { DetectedFormat, FileProbe, ReadResult } from "@/lib/adapters/types";
import { fail } from "@/lib/failure";

import { pickBaseLocale, selectLocaleFiles } from "./payload";

/**
 * 탐지된 포맷 + 파일 접근자 → **적재 입력**(read 결과 + base 로케일). `scripts/push-local.ts`에 인라인이던
 * select → read → base 판정을 옮긴 것이다 (ARCHITECTURE §3.1, 2026-09-07).
 *
 * **CLI와 서버 첫 적재가 같은 함수를 지나야 한다** — "서버 첫 적재 = CLI push와 같은 DB 상태"가 그 절의 실제
 * 정확성 주장이고, 함수를 공유하면 그 등가가 구조로 보장된다. `__tests__/assemble.test.ts`가 같은 트리를
 * fs probe와 메모리 probe로 각각 먹여 deep-equal을 확인한다.
 *
 * **I/O가 없다** — 파일 읽기는 `probe`로 주입받는다. 서버는 GitHub blob을 미리 받아 `makeProbe`로 감싼다.
 */

export type AssembledPushInput = {
  read: ReadResult;
  /** 키 집합의 진실. `buildPushPayload`가 이 로케일의 엔트리로만 `keys`를 만든다. */
  baseLocale: string;
};

/**
 * @param baseLocale 명시 지정(`--base`·온보딩 확정값). 없으면 `pickBaseLocale`(en 우선 → 사전순)이 추정한다.
 *
 * ⚠️ **명시가 탐지된 로케일에 없으면 던진다.** base가 키 집합의 진실이라 추정·지정이 틀리면 **진짜 base에만
 * 있는 키가 적재에서 빠져 orphaned로 떨어진다** (2026-09-04 audit #1 — `ingest`엔 `--base`가 있었는데 실제
 * 적재 경로엔 없었다).
 *
 * ⚠️ **`selectLocaleFiles`를 새로 짜지 않는다** — 껍데기가 파일을 안 골라 어댑터가 "존재하지 않았던" 전례가
 * 있다 (POSTMORTEM 2026-09-02). 리포에 없는 경로는 그 함수가 걸러낸다(빈 내용을 먹이면 그 로케일의 키를
 * 통째로 잃는다).
 */
export function assemblePushInput(input: {
  paths: readonly string[];
  probe: FileProbe;
  format: DetectedFormat;
  baseLocale?: string | undefined;
}): AssembledPushInput {
  const { paths, probe, format } = input;

  if (input.baseLocale !== undefined && !format.locales.includes(input.baseLocale)) {
    fail(
      `base locale ${input.baseLocale} is not among the detected locales (${format.locales.slice().sort().join(", ")})`,
    );
  }
  const baseLocale = input.baseLocale ?? pickBaseLocale(format.locales);
  if (baseLocale === undefined) fail("no locales — nothing to connect");

  const adapter = adapterFor(format);
  const read = adapter.read(format, selectLocaleFiles(adapter.layout, format, paths, probe));

  // read 에러를 여기서 판정하지 않는다 — CLI는 exit 1로 죽이고 온보딩은 화면에 수를 보인다.
  return { read, baseLocale };
}
