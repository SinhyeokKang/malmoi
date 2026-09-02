import type { Adapter, DetectedFormat, LocaleEntry } from "../types";

/**
 * **writer 계약을 어댑터마다 손으로 열거하지 않는다.**
 *
 * 전에는 `chromeLocales`·`jsonCatalog`를 테스트가 직접 이름으로 불렀다. 그래서 4번째 어댑터를
 * 추가하면 결정성 규칙을 하나도 안 지켜도 CI가 green이었다 — 규칙에 주인이 없었다.
 * 여기서 규칙을 한 번 적고 `ADAPTERS`를 순회해 전부에 돌린다.
 *
 * ⚠️ **규칙이 전 어댑터 공통이 아니다.** `layout`으로 갈린다 (ARCHITECTURE §1.1·§1.4):
 *
 * | 규칙 | `per-locale` (재생성) | `multi-locale` (수술적 치환) |
 * |---|---|---|
 * | 정렬·2칸·끝 개행 1개 | 검사 | **비적용** — 원본 보존이 이 방식의 요지다 |
 * | orphaned | 출력에서 뺀다 | **원본 값이 남는다** (지우면 코드가 참조하는 키가 사라진다) |
 * | 빈 값 | 어댑터가 뺀다 | **호출부 계약** — 어댑터는 거르지 않는다 |
 * | 입력 순서 무관·재실행 동일 | 검사 | 검사 |
 * | orphaned의 **DB 값**이 출력에 안 나온다 | 검사 | 검사 |
 *
 * 마지막 줄이 두 방식을 잇는 유일한 공통 서술이다 — "뺀다"가 아니라 "DB 값이 새지 않는다"로
 * 적어야 수술적 치환에서도 참이 된다.
 *
 * **위반을 던지지 않고 문자열로 모아 돌려준다.** 그래야 규칙을 어기는 가짜 어댑터를 넣어
 * "이 헬퍼가 실제로 잡는가"를 테스트할 수 있다 (`contract.test.ts`의 네거티브 블록).
 */

/** 코드포인트 순서: 1 A B Z _x a b z ä  (localeCompare는 _x 1 a A ä b B z Z — 완전히 다르다) */
export const CONTRACT_KEYS = ["a", "A", "ä", "_x", "B", "b", "z", "Z", "1"] as const;
export const CODEPOINT_ORDER = ["1", "A", "B", "Z", "_x", "a", "b", "z", "ä"] as const;

/**
 * DB에서 오는 값. 키와 겹치지 않게 만든다 — 출력에서 `"키"`를 찾을 때 값에 걸리면 안 된다.
 *
 * **원본 값(`srcVal`)과 다른 문자열이어야 한다.** 같으면 수술적 치환 writer가 "바뀐 게 없다"며
 * 원본을 그대로 돌려주고, 치환 경로를 한 줄도 안 밟은 채 계약 검사가 전부 통과한다.
 */
const val = (key: string) => `V_${key}`;
/** `multi-locale` 원본 파일에 처음부터 들어 있는 값. */
const srcVal = (key: string) => `S_${key}`;

/** orphaned 키의 DB 값. 이 문자열이 출력에 나타나면 곧 유출이다. */
export const ORPHAN_DB_VALUE = "ORPHAN_DB_VALUE_MUST_NOT_LEAK";
export const ORPHAN_KEY = "b_gone";
/** 수술적 치환 어댑터의 원본에 남아 있어야 하는 값. */
export const ORPHAN_SOURCE_VALUE = "ORPHAN_SOURCE_VALUE_STAYS";

/** `multi-locale` 어댑터의 원본 파일을 만든다 — 치환 대상이 원본에 있어야 한다. */
function tsSource(keys: readonly string[]): string {
  const body = () =>
    [
      ...keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(srcVal(k))},`),
      `  ${JSON.stringify(ORPHAN_KEY)}: ${JSON.stringify(ORPHAN_SOURCE_VALUE)},`,
    ].join("\n");
  return [
    "// 사람이 넣은 주석 — 보존돼야 한다",
    "const ko = {",
    body(),
    "} as const;",
    "",
    "const en = {",
    body(),
    "} satisfies Bundle;",
    "",
    "export const ns = { ko, en };",
    "",
  ].join("\n");
}

/** 어댑터마다 유효한 `DetectedFormat`. `multi-locale`은 원본 파일이 필수다 (§1.4). */
export function formatFor(adapter: Adapter, keys: readonly string[] = CONTRACT_KEYS): DetectedFormat {
  switch (adapter.layout) {
    case "multi-locale":
      return {
        adapter: adapter.name,
        pathTemplate: "src/i18n/ns/*.ts",
        locales: ["ko", "en"],
        currentFiles: [{ path: "src/i18n/ns/a.ts", content: tsSource(keys) }],
      };
    case "per-locale":
      return {
        adapter: adapter.name,
        // 어댑터별 실제 경로 모양 — read를 부르지 않으므로 write에는 영향이 없다.
        pathTemplate:
          adapter.name === "chrome-locales" ? "public/_locales/{locale}/messages.json" : "i18n/{locale}.json",
        locales: ["en"],
      };
  }
}

const entriesFor = (keys: readonly string[]): LocaleEntry[] => keys.map((k) => ({ key: k, message: val(k) }));

/** 출력에서 `"key"` 토큰이 처음 나오는 위치. 없으면 -1. */
const at = (out: string, key: string) => out.indexOf(JSON.stringify(key));

/** 들여쓰기 단위 — 0이 아닌 최소 선행 공백 수. 4칸 들여쓰기면 4가 나온다. */
function indentUnit(out: string): number | undefined {
  const widths = out
    .split("\n")
    .map((line) => /^( *)\S/.exec(line)?.[1]?.length ?? 0)
    .filter((n) => n > 0);
  return widths.length === 0 ? undefined : Math.min(...widths);
}

/**
 * 한 어댑터의 writer 계약 위반을 전부 모아 돌려준다. 빈 배열 = 통과.
 *
 * `locale`은 `multi-locale`에서 원본의 로케일 객체 하나를 고르는 값이다 — `per-locale`은 무시한다.
 */
export function writerContractViolations(adapter: Adapter): string[] {
  const bad: string[] = [];
  const fmt = formatFor(adapter);
  const locale = adapter.layout === "multi-locale" ? "ko" : "en";
  const write = (entries: readonly LocaleEntry[], f: DetectedFormat = fmt) =>
    adapter.write(f, { locale, isBase: true, entries });

  const plain = write(entriesFor(CONTRACT_KEYS));
  if (plain === null) {
    return [`정상 입력에 null을 냈다 — 낼 항목이 있는데 파일을 내지 않는다`];
  }

  // ── 모든 layout 공통 ───────────────────────────────────────────────
  if (write(entriesFor(CONTRACT_KEYS)) !== plain) {
    bad.push("결정성: 같은 입력을 두 번 써서 다른 바이트가 나왔다");
  }
  if (write(entriesFor([...CONTRACT_KEYS].reverse())) !== plain) {
    bad.push("입력 순서 무관: 순서를 뒤집었더니 출력이 달라졌다 (DB 순서에 의존한다)");
  }
  const withOrphan = write([
    ...entriesFor(CONTRACT_KEYS),
    { key: ORPHAN_KEY, message: ORPHAN_DB_VALUE, orphaned: true },
  ]);
  if (withOrphan !== null && withOrphan.includes(ORPHAN_DB_VALUE)) {
    bad.push("orphaned 키의 DB 값이 출력에 새어 나왔다");
  }
  // 값이 실제로 반영됐는가. 이게 없으면 입력을 통째로 무시하는 writer도 위 검사를 다 통과한다.
  const missing = CONTRACT_KEYS.filter((k) => !plain.includes(val(k)));
  if (missing.length > 0) bad.push(`DB 값이 출력에 반영되지 않았다: ${missing.join(", ")}`);

  if (adapter.layout === "multi-locale") {
    // 수술적 치환은 원본 보존이 요지다 — 정렬·2칸·끝 개행·빈 값 필터를 적용하지 않는다.
    if (withOrphan !== null && !withOrphan.includes(ORPHAN_SOURCE_VALUE)) {
      bad.push("orphaned 키의 원본 값을 지웠다 — 수술적 치환은 파일에 남겨야 한다 (§1.4)");
    }
    if (!plain.includes("사람이 넣은 주석")) bad.push("원본 주석을 잃었다 (수술적 치환의 존재 이유다)");
    return bad;
  }

  // ── per-locale(재생성) 전용 ────────────────────────────────────────
  const positions = CODEPOINT_ORDER.map((k) => at(plain, k));
  if (positions.some((p) => p === -1)) {
    bad.push("정렬: 출력에서 찾을 수 없는 키가 있다");
  } else if (positions.some((p, i) => i > 0 && p < positions[i - 1]!)) {
    bad.push("정렬: 코드포인트(`<`) 오름차순이 아니다 — localeCompare를 쓰면 ICU 빌드에 묶인다");
  }
  const unit = indentUnit(plain);
  if (unit !== 2) bad.push(`들여쓰기: 2칸이어야 하는데 ${unit ?? "없음"}칸이다`);
  if (!plain.endsWith("\n")) bad.push("파일 끝 개행이 없다");
  if (plain.endsWith("\n\n")) bad.push("파일 끝 개행이 2개 이상이다");

  if (withOrphan !== null && at(withOrphan, ORPHAN_KEY) !== -1) {
    bad.push("orphaned 키가 출력에 남았다 — 재생성 writer는 빼야 한다");
  }
  const withEmpty = write([{ key: "a_x", message: "" }, ...entriesFor(CONTRACT_KEYS)]);
  if (withEmpty !== null && at(withEmpty, "a_x") !== -1) {
    bad.push("빈 문자열을 미번역으로 취급해 빼지 않았다");
  }
  if (write([{ key: "only", message: "", orphaned: false }]) !== null) {
    bad.push("낼 항목이 0개인데 null을 내지 않았다 — 빈 파일은 '이 로케일 지원함'으로 읽힌다");
  }
  if (write([{ key: "only", message: "V", orphaned: true }]) !== null) {
    bad.push("남은 키가 orphaned뿐인데 null을 내지 않았다");
  }
  return bad;
}
