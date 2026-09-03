import { extractRefs } from "./ast";
import type { KeyRef, ScanResult, ScanWarning, ScannedRef, SourceFileInput, WrapperId } from "./types";

export type { KeyRef, ScanResult, ScanWarning, ScannedRef, SourceFileInput, WrapperId } from "./types";
export { formatWrapperSpec, parseWrapperSpec } from "./wrapper";

/**
 * 래퍼 식별자 기본값. **대상 리포가 이걸 쓴다고 가정할 수 없다** — bugshot-2의 기존 래퍼가
 * 하필 이 값과 같아서 이름 기반 매칭이 오탐 1391건을 냈다. CLI의 `--wrapper`로 덮는다.
 *
 * 목록인 이유: 한 리포가 형태를 섞어 쓴다 (bugshot-web은 `next-intl#useTranslations()`와
 * `next-intl/server#getTranslations()` 둘 다). 기본값은 여전히 하나뿐이다 — 자동 탐지는 하지 않는다.
 */
export const DEFAULT_WRAPPERS: readonly WrapperId[] = [{ module: "@/i18n", export: "t", kind: "direct" }];

/** HTML·manifest에 박힌 치환 토큰. */
const MSG_TOKEN = /__MSG_([A-Za-z0-9_@]+)__/g;

/**
 * 코드에서 키 **사용처만** 수집한다 (ARCHITECTURE §4).
 *
 * 키가 존재하는지·원문이 무엇인지·키 이름이 합법인지는 **판단하지 않는다** — 전부 `lib/adapters/`의
 * 적재 층이 로케일 파일을 읽어 정한다. 그래서 이 함수는 `errors`를 내지 않는다.
 *
 * **I/O가 없다** — 호출부가 파일을 읽어 넘긴다.
 */
export function scanSources(
  files: readonly SourceFileInput[],
  wrappers: readonly WrapperId[] = DEFAULT_WRAPPERS,
): ScanResult {
  const refs = new Map<string, KeyRef[]>();
  const warnings: ScanWarning[] = [];

  for (const file of files) {
    if (file.kind === "ts") {
      const r = extractRefs(file.path, file.code, wrappers);
      for (const { key, ref } of r.found) push(refs, key, ref);
      warnings.push(...r.warnings);
    }
    // **두 경로는 독립이다 — kind와 무관하게 토큰을 훑는다.**
    // manifest.config.ts는 .ts인데 `__MSG_ext_name__`을 문자열 리터럴로 담고 있어서,
    // AST 경로에만 보내면 AST가 문자열이라 무시하고 토큰이 전부 누락된다(실전 스캔에서 발견).
    for (const [index, text] of file.code.split("\n").entries()) {
      for (const m of text.matchAll(MSG_TOKEN)) {
        const key = m[1];
        if (key) push(refs, key, { path: file.path, line: index + 1 });
      }
    }
  }

  // 정렬해서 낸다 — 스캔 결과가 push 페이로드의 일부라 결정적이지 않으면 서버 쪽 diff가 노이즈가 된다.
  const out: ScannedRef[] = [...refs.keys()].sort(compare).map((key) => ({
    key,
    refs: dedupe((refs.get(key) ?? []).sort(byLocation)),
  }));

  return { refs: out, warnings };
}

function push(map: Map<string, KeyRef[]>, key: string, ref: KeyRef): void {
  const list = map.get(key);
  if (list) list.push(ref);
  else map.set(key, [ref]);
}

/** 같은 `path:line`이 두 경로(AST + 토큰)에서 동시에 잡히면 하나로 접는다. */
function dedupe(sorted: readonly KeyRef[]): KeyRef[] {
  const out: KeyRef[] = [];
  for (const ref of sorted) {
    const last = out[out.length - 1];
    if (last && last.path === ref.path && last.line === ref.line) continue;
    out.push(ref);
  }
  return out;
}

/** 어댑터 writer와 같은 규칙 — `<` 비교로 환경 의존을 없앤다 (ARCHITECTURE §1.1). */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byLocation(a: KeyRef, b: KeyRef): number {
  return a.path === b.path ? a.line - b.line : compare(a.path, b.path);
}
