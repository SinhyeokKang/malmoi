#!/usr/bin/env tsx
/**
 * 사용처 스캔 CLI — 키가 코드의 어디서 쓰이는지(`refs`)만 수집한다.
 *
 *   pnpm scan <대상 디렉터리> [--json] [--wrapper <module>#<export>[()]]...
 *
 * `--wrapper`는 래퍼 식별자다. **기본값을 믿지 말고 대상 리포를 확인한다** — 같은 경로에
 * 다른 `t()`가 있으면 그 호출 전부가 오탐이 된다(bugshot-2가 하필 기본값과 같다).
 * 끝에 `()`를 붙이면 훅이다(`next-intl#useTranslations()`). **여러 번 줄 수 있다** —
 * 한 리포가 클라이언트·서버 두 형태를 함께 쓴다(bugshot-web).
 *
 * **파일시스템을 아는 유일한 층이다** — `scanSources`는 순수 함수라 소스 텍스트만 받는다.
 * **항상 exit 0이다.** 사용처를 못 찾은 것은 경고일 뿐이고, 키가 존재하는지는 로케일 파일이
 * 정한다 (`pnpm ingest`). CI를 실패시킬 수 있는 건 적재 층뿐이다 (ARCHITECTURE §4).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { findTarget, flagValues, hasFlag } from "../lib/cli/args";
import { sourceKind, walkFiles } from "../lib/cli/walk";
import {
  DEFAULT_WRAPPERS,
  formatWrapperSpec,
  parseWrapperSpec,
  scanSources,
  type SourceFileInput,
  type WrapperId,
} from "../lib/scan/index";

const USAGE = "사용법: pnpm scan <대상 디렉터리> [--json] [--wrapper <module>#<export>[()]]...";

// 인자 파싱·리포 훑기는 `lib/cli/`가 세 CLI 공통으로 든다 — `--wrapper`의 값 자리를 대상으로
// 오인하는 함정을 한 곳에서만 고치면 된다.
const argv = process.argv.slice(2);
const target = findTarget(argv, new Set(["--wrapper"]));
const json = hasFlag(argv, "--json");
const specs = flagValues(argv, "--wrapper");
if (!target) {
  console.error(USAGE);
  process.exit(2);
}

const wrappers: readonly WrapperId[] = specs.length === 0 ? DEFAULT_WRAPPERS : specs.map((raw) => {
  const parsed = parseWrapperSpec(raw);
  if (!parsed) {
    console.error(`--wrapper 형식: <module>#<export> 또는 <module>#<export>() (예: @/i18n#t, next-intl#useTranslations())`);
    process.exit(2);
  }
  return parsed;
});

// 경로는 리포 기준 상대경로다 — GitHub permalink가 이 값을 그대로 쓴다.
const files: SourceFileInput[] = walkFiles(target).flatMap((path) => {
  const kind = sourceKind(path);
  return kind ? [{ path, code: readFileSync(join(target, path), "utf8"), kind }] : [];
});
const { refs, warnings } = scanSources(files, wrappers);

if (json) {
  console.log(JSON.stringify({ wrappers, refs, warnings }, null, 2));
} else {
  console.log(`래퍼: ${wrappers.map(formatWrapperSpec).join(", ")}`);
  console.log(`스캔: ${files.length}파일 (ts ${files.filter((f) => f.kind === "ts").length} / raw ${files.filter((f) => f.kind === "raw").length})`);
  console.log(`사용처를 찾은 키: ${refs.length}개 / 총 참조 ${refs.reduce((n, r) => n + r.refs.length, 0)}건`);

  console.log(`\n샘플 (앞 10개):`);
  for (const r of refs.slice(0, 10)) {
    const first = r.refs[0];
    console.log(`  ${r.key}  ${first ? `${first.path}:${first.line}` : ""}${r.refs.length > 1 ? ` +${r.refs.length - 1}` : ""}`);
  }

  if (warnings.length) {
    // **경고다. exit 0이다.** 사용처를 못 찾은 것은 컨텍스트가 빠질 뿐이고, 키의 존재는
    // 로케일 파일이 정한다 — 남의 리포 CI를 우리 규칙으로 실패시킬 근거가 없다 (ARCHITECTURE §4).
    console.log(`\n경고 ${warnings.length}건 (실패가 아니다 — 컨텍스트만 빠진다):`);
    for (const w of warnings.slice(0, 15)) console.log(`  ${w.path}:${w.line} ${w.message}`);
    if (warnings.length > 15) console.log(`  ... ${warnings.length - 15}건 더`);
  }
}

// 스캔은 CI를 실패시키지 않는다. 적재(pnpm ingest)만 실패할 수 있다.
// process.exit(0)을 쓰지 않는 이유: 파이프 stdout이 비동기라 --json 출력이 잘린다.
process.exitCode = 0;
