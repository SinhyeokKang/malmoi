import { readFileSync } from "node:fs";
import { join } from "node:path";

import { detectCandidatesAcross, detectFormat, detectFormatWith, isAdapterName } from "../lib/adapters/index";
import type { DetectedFormat, FileProbe } from "../lib/adapters/types";

/**
 * **`pnpm ingest`와 `pnpm push:local`의 포맷 결정** (audit #73). 두 스크립트가 probe·`--adapter` 검증·탐지 갈래를 각자 들고
 * 있었다 — 한쪽만 고치면 ingest로 미리 본 것과 push가 올리는 것이 갈린다(POSTMORTEM 2026-09-02의 형태).
 *
 * ⚠️ **종료는 호출부가 한다** — push:local은 미탐지(1)에서 실패 보고를 먼저 보내고 끝나야 한다. 인자 오류(2)는 보고하지 않는다.
 * ⚠️ `lib/`가 아니라 여기인 이유: 문구가 한국어 CLI 출력이다(`lib`은 `no-korean-ui` 게이트 범위다).
 */

/** 대상 디렉터리 아래 파일을 읽는다. 없거나 못 읽으면 `undefined` — 탐지가 그 샘플을 건너뛴다. */
export function fileProbe(root: string): FileProbe {
  return (path) => {
    try {
      return readFileSync(join(root, path), "utf8");
    } catch {
      return undefined;
    }
  };
}

export type RequestedFormat =
  | { ok: true; format: DetectedFormat }
  | { ok: false; exitCode: 1 | 2; message: string };

/**
 * `--adapter`·`--path-template`이 고른 포맷. 둘 다 없으면 탐지 1순위다.
 *
 * ⚠️ 한 리포에 포맷이 둘일 수 있다 — bugshot-2는 _locales(4키)와 ts-dict(903키)가 공존하고 탐지 우선순위가 작은 쪽을
 * 고른다. `--adapter`로 지정하면 그게 이긴다. 이름 오타(2)와 미탐지(1)를 가른다 — 같은 메시지면 진단이 오래 걸린다.
 */
export function requestedFormat(
  paths: readonly string[],
  probe: FileProbe,
  flags: { adapterName?: string; pathTemplate?: string },
): RequestedFormat {
  const { adapterName, pathTemplate } = flags;
  if (adapterName !== undefined && !isAdapterName(adapterName)) {
    return { ok: false, exitCode: 2, message: `--adapter ${adapterName}: 등록되지 않은 어댑터다.` };
  }
  const format = pathTemplate !== undefined
    ? detectCandidatesAcross(paths, probe).find(candidate => candidate.pathTemplate === pathTemplate && (adapterName === undefined || candidate.adapter === adapterName))
    : adapterName === undefined
    ? detectFormat(paths, probe)
    : detectFormatWith(adapterName, paths, probe);
  if (format !== undefined) return { ok: true, format };
  if (adapterName !== undefined) return { ok: false, exitCode: 1, message: `--adapter ${adapterName}: 이 리포에서 해당 포맷을 찾지 못했다.` };
  return { ok: false, exitCode: 1, message: `로케일 포맷을 찾지 못했다 (${paths.length}파일 훑음) — 연동 불가.` };
}
