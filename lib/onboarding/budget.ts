import { Lexer, Parser } from "yaml";

/**
 * 첫 적재의 자원 예산 (2026-09-10, sec-audit-2 발견 30).
 *
 * ⚠️ **`/api/push`는 `PushPayload.safeParse`를 지나는데 첫 적재는 안 지났다.** 온보딩은
 * `buildPushPayload → applyPush`로 곧장 가므로 **타입만 맞으면 통과**했고 — 타입을 맞춰 만드는 것은
 * Zod의 `.max()`를 실행하는 것과 다르다 — 파일 수·바이트 합계 상한도 없었다. 자기 리포에 상한을
 * 넘는 로케일 파일을 넣고 프로젝트를 만들면 그대로 DB 쓰기에 닿는다. **서버가 GitHub에서 내려받으므로
 * Actions 요청 본문 크기 제한으로는 못 막는다.**
 *
 * ⚠️ **파일명이 안전하다는 사실은 파일 내용의 양을 제한하지 않는다** — ARCHITECTURE §5.5.05가
 * 설명하는 것은 경로 검사이고 이 예산과 축이 다르다.
 *
 * ⚠️ **이것은 CPU·메모리 격리가 아니다.** 아래 코드 리터럴 스캐너는 정식 언어 파서가 아니라
 * 구분자 세기이고, 공격적인 리포의 **모든** 파싱 비용을 보장하지 않는다. 막는 것은 "파서에 넘기기
 * 전에 크기와 중첩 깊이를 재는 것"까지다.
 */

/** 예산 초과는 화면에 `resource-limit` 한 줄로 간다 — 어느 상한이었는지는 사용자가 할 일을 안 바꾼다. */
export class IngestBudgetError extends Error {
  constructor() { super("repository import exceeds resource limits"); this.name = "IngestBudgetError"; }
}
/** @param _reason 코드를 읽는 사람용이다 — 밖으로 나가지 않는다(어느 파일이 걸렸는지가 힌트가 된다). */
function fail(_reason: string): never { throw new IngestBudgetError(); }

const MAX_FILES = 200;
const MAX_FILE_BYTES = 2_000_000;
const MAX_TOTAL_BYTES = 10_000_000;

/**
 * **내려받기 전에** 판정한다 — 트리 응답이 이미 파일별 `size`를 들고 있으므로 바이트를 받아 보고
 * 재는 것은 그 자체가 비용이다.
 *
 * ⚠️ **`size`가 없으면 거부한다.** 모르는 것을 0으로 세면 예산이 통째로 무의미해진다 (POSTMORTEM
 * 2026-09-03의 "실패한 조회를 '없음'으로 읽는다"와 같은 부류).
 */
export function checkDownloadBudget(paths: readonly string[], files: readonly { path: string; size?: number }[]): void {
  if (paths.length > MAX_FILES) fail("too many locale files");
  const sizes = new Map(files.map(file => [file.path, file.size]));
  let total = 0;
  for (const path of paths) {
    const size = sizes.get(path);
    if (size === undefined || !Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES) fail("locale file size unavailable or excessive");
    total += size;
    if (total > MAX_TOTAL_BYTES) fail("locale download budget exceeded");
  }
}
/**
 * 내려받은 내용 하나의 바이트와 **구문 중첩 깊이**를 잰다. 반환값은 누적 바이트라 호출부가 이어 붙인다.
 *
 * ⚠️ **YAML은 실제 Lexer·CST Parser로 센다** (POSTMORTEM 2026-09-10). 처음엔 아래 따옴표·괄호
 * 스캐너를 YAML에도 썼는데, YAML의 plain scalar와 block scalar는 따옴표 의미가 달라 `title: don't stop`
 * 뒤의 깊이 101이 통과하고 반대로 block scalar 안의 `[` 101자가 거부됐다 — **바이트 검사는 맞아도
 * 구문 깊이 판정이 틀렸다.** 재귀 AST를 만드는 `toJS` **전에** 구성 스택을 보는 것이 요지다.
 *
 * ⚠️ **`parser.stack`은 `yaml` 패키지의 내부 구조다.** 그래서 버전을 올릴 때 `budget.test.ts`가
 * red로 알려 주는 것에 의존한다 — 스택 표의 `yaml` 고정 이유가 CST 보존 하나에서 둘로 늘었다.
 */
export function checkContentBudget(path: string, content: string, total: number): number {
  // ⚠️ 문자열 길이가 아니라 바이트다 — 비ASCII에서 둘이 갈린다 (POSTMORTEM 2026-09-09).
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_FILE_BYTES || total + bytes > MAX_TOTAL_BYTES) fail("locale content budget exceeded");
  if (/\.ya?ml$/.test(path)) {
    const parser = new Parser();
    for (const lexeme of new Lexer().lex(content)) {
      // CST를 쓰지는 않지만 제너레이터를 비워야 파서가 다음 토큰으로 넘어간다.
      for (const _token of parser.next(lexeme)) { /* 소비만 한다. */ }
      const depth = parser.stack.filter(token =>
        token.type === "block-map" || token.type === "block-seq" || token.type === "flow-collection"
      ).length;
      if (depth > 100) fail("locale YAML nesting budget exceeded");
    }
    return total + bytes;
  }
  // JSON·코드 리터럴: 구분자를 세되 **따옴표 안과 주석은 뺀다.** 번역 값에 든 `[` 101자는
  // 구조가 아니라 문자열이고, 그것을 구조로 세면 멀쩡한 리포가 `resource-limit`으로 거부된다.
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  const json = path.endsWith(".json");
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; i++; } continue; }
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
    } else if (char === '"' || (!json && (char === "'" || char === "`"))) quote = char;
    else if (!json && char === "/" && next === "/") lineComment = true;
    else if (!json && char === "/" && next === "*") { blockComment = true; i++; }
    else if (char === "{" || char === "[" || (!json && char === "(")) {
      if (++depth > 100) fail("locale nesting budget exceeded");
    } else if (char === "}" || char === "]" || (!json && char === ")")) depth = Math.max(0, depth - 1);
  }
  return total + bytes;
}
