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
 *
 * **키 집합은 `CONTRACT_KEYS`와 같아야 한다** — 수술적 치환 writer는 원본에 없는 키를 삽입하므로,
 * 키가 하나라도 다르면 `order` 유무가 아니라 키 집합 때문에 출력이 달라진다.
 */
export const CONTRACT_FILE_ORDER = ["z", "1", "ä", "B", "a", "_x", "b", "Z", "A"] as const;

/**
 * 위 배치에서 **순서를 실제로 검사할 수 있는** 키만.
 *
 * ⚠️ **`"1"`이 빠진다.** 정규 배열 인덱스 키는 JS 객체가 **숫자 오름차순으로 앞에 끌어올려**
 * 삽입 순서를 지우고 `JSON.stringify`가 그 순서를 그대로 낸다. 직렬화를 직접 짜지 않는 한 어떤
 * writer도 못 이기므로, 규칙에 넣으면 통과 불가능한 검사가 된다. 알려진 한계이고 spec 비목표에
 * 있다: "정수형 키의 순서 보존 — 원리적으로 보존 불가".
 */
const ORDER_CHECKABLE = CONTRACT_FILE_ORDER.filter((k) => k !== "1");

/** `CONTRACT_KEYS`와 같은 키·값에 `order`만 실은 엔트리. 배열 순서는 order와 같게 둔다. */
const orderedEntriesFor = (): LocaleEntry[] =>
  CONTRACT_FILE_ORDER.map((k, i) => ({ key: k, message: val(k), order: i }));

/**
 * 재생성 어댑터에 줄 **4칸 스타일 기증자**. 표현만 읽고 값은 절대 안 읽는다는 것을 검사하려고
 * 원본에 센티넬 값을 심는다. 수술적 어댑터는 자기 원본이 이미 있으므로 `undefined`다.
 */
export const STYLE_DONOR_VALUE = "STYLE_DONOR_VALUE_MUST_NOT_LEAK";

function fourSpaceDonor(adapter: Adapter): DetectedFormat | undefined {
  if (adapter.writeStrategy !== "regenerate") return undefined;
  const fmt = formatFor(adapter);
  const path = fmt.pathTemplate.replace("{locale}", "en");
  const body =
    adapter.name === "chrome-locales"
      ? `{\n    "donor": {\n        "message": ${JSON.stringify(STYLE_DONOR_VALUE)}\n    }\n}\n`
      : `{\n    "donor": ${JSON.stringify(STYLE_DONOR_VALUE)}\n}\n`;
  return { ...fmt, currentFiles: [{ path, content: body }] };
}

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
    adapter.write(f, { locale, entries });

  const plain = write(entriesFor(CONTRACT_KEYS));
  if (plain === null) {
    return [`정상 입력에 null을 냈다 — 낼 항목이 있는데 파일을 내지 않는다`];
  }

  // ── 모든 layout 공통 ───────────────────────────────────────────────
  if (write(entriesFor(CONTRACT_KEYS)) !== plain) {
    bad.push("결정성: 같은 입력을 두 번 써서 다른 바이트가 나왔다");
  }
  // **write∘write 고정점.** 1차 출력을 원본으로 다시 쓰면 바이트가 같아야 한다 — 깨지면 야간 cron이
  // 매일 "변경됨"을 뱉어 빈 커밋을 쌓는다. 결정성(같은 입력 → 같은 출력)과 다른 성질이다:
  // 여기서는 **입력의 원본이 바뀐다** (2026-09-04 audit #23).
  {
    const path = fmt.currentFiles?.[0]?.path ?? fmt.pathTemplate.replaceAll("{locale}", locale);
    const second = write(entriesFor(CONTRACT_KEYS), { ...fmt, currentFiles: [{ path, content: plain }] });
    if (second !== plain) bad.push("고정점: 1차 출력을 원본으로 다시 썼더니 바이트가 달라졌다");
  }
  // **원본이 없을 때의 계약.** 수술적은 치환할 대상이 없어 null, 재생성은 기본값으로 계속 만든다 —
  // 이 갈림이 뒤섞이면 새 로케일이 PR에서 조용히 빠지거나 수술적 어댑터가 없던 파일을 만든다.
  {
    const bare = { ...fmt, currentFiles: undefined };
    const without = write(entriesFor(CONTRACT_KEYS), bare);
    if (surgical && without !== null) bad.push("원본 없이 파일을 만들었다 — 수술적 치환은 치환할 대상이 없으면 null이어야 한다 (§1.4)");
    if (!surgical && without === null) bad.push("원본이 없다고 null을 냈다 — 재생성은 원본 없이도 파일을 만들어야 한다 (신규 로케일)");
  }
  // **삽입 경로.** 픽스처 원본이 계약 키를 전부 담고 있어 지금까지 "없는 키를 넣는" 자리(§1.1의 여섯
  // 지점 #5)를 어느 어댑터도 밟지 않았다. 원본을 한 키 빼고 만들어 그 키가 출력에 나타나는지 본다.
  {
    const [insertKey, ...restKeys] = CONTRACT_KEYS;
    if (insertKey !== undefined) {
      const narrow = formatFor(adapter, restKeys);
      const inserted = write(entriesFor(CONTRACT_KEYS), narrow);
      // ⚠️ `ts-dict`는 **문서화된 예외**다 — 삽입 지점을 고르는 규칙이 파일 형태에 의존해 이득 없이
      // 위험만 늘고, bugshot-2는 세 로케일이 한 파일에 나란히 있어 키 격차가 구조적으로 안 생긴다
      // (ARCHITECTURE §1.4 "없는 키를 삽입한다 — ts-dict는 예외다"). 그 예외를 양방향으로 고정한다:
      // 삽입하기 시작하면 그것도 계약 변경이라 여기서 빨개져야 한다.
      const inserts = adapter.name !== "ts-dict";
      const appeared = inserted !== null && inserted.includes(val(insertKey));
      if (inserts && !appeared) bad.push(`삽입: 원본에 없던 키 ${insertKey}가 출력에 나타나지 않았다 (§1.1 여섯 지점 #5)`);
      if (!inserts && appeared) bad.push(`삽입: ${adapter.name}는 삽입하지 않는 것이 계약인데 원본에 없던 키가 나타났다 (§1.4)`);
    }
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

  // **`writeWithErrors`를 구현했으면 `write`와 갈라지지 않는다.** 한쪽만 고치면 프로덕션(pull)과
  // 측정(survey)이 서로 다른 함수를 부르게 되고, 그게 정확히 이 리포가 밟은 함정이다.
  if (adapter.writeWithErrors !== undefined) {
    const res = adapter.writeWithErrors(fmt, { locale, entries: entriesFor(CONTRACT_KEYS) });
    if (res.content !== plain) bad.push("writeWithErrors의 content가 write와 다르다 — 한쪽만 고치면 갈린다");
    if (res.errors.length > 0) {
      bad.push(`정상 입력에 write 에러를 냈다: ${res.errors.map((e) => e.code).join(" / ")}`);
    }
  }

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
    // **값이 안 바뀌면 원본 바이트 그대로다.** 이 검사가 없으면 재직렬화가 들여쓰기·줄 접기를
    // 바꿔도 계약이 통과한다 — `yaml-catalog`가 정확히 그 상태였다 (2026-09-04 audit #4).
    const source = fmt.currentFiles?.[0]?.content;
    const unchanged = write(CONTRACT_KEYS.map((k) => ({ key: k, message: srcVal(k) })));
    if (source !== undefined && unchanged !== source) {
      bad.push("값이 안 바뀌었는데 원본 바이트를 그대로 돌려주지 않았다 — 재직렬화가 표현을 바꾼다 (§1.4)");
    }
    // **버린 항목을 보고할 통로가 있어야 한다.** 수술적 치환은 키 단위로 건너뛰는 자리가 여럿이다
    // (비리터럴·알리아스·맵 자리·로케일 객체 부재). 조용히 버리면 어느 키를 잃었는지 모른다 (§1.35).
    if (adapter.writeWithErrors === undefined) {
      bad.push("writeWithErrors를 구현하지 않았다 — 버린 항목을 보고할 통로가 없다 (§1.35)");
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
    const orderPos = ORDER_CHECKABLE.map((k) => at(ordered, k));
    if (orderPos.some((p) => p === -1)) {
      bad.push("order: 출력에서 찾을 수 없는 키가 있다");
    } else if (orderPos.some((p, i) => i > 0 && p < orderPos[i - 1]!)) {
      bad.push("order: LocaleEntry.order 순서를 따르지 않는다 — 원본 키 순서가 보존되지 않는다");
    }
  }
  // ⚠️ **"원본을 안 주면 2칸"이다.** 이 기능(원본 포맷 보존) 뒤로 재생성 writer는 원본이 있으면
  // 그 폭을 따르므로, 조건 없이 2칸을 단언하면 개선 자체가 위반으로 잡힌다. 단언을 **지우지 않고
  // 조건으로 좁히는 것**이 요지다 — 재생성은 원본 없이도 파일을 만들어야 한다(신규 로케일 파일).
  const unit = indentUnit(plain);
  if (unit !== 2) bad.push(`들여쓰기: 원본이 없으면 2칸이어야 하는데 ${unit ?? "없음"}칸이다`);

  // **원본을 주면 그 폭을 따른다.** 값은 절대 읽지 않는다 — 아래 센티넬이 그것을 강제한다.
  const donor = fourSpaceDonor(adapter);
  if (donor !== undefined) {
    const styled = adapter.write(donor, {
      locale,
      entries: entriesFor(CONTRACT_KEYS),
    });
    if (styled === null) {
      bad.push("원본을 줬더니 null을 냈다 — 재생성은 원본과 무관하게 파일을 만들어야 한다");
    } else {
      const styledUnit = indentUnit(styled);
      if (styledUnit !== 4) {
        bad.push(`들여쓰기: 4칸 원본을 줬는데 ${styledUnit ?? "없음"}칸이 나왔다 (표현을 원본에서 안 읽는다)`);
      }
      if (styled.includes(STYLE_DONOR_VALUE)) {
        bad.push("원본의 **값**이 출력에 새어 나왔다 — 원본에서 읽는 것은 표현뿐이다 (병합 없음)");
      }
    }
  }
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
