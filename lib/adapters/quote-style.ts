/**
 * 수술적 치환 어댑터(`code-dict`·`ts-dict`)가 **원본의 인용 부호를 유지**하기 위한 헬퍼.
 *
 * 두 어댑터 모두 편집된 값을 `JSON.stringify`로 써서 **항상 큰따옴표**가 됐다. 값은 정확하니
 * 왕복 테스트가 전부 green이었고, 실물 PR에서야 드러났다 — 작은따옴표 리포에서 **편집한 줄만**
 * 부호가 튄다 (2026-09-03 `i18n-format-check` PR #2). Prettier `singleQuote: true`나 ESLint
 * `quotes`가 걸린 리포에서는 그 PR이 lint를 깨뜨리므로, 도구를 붙이는 데 실질 장벽이 된다.
 *
 * 수술적 치환의 계약은 "원본 구조 보존"이고 인용 부호는 그 구조의 일부다 (ARCHITECTURE §1.4).
 *
 * ⚠️ **이스케이프 안전성은 계속 `JSON.stringify`가 진다.** ts-morph의 `setLiteralValue`는
 * 이스케이프를 하지 않아 백슬래시·개행·따옴표가 재파싱에서 깨진다(실측: `a"b\c\nd` → `a"bcd`).
 * 여기서는 그 결과를 **다른 인용 부호로 옮기기만** 한다 — 이스케이프 규칙을 새로 쓰지 않는다.
 */

export type Quote = "'" | '"';

/**
 * 값을 주어진 인용 부호의 유효한 JS 문자열 리터럴로 만든다.
 *
 * 작은따옴표로 옮길 때 뒤집을 것은 **두 문자뿐**이다: `"`는 그 자리에서 평범한 문자라 이스케이프를
 * 풀고, `'`는 감싸는 부호가 되므로 잠근다. 백슬래시(`\\`)와 개행(`\n`)은 두 부호에서 이스케이프가
 * 동일해 손대지 않는다 — 그래서 `JSON.stringify`의 안전성이 그대로 넘어온다.
 */
export function quoteLiteral(value: string, quote: Quote): string {
  const json = JSON.stringify(value);
  if (quote === '"') return json;
  const inner = json.slice(1, -1).replaceAll('\\"', '"').replaceAll("'", "\\'");
  return `'${inner}'`;
}

/**
 * 리터럴 원문들의 다수 인용 부호. **새로 삽입되는 번역 값**이 쓸 부호다 — 호출자가 카탈로그의
 * 번역 값만 넘긴다. 키·import 등 다른 문자열까지 세면 값의 관용이 뒤집힐 수 있다.
 *
 * 노드가 아니라 **원문 문자열 배열**을 받는다 — I/O도 ts-morph 의존도 없는 순수 함수여야
 * 테스트가 가능하다 (CLAUDE.md 코드 컨벤션).
 *
 * 동수나 0개면 큰따옴표다. 기존 동작(`JSON.stringify`)과 같은 쪽으로 떨어뜨려, 판정이 애매할 때
 * 파일이 흔들리지 않게 한다. 백틱은 우리가 쓸 수 있는 부호가 아니라 세지 않는다.
 */
export function dominantQuote(literals: readonly string[]): Quote {
  let single = 0;
  let double = 0;
  for (const text of literals) {
    if (text.startsWith("'")) single += 1;
    else if (text.startsWith('"')) double += 1;
  }
  return single > double ? "'" : '"';
}

/** 리터럴 노드의 원문에서 인용 부호를 읽는다. 원문이 비었거나 백틱이면 큰따옴표로 떨어진다. */
export function quoteOf(literalText: string): Quote {
  return literalText.startsWith("'") ? "'" : '"';
}
