import { extractCalls } from "./ast";
import type { KeyRef, RawCall, ScanError, ScanResult, ScannedKey, SourceFileInput, WrapperId } from "./types";

export type { KeyRef, ScanError, ScanResult, ScannedKey, SourceFileInput, WrapperId } from "./types";

/**
 * 래퍼 식별자 기본값. **대상 리포가 이걸 쓴다고 가정할 수 없다** — bugshot-2의 기존 래퍼가
 * 하필 이 값과 같아서 실전 스캔이 오탐 1391건을 냈다. CLI의 `--wrapper` 로 덮는다.
 */
export const DEFAULT_WRAPPER: WrapperId = { module: "@/i18n", export: "t" };

/**
 * `chrome.i18n`이 허용하는 메시지 이름. 이 밖의 문자가 들어가면 크롬이 그 메시지를 **조용히
 * 무시**해 런타임에 진단 없이 깨진다. 스캐너의 존재 이유가 조용한 누락 방지이므로 여기서 막는다.
 * (export의 키 정렬이 코드포인트 순서와 같다고 말할 수 있는 근거도 이 제약이다 — ARCHITECTURE §1)
 */
const CHROME_KEY = /^[A-Za-z0-9_@]+$/;

/** HTML·manifest에 박힌 치환 토큰. 이 경로는 키만 주고 원문은 주지 않는다. */
const MSG_TOKEN = /__MSG_([A-Za-z0-9_@]+)__/g;

/**
 * 키 접두사에서 namespace를 파생한다 — 첫 밑줄 앞부분.
 *
 * `chrome.i18n`이 점을 허용하지 않으므로(위 `CHROME_KEY`) 구분자는 밑줄뿐이다.
 * 밑줄이 없거나 선행 밑줄만 있으면 `_root`다 — 빈 문자열 namespace를 만들면 사이드바에
 * 이름 없는 그룹이 생긴다.
 */
export function namespaceOf(key: string): string {
  const at = key.indexOf("_");
  if (at <= 0) return "_root";
  return key.slice(0, at);
}

/**
 * 두 경로(AST + 정규식)를 합치고 검증한다.
 *
 * **I/O가 없다** — 호출부가 파일을 읽어 넘긴다. 그래서 테스트가 가상 소스로 자기완결하고,
 * CLI만 파일시스템을 안다.
 */
export function scanSources(
  files: readonly SourceFileInput[],
  wrapper: WrapperId = DEFAULT_WRAPPER,
): ScanResult {
  const errors: ScanError[] = [];
  const calls: RawCall[] = [];
  const whitelisted = new Set<string>();
  /** 정규식 경로에서 발견된 토큰. 원문은 AST 경로가 채워야 한다. */
  const tokenRefs = new Map<string, KeyRef[]>();

  for (const file of files) {
    if (file.kind === "ts") {
      const r = extractCalls(file.path, file.code, wrapper);
      calls.push(...r.calls);
      for (const key of r.whitelisted) whitelisted.add(key);
      errors.push(...r.errors);
    }
    // **두 경로는 독립이다 — kind와 무관하게 토큰을 훑는다.**
    // manifest.config.ts는 .ts인데 `__MSG_ext_name__`을 문자열 리터럴로 담고 있어서,
    // AST 경로에만 보내면 AST가 문자열이라 무시하고 토큰이 전부 누락된다(실전 스캔에서 발견).
    for (const [line, text] of file.code.split("\n").entries()) {
      for (const m of text.matchAll(MSG_TOKEN)) {
        const key = m[1];
        if (!key) continue;
        push(tokenRefs, key, { path: file.path, line: line + 1 });
      }
    }
  }

  // ── 키별로 접기 ────────────────────────────────────────────────────────
  const sources = new Map<string, string>();
  const descriptions = new Map<string, string>();
  const refs = new Map<string, KeyRef[]>();

  for (const call of calls) {
    const existing = sources.get(call.key);
    if (existing !== undefined && existing !== call.sourceText) {
      // 같은 키에 두 원문이면 어느 쪽이 진실인지 알 수 없다. 조용히 하나를 고르면
      // 다음 스캔에서 뒤집혀 needsReview가 무의미하게 전파된다.
      errors.push({
        path: call.path,
        line: call.line,
        message: `키 '${call.key}'의 원문이 서로 다르다: ${JSON.stringify(existing)} vs ${JSON.stringify(call.sourceText)}`,
      });
      continue;
    }
    sources.set(call.key, call.sourceText);
    if (call.description !== undefined) descriptions.set(call.key, call.description);
    push(refs, call.key, { path: call.path, line: call.line });
  }

  // 명시 등록 키는 원문이 없다 — 편집 UI에서 채우거나 base 로케일이 비게 된다.
  for (const key of whitelisted) if (!sources.has(key)) sources.set(key, "");

  for (const [key, locs] of tokenRefs) {
    if (!sources.has(key)) {
      const first = locs[0];
      errors.push({
        path: first?.path ?? "?",
        line: first?.line ?? 0,
        message: `__MSG_${key}__ 토큰에 대응하는 원문이 없다 — t("${key}", "...") 호출이나 // @l10n-keys 등록이 필요하다`,
      });
      continue;
    }
    for (const loc of locs) push(refs, key, loc);
  }

  // ── 키 이름 검증 ───────────────────────────────────────────────────────
  for (const [key] of sources) {
    if (CHROME_KEY.test(key)) continue;
    const first = refs.get(key)?.[0];
    errors.push({
      path: first?.path ?? "?",
      line: first?.line ?? 0,
      message: `키 이름 '${key}'에 chrome.i18n이 허용하지 않는 문자가 있다 (허용: A-Z a-z 0-9 _ @)`,
    });
  }

  // 정렬해서 낸다 — 스캔 결과가 push 페이로드가 되고, 결정적이지 않으면 diff가 노이즈가 된다.
  const keys: ScannedKey[] = [...sources.keys()]
    .filter((key) => CHROME_KEY.test(key))
    .sort(compare)
    .map((key) => {
      const description = descriptions.get(key);
      const scanned: ScannedKey = {
        key,
        sourceText: sources.get(key) ?? "",
        namespace: namespaceOf(key),
        refs: (refs.get(key) ?? []).sort(byLocation),
      };
      return description === undefined ? scanned : { ...scanned, description };
    });

  return { keys, errors };
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** export와 같은 규칙 — `<` 비교로 환경 의존을 없앤다 (ARCHITECTURE §1). */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byLocation(a: KeyRef, b: KeyRef): number {
  return a.path === b.path ? a.line - b.line : compare(a.path, b.path);
}
