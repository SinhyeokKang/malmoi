import type { Adapter, DetectedFormat, LocaleEntry } from "../types";

/**
 * **writer 계약을 어댑터마다 손으로 열거하지 않는다.**
 *
 * 전에는 `chromeLocales`·`jsonCatalog`를 테스트가 직접 이름으로 불렀다. 그래서 4번째 어댑터를
 * 추가하면 결정성 규칙을 하나도 안 지켜도 CI가 green이었다 — 규칙에 주인이 없었다.
 * 여기서 규칙을 한 번 적고 `ADAPTERS`를 순회해 전부에 돌린다.
 *
 * ⚠️ **규칙이 전 어댑터 공통이 아니다.** `writeStrategy`로 갈린다 (ARCHITECTURE §1.1·§1.4).
 * `layout`이 아니다 — `yaml-catalog`·`code-dict`가 `per-locale`인데 수술적이다.
 *
 * | 규칙 | `regenerate` (재생성) | `surgical` (수술적 치환) |
 * |---|---|---|
 * | 2칸·끝 개행 1개 | 검사 | **비적용** — 원본 보존이 이 방식의 요지다 |
 * | `order`가 있으면 그 순서 | 검사 | **비적용** — 원본이 이미 순서를 갖고 있다 |
 * | `order`가 없으면 코드 유닛 순 | 검사 | **비적용** |
 * | orphaned | 출력에서 뺀다 | **원본 값이 남는다** (지우면 코드가 참조하는 키가 사라진다) |
 * | 빈 값 | 어댑터가 뺀다 | **호출부 계약** — 어댑터는 거르지 않는다 |
 * | **배열 위치가 아니라 `order`에만** 의존·재실행 동일 | 검사 | 검사 |
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

/** 수술적 치환 어댑터가 쓸 원본. 키가 원본에 있어야 치환 경로를 밟는다. */
function yamlSource(keys: readonly string[]): string {
  return [
    "# 사람이 넣은 주석 — 보존돼야 한다",
    ...keys.map((k) => `${JSON.stringify(k)}: ${JSON.stringify(srcVal(k))}`),
    `${JSON.stringify(ORPHAN_KEY)}: ${JSON.stringify(ORPHAN_SOURCE_VALUE)}`,
    "",
  ].join("\n");
}

/** `code-dict`(로케일당 파일 하나)의 원본. */
function codeSource(keys: readonly string[]): string {
  return [
    "// 사람이 넣은 주석 — 보존돼야 한다",
    "export default {",
    ...keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(srcVal(k))},`),
    `  ${JSON.stringify(ORPHAN_KEY)}: ${JSON.stringify(ORPHAN_SOURCE_VALUE)},`,
    "}",
    "",
  ].join("\n");
}

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

/**
 * 어댑터마다 유효한 `DetectedFormat`. **수술적 치환 어댑터는 원본 파일이 필수다** (§1.4).
 *
 * ⚠️ 원본이 필요한지는 `layout`이 아니라 `writeStrategy`가 정한다 — `yaml-catalog`·`code-dict`가
 * `per-locale`인데 수술적이다.
 */
export function formatFor(adapter: Adapter, keys: readonly string[] = CONTRACT_KEYS): DetectedFormat {
  switch (adapter.name) {
    case "ts-dict":
      return {
        adapter: adapter.name,
        pathTemplate: "src/i18n/ns/*.ts",
        locales: ["ko", "en"],
        currentFiles: [{ path: "src/i18n/ns/a.ts", content: tsSource(keys) }],
      };
    case "yaml-catalog":
      return {
        adapter: adapter.name,
        pathTemplate: "config/locales/{locale}.yml",
        locales: ["en"],
        currentFiles: [{ path: "config/locales/en.yml", content: yamlSource(keys) }],
      };
    case "code-dict":
      return {
        adapter: adapter.name,
        pathTemplate: "src/locale/{locale}.ts",
        locales: ["en"],
        currentFiles: [{ path: "src/locale/en.ts", content: codeSource(keys) }],
      };
    case "chrome-locales":
      return { adapter: adapter.name, pathTemplate: "public/_locales/{locale}/messages.json", locales: ["en"] };
    case "json-catalog":
      return { adapter: adapter.name, pathTemplate: "i18n/{locale}.json", locales: ["en"] };
  }
}

const entriesFor = (keys: readonly string[]): LocaleEntry[] => keys.map((k) => ({ key: k, message: val(k) }));

/**
 * **파일에서의 순서를 흉내 낸 배치** — 코드 유닛 순과 일부러 다르게 골랐다.
 *
 * 같으면 `order`를 통째로 무시하는 writer도 정렬 검사를 통과한다. 두 순서가 달라야 그 writer가
 * 잡힌다 (`contract.test.ts`의 `ignoreOrder` 네거티브).
 */
export const CONTRACT_FILE_ORDER = ["z", "1", "ä", "B", "a", "_x", "b", "Z", "A"] as const;

/** `CONTRACT_KEYS`와 같은 키·값에 `order`만 실은 엔트리. 배열 순서는 order와 같게 둔다. */
const orderedEntriesFor = (): LocaleEntry[] =>
  CONTRACT_FILE_ORDER.map((k, i) => ({ key: k, message: val(k), order: i }));

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
  const surgical = adapter.writeStrategy === "surgical";
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
  // `order`를 실어도 같아야 한다 — 순서는 **배열 위치가 아니라 필드**로 나른다는 계약이다.
  const ordered = write(orderedEntriesFor());
  if (ordered !== null && write([...orderedEntriesFor()].reverse()) !== ordered) {
    bad.push("입력 순서 무관: order를 실은 배열을 뒤집었더니 출력이 달라졌다 (배열 위치에 의존한다)");
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

  if (surgical) {
    // 수술적 치환은 원본 보존이 요지다 — 정렬·2칸·끝 개행·빈 값 필터를 적용하지 않는다.
    // **`layout`이 아니라 `writeStrategy`로 갈린다** — yaml-catalog가 per-locale인데 여기로 온다.
    if (withOrphan !== null && !withOrphan.includes(ORPHAN_SOURCE_VALUE)) {
      bad.push("orphaned 키의 원본 값을 지웠다 — 수술적 치환은 파일에 남겨야 한다 (§1.4)");
    }
    if (!plain.includes("사람이 넣은 주석")) bad.push("원본 주석을 잃었다 (수술적 치환의 존재 이유다)");
    // **`order`가 닿으면 회귀다.** 수술적 치환은 원본 순서를 그대로 두므로 order를 줘도 출력이
    // 같아야 한다 — 달라졌다면 이 방식이 재생성 규칙을 밟기 시작한 것이다.
    if (ordered !== plain) {
      bad.push("order를 줬더니 출력이 달라졌다 — 수술적 치환은 원본 순서를 지켜야 한다 (§1.4)");
    }
    return bad;
  }

  // ── per-locale(재생성) 전용 ────────────────────────────────────────
  // ① 폴백 경로 — `order`가 없으면 지금까지의 규칙 그대로다.
  const positions = CODEPOINT_ORDER.map((k) => at(plain, k));
  if (positions.some((p) => p === -1)) {
    bad.push("정렬: 출력에서 찾을 수 없는 키가 있다");
  } else if (positions.some((p, i) => i > 0 && p < positions[i - 1]!)) {
    bad.push("정렬: order가 없을 때 코드 유닛(`<`) 오름차순이 아니다 — localeCompare를 쓰면 ICU 빌드에 묶인다");
  }
  // ② order 경로 — 있으면 **그 순서**다. 첫 pull PR이 파일을 재정렬하지 않는다는 것의 정의다.
  if (ordered === null) {
    bad.push("order: 정상 입력에 null을 냈다");
  } else {
    const orderPos = CONTRACT_FILE_ORDER.map((k) => at(ordered, k));
    if (orderPos.some((p) => p === -1)) {
      bad.push("order: 출력에서 찾을 수 없는 키가 있다");
    } else if (orderPos.some((p, i) => i > 0 && p < orderPos[i - 1]!)) {
      bad.push("order: LocaleEntry.order 순서를 따르지 않는다 — 원본 키 순서가 보존되지 않는다");
    }
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
