import { localeOfTemplatePath } from "@/lib/onboarding/confirm";
import { validBaseInput } from "@/lib/onboarding/base-input";
import { adapterFor } from "@/lib/adapters";
import type { AdapterFile, DetectedFormat, FileProbe, ReadResult } from "@/lib/adapters/types";
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
  /** CLI 출력·페이로드도 같은 기준 언어가 연결된 포맷을 쓴다. */
  format: DetectedFormat;
  read: ReadResult;
  /** read가 먹은 파일. 원본이 필요한 층(`pnpm ingest`의 왕복 검증)이 같은 선택을 다시 짜지 않게 돌려준다. */
  files: AdapterFile[];
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
  const { paths, probe } = input;
  let { format } = input;

  // 기준 언어 파일이 템플릿 밖(`basePath`, Android `values/`)이면 코드가 리포에 없다 — en 우선 추정이 그 파일의 실제 언어와 무관한 코드를 고른다
  // (android-strings design §2.4). 호출부(`--base`·온보딩 입력)가 정하고 여기서 언어 목록에도 더한다.
  if (format.basePath !== undefined && input.baseLocale === undefined) {
    fail(`a base locale is required (--base): ${format.basePath} has no locale code in its path`);
  }
  if (format.basePath !== undefined && input.baseLocale !== undefined) {
    const observed = paths.flatMap(path => {
      const code = localeOfTemplatePath(format.pathTemplate, path);
      return code === undefined ? [] : [code];
    });
    if (format.adapter === "android-strings" && !validBaseInput({ ...format, locales: observed }, input.baseLocale)) fail("--base must be a valid locale code distinct from the observed translation locales");
    format = { ...format, templateLocale: input.baseLocale, locales: [...new Set([...format.locales, input.baseLocale])].sort() };
  }
  if (input.baseLocale !== undefined && !format.locales.includes(input.baseLocale)) {
    fail(
      `base locale ${input.baseLocale} is not among the detected locales (${format.locales.slice().sort().join(", ")})`,
    );
  }
  const baseLocale = input.baseLocale ?? pickBaseLocale(format.locales);
  if (baseLocale === undefined) fail("no locales — nothing to connect");

  const adapter = adapterFor(format);
  const files = selectLocaleFiles(adapter.layout, format, paths, probe, baseLocale);
  // basePath 파일의 언어는 기준 언어다 — 어댑터가 그 파일을 `templateLocale`로 읽는다(`android-strings`).
  const read = adapter.read(format.basePath === undefined ? format : { ...format, templateLocale: baseLocale }, files);

  // read 에러를 여기서 판정하지 않는다 — CLI는 exit 1로 죽이고 온보딩은 화면에 수를 보인다.
  return { read, files, baseLocale, format };
}
