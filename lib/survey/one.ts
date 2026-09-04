import { adapterFor, compareKeys, matchGlobPaths } from "../adapters";
import type { AdapterFile, DetectedFormat, LocaleEntry, ReadLocale, ReadResult } from "../adapters/types";
import { changedHunks, roundtripDiffRatio, usedApproximation } from "./diff";
import { jsonShape, sameCommonOrder, type JsonDiffCauses, type JsonShape } from "./json-shape";
import { pickBaseLocale } from "../push/payload";
import { candidatesFor } from "./merge";
import { median } from "./stats";
import { tsShape } from "./ts-shape";
import {
  emptyChromeFields,
  emptyJsonPresentation,
  emptyDiffCauses,
  emptyErrors,
  type ReadErrorKind,
  type RepoSurvey,
  type Roundtrip,
  type SeparatorCounts,
  type SurveyCandidate,
  type SurveyInput,
} from "./types";

/**
 * 리포 하나의 판정 전체. **파일 내용을 인자로 받으므로 네트워크·디스크가 없다** — 픽스처로
 * 완전히 테스트된다.
 *
 * 어댑터 호출을 전부 `try`로 감싼다. `ts-dict`의 `read`·`write`는 `createSourceFile`을 감싸지
 * 않아 파싱 실패가 그대로 전파되고, `ReadResult.errors`에는 나타나지 않는다 — 계약의 공백을
 * 실험 쪽에서 흡수한다. 이 경계가 "실패한 리포 하나가 전체를 멈추지 않는다"의 실제 구현 지점이다.
 */

const ICU_PLURAL = /\{\s*[\w.]+\s*,\s*(plural|select|selectordinal)\s*,/;
const PLACEHOLDER = /\{[\w.]+\}/;

export function surveyOne(input: SurveyInput): RepoSurvey {
  const started = Date.now();
  // **생산자에 타입을 명시한다** — 리터럴로 조립하면 지표를 늘려도 컴파일러가 침묵한다
  // (docs/POSTMORTEM.md 2026-08-31).
  const survey: RepoSurvey = {
    repo: input.repo,
    fileCount: input.paths.length,
    selectedFileCount: input.files.size,
    truncated: input.truncated ?? false,
    candidates: [],
    localeCount: 0,
    keyCount: 0,
    errors: emptyErrors(),
    keyCollisions: 0,
    silentSkips: 0,
    writeErrors: 0,
    roundtrip: { semantic: "not-run", byteFixpoint: "not-run" },
    diffApproximate: false,
    localeOrderCompared: 0,
    diffCauses: emptyDiffCauses(),
    chromeFields: emptyChromeFields(),
    presentation: emptyJsonPresentation(),
    separators: { dot: 0, underscore: 0, colon: 0, slash: 0, none: 0 },
    icuPluralKeys: 0,
    placeholderKeys: 0,
    configFiles: [...input.configFiles],
    ms: 0,
  };
  if (input.failure !== undefined) {
    survey.failure = input.failure;
    survey.ms = Date.now() - started;
    return survey;
  }

  const probe = (p: string) => input.files.get(p);
  const found = candidatesFor(input.paths, probe);
  survey.candidates = found.map(toCandidate);
  const chosen = found[0];
  if (chosen === undefined) {
    survey.ms = Date.now() - started;
    return survey;
  }
  survey.chosen = toCandidate(chosen);

  const adapter = adapterFor(chosen);
  const adapterFiles = filesForFormat(chosen, input);

  let read1: ReadResult;
  try {
    read1 = adapter.read(chosen, adapterFiles);
  } catch (cause) {
    survey.errors["adapter-threw"] += 1;
    survey.failure = `read가 던졌다: ${(cause as Error).message}`;
    survey.ms = Date.now() - started;
    return survey;
  }
  for (const e of read1.errors) survey.errors[classify(e.message)] += 1;

  const allKeys = new Set<string>();
  for (const loc of read1.locales) {
    survey.keyCollisions += duplicateCount(loc, read1.nested);
    for (const e of loc.entries) allKeys.add(e.key);
  }
  survey.localeCount = read1.locales.length;
  survey.keyCount = allKeys.size;
  survey.separators = countSeparators(allKeys);
  countMessages(read1.locales, survey);
  observeShape(survey, chosen, adapter.name, input, read1.locales.map((l) => l.locale));

  // 코드 딕셔너리 계열 — "읽힌 키 수 vs 파일의 문자열 리터럴 수" 격차가 부분 읽기의 그물이다.
  //
  // ⚠️ **`silentSkips`는 `ts-dict`에서만 0이 아니다.** `code-dict`는 shorthand·비리터럴 값을
  // `read`가 `errors`로 보고하므로(그게 개선점이다) 무증상 skip이 구조적으로 생기지 않는다.
  // `ts-dict`는 자동 탐지에서 빠졌으니 실측 표본에서 이 카운터는 사실상 항상 0이다.
  if (adapter.name === "ts-dict" || adapter.name === "code-dict") {
    const shape = tsShape(adapterFiles);
    if (adapter.name === "ts-dict") survey.silentSkips = shape.silentSkips;
    survey.literalCount = shape.literalCount;
    survey.readKeyCount = allKeys.size;
    survey.errors["adapter-threw"] += shape.parseFailures;
  }

  // write는 read가 관측한 중첩 여부를 알아야 같은 모양으로 되돌린다 (ARCHITECTURE §1.3).
  // 파일별 관측값도 넘긴다 — 프로덕션(push→Project→pull)이 그것을 나르므로 측정도 같아야 한다.
  const fmt: DetectedFormat = {
    ...chosen,
    nested: read1.nested,
    ...(read1.nestedByPath === undefined ? {} : { nestedByPath: read1.nestedByPath }),
  };
  try {
    applyRoundtrip(survey, adapter.layout, fmt, read1, adapterFiles, input);
  } catch (cause) {
    survey.errors["adapter-threw"] += 1;
    survey.roundtrip = { semantic: "not-run", byteFixpoint: "not-run" };
    survey.failure = `write가 던졌다: ${(cause as Error).message}`;
  }

  survey.ms = Date.now() - started;
  return survey;
}

const toCandidate = (f: DetectedFormat): SurveyCandidate => ({
  adapter: f.adapter,
  pathTemplate: f.pathTemplate,
  locales: [...f.locales].sort(compareKeys),
});

/** push와 **같은 판정**을 쓴다 — 여기서 다르게 고르면 측정이 프로덕션과 다른 base를 잰다. */
const pickBase = pickBaseLocale;

/** 1순위 후보가 가리키는 파일들을 골라온다. `layout`에 따라 규칙이 다르다. */
function filesForFormat(fmt: DetectedFormat, input: SurveyInput): AdapterFile[] {
  const out: AdapterFile[] = [];
  if (fmt.pathTemplate.includes("{locale}")) {
    for (const locale of [...fmt.locales].sort(compareKeys)) {
      const path = fmt.pathTemplate.replace("{locale}", locale);
      const content = input.files.get(path);
      if (content !== undefined) out.push({ path, content });
    }
    return out;
  }
  // `multi-locale` — pathTemplate이 글롭이다. **push·pull과 같은 함수로 매칭한다** (2026-09-04):
  // 측정 층이 자기 규칙을 들면 프로덕션이 고르지 않는 파일을 재게 된다.
  for (const path of matchGlobPaths(fmt.pathTemplate, [...input.files.keys()])) {
    const content = input.files.get(path);
    if (content !== undefined) out.push({ path, content });
  }
  return out;
}

function classify(message: string): ReadErrorKind {
  // 파서가 셋이라(JSON·YAML·TypeScript) 같은 사건이 다른 문구로 온다. 문구를 놓치면 지표 ③이
  // `other`로 뭉개져 "무슨 값이라 못 읽었는지"가 사라진다 — 실측 4회차에서 272건이 그랬다.
  if (message.includes("JSON 파싱 실패") || message.includes("YAML 파싱 실패") || message.includes("구문 오류")) {
    return "json-parse";
  }
  if (message.includes("최상위가 객체가 아니다") || message.includes("최상위가 맵이 아니다")) {
    return "non-object-root";
  }
  if (message.includes("default export 객체 리터럴을 찾을 수 없다")) return "other";
  if (message.includes("값이 문자열이 아니다")) return "leaf-type";
  // YAML 중복 키 — json-catalog의 접두/중복 충돌과 같은 사건이라 같은 통에 넣는다.
  if (message.includes("중복 키다")) return "key-collision";
  if (message.includes("chrome.i18n이 허용하지 않는")) return "chrome-key";
  if (
    message.includes("문자열 리터럴이 아니다") ||
    // code-dict의 shorthand(import 참조)·비프로퍼티도 같은 계열이다 — `other`로 흘리면
    // 지표 ③에서 "무슨 값이라 못 읽었는지"가 사라진다.
    message.includes("shorthand라 값을 읽을 수 없다") ||
    message.includes("프로퍼티 대입이 아니다")
  ) {
    return "non-literal-value";
  }
  if (
    message.includes("문자열이나 객체/배열이 아니다") ||
    message.includes("객체가 아니다") ||
    message.includes("message 필드가 없다")
  ) {
    return "leaf-type";
  }
  return "other";
}

/**
 * 같은 로케일 안에서 키가 겹친 횟수 — **두 종류를 함께 센다.**
 *
 * 1. **정확한 중복** — `"a.b": "x"`와 `{"a":{"b":"y"}}`가 같은 평탄화 키를 낸다.
 *    `json-catalog`의 `flatten`이 중복을 검사하지 않아 둘 다 들어오고, write에서 하나가 사라진다.
 * 2. **접두 충돌** — 한 키가 다른 키의 **점 경계 접두**인 경우(`a.b`와 `a.b.c`). 평탄화 목록에서는
 *    서로 다른 키라 1번으로는 안 잡히는데, write의 `setDeep`이 `a.b`의 문자열 자리를 객체로
 *    조용히 갈아끼워 **한쪽 값이 사라진다.**
 *
 * ⚠️ **2번을 뒤늦게 추가했다.** 실측에서 왕복 의미 불일치 2건(siyuan 2636키 중 1개 손실,
 * musicblocks 84로케일 중 81개에서 각 4키 손실)이 났는데 `errors`도 0, 중복 카운터도 0이었다 —
 * **왕복이 잡은 손실을 지표 ③이 하나도 세지 못했다.** 뿌리는 하나다: `.`가 우리 조인 구분자이면서
 * 실제 키에 들어 있는 문자라 flatten/unflatten이 단사가 아니다.
 */
function duplicateCount(loc: ReadLocale, nested: boolean): number {
  const seen = new Set<string>();
  let dup = 0;
  for (const e of loc.entries) {
    if (seen.has(e.key)) dup += 1;
    else seen.add(e.key);
  }
  // ⚠️ 접두 충돌은 **중첩 복원이 도는 경우에만** 손실이 된다. flat write는 키를 쪼개지 않아
  // `a.b`와 `a.b.c`가 나란히 살아남는다. nested가 아닐 때 세면 있지도 않은 손실을 보고하게 된다.
  if (nested) {
    for (const key of seen) {
      for (const other of seen) {
        if (other.length > key.length && other.startsWith(`${key}.`)) {
          dup += 1;
          break;
        }
      }
    }
  }
  return dup;
}

function countSeparators(keys: ReadonlySet<string>): SeparatorCounts {
  const c: SeparatorCounts = { dot: 0, underscore: 0, colon: 0, slash: 0, none: 0 };
  for (const key of keys) {
    if (key.includes(":")) c.colon += 1;
    else if (key.includes(".")) c.dot += 1;
    else if (key.includes("/")) c.slash += 1;
    else if (key.includes("_")) c.underscore += 1;
    else c.none += 1;
  }
  return c;
}

/** ICU·치환자 빈도 — MVP §7 비범위라 **지원하지 않고 얼마나 흔한지만** 센다. */
function countMessages(locales: readonly ReadLocale[], survey: RepoSurvey): void {
  const icu = new Set<string>();
  const ph = new Set<string>();
  for (const loc of locales) {
    for (const e of loc.entries) {
      if (ICU_PLURAL.test(e.message)) icu.add(e.key);
      else if (PLACEHOLDER.test(e.message)) ph.add(e.key);
    }
  }
  survey.icuPluralKeys = icu.size;
  survey.placeholderKeys = ph.size;
}

/**
 * 원본 **텍스트** 관측 — 키 순서 일치율·들여쓰기·잔여 diff 원인
 * (`docs/features/key-order-preservation/` 태스크 0).
 *
 * ⚠️ **`read1`을 쓰지 않고 원본 파일을 다시 훑는다.** `read`가 엔트리를 정렬해 돌려주므로 파일
 * 순서가 거기서 사라진다 — 이 지표가 재려는 바로 그 값이다.
 *
 * JSON 텍스트를 내는 어댑터에서만 돈다. YAML·코드 딕셔너리는 이미 수술적이라 첫 write diff가
 * 0.000이고, 이 기능이 닿지도 않는다.
 */
function observeShape(
  survey: RepoSurvey,
  fmt: DetectedFormat,
  adapterName: string,
  input: SurveyInput,
  localeNames: readonly string[],
): void {
  if (adapterName !== "json-catalog" && adapterName !== "chrome-locales") return;
  const base = pickBase(localeNames);
  if (base === undefined) return;
  const pathOf = (locale: string) => fmt.pathTemplate.replace("{locale}", locale);

  const baseText = input.files.get(pathOf(base));
  if (baseText === undefined) return;
  const baseShape = jsonShape(baseText);
  survey.indent = baseShape.indent;
  mergeShape(survey, baseShape);

  let compared = 0;
  let agreed = 0;
  for (const locale of localeNames) {
    if (locale === base) continue;
    const text = input.files.get(pathOf(locale));
    if (text === undefined) continue;
    const shape = jsonShape(text);
    // 원인·관측 둘 다 **리포 단위 OR**다 — 어느 로케일 파일에서든 나면 그 리포의 PR에 나타난다.
    mergeShape(survey, shape);
    // 스캔이 실패한 파일은 순서를 신뢰할 수 없다. "다르다"로 세면 일치율이 파싱 실패율에 묶인다.
    if (shape.failed || baseShape.failed) continue;
    compared += 1;
    if (sameCommonOrder(baseShape.keyOrder, shape.keyOrder)) agreed += 1;
  }
  survey.localeOrderCompared = compared;
  if (compared > 0) survey.localeOrderAgreement = agreed / compared;

  if (adapterName === "chrome-locales") observeChrome(survey, input, pathOf, base, localeNames);
}

function mergeShape(survey: RepoSurvey, shape: JsonShape): void {
  for (const key of Object.keys(shape.causes) as Array<keyof JsonDiffCauses>) {
    if (shape.causes[key]) survey.diffCauses[key] = true;
  }
  if (shape.escapedNonAscii) survey.presentation.escapedNonAscii = true;
  if (shape.compactContainer) survey.presentation.compactContainer = true;
}

/**
 * chrome이 원본에 들고 있는 필드를 센다.
 *
 * **전에는 손실이었다** — `write`가 `{ message, description? }`만 내고 base에서만 description을
 * 냈다. 태스크 2·4가 둘 다 되돌리게 만든 뒤로는 diff 원인이 아니고 **관측치**로만 남는다:
 * 33개 중 12개(placeholders)·20개(비-base description)라는 숫자가 이 기능의 근거였다.
 *
 * ⚠️ **왕복 의미 게이트는 여전히 이 필드를 못 본다.** `sameMeaning`이 key·message만 비교하므로
 * 회귀가 나도 그쪽은 조용하다 — 바이트 왕복(L2 골든 픽스처)이 유일한 그물이다.
 */
function observeChrome(
  survey: RepoSurvey,
  input: SurveyInput,
  pathOf: (locale: string) => string,
  base: string,
  localeNames: readonly string[],
): void {
  for (const locale of localeNames) {
    const text = input.files.get(pathOf(locale));
    if (text === undefined) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      if (value === null || typeof value !== "object") continue;
      const entry = value as Record<string, unknown>;
      if (entry["placeholders"] !== undefined) survey.chromeFields.placeholders = true;
      if (locale !== base && entry["description"] !== undefined) survey.chromeFields.nonBaseDescription = true;
      // 삽입 순서가 곧 원본 순서다 — 필드 이름 셋이 비-정수라 JS가 끌어올리지 않는다.
      const fields = Object.keys(entry);
      const d = fields.indexOf("description");
      const m = fields.indexOf("message");
      if (d !== -1 && m !== -1 && d < m) survey.chromeFields.descriptionFirst = true;
    }
  }
}

/**
 * 왕복 2층 (spec 완료 조건 ④).
 *
 * - **의미 게이트**: `read → write → read`의 키·값 집합이 1차 read와 같은가. 다르면 데이터 손실.
 * - **바이트 고정점**: 2차 write가 1차 write와 바이트 동일한가. 다르면 결정성 결함.
 *
 * 첫 write가 원본과 바이트가 다른 것은 **정상**이다(원본이 우리 정렬 규칙을 따를 이유가 없다 —
 * ARCHITECTURE §1.2). 그 크기는 `diffRatio`가 따로 잰다.
 */
function applyRoundtrip(
  survey: RepoSurvey,
  layout: "per-locale" | "multi-locale",
  fmt: DetectedFormat,
  read1: ReadResult,
  originals: readonly AdapterFile[],
  input: SurveyInput,
): void {
  if (read1.locales.length === 0 || originals.length === 0) return;
  const adapter = adapterFor(fmt);
  const localeNames = read1.locales.map((l) => l.locale);
  const base = pickBase(localeNames);
  const entriesOf = (locale: string): readonly LocaleEntry[] =>
    read1.locales.find((l) => l.locale === locale)?.entries ?? [];

  const reported = { count: 0 };
  const byPath = new Map(originals.map((f) => [f.path, f.content]));
  const write1 =
    layout === "multi-locale"
      ? writeMultiLocale(fmt, originals, localeNames, base, entriesOf)
      : writePerLocale(fmt, localeNames, base, entriesOf, byPath, reported);
  survey.writeErrors = reported.count;
  if (write1.size === 0) return;

  const asFiles = (m: ReadonlyMap<string, string>): AdapterFile[] =>
    [...m.entries()].sort(([a], [b]) => compareKeys(a, b)).map(([path, content]) => ({ path, content }));

  const read2 = adapter.read({ ...fmt, currentFiles: asFiles(write1) }, asFiles(write1));
  // 재생성 writer는 미번역(빈 값)을 빼므로, 그 규칙을 1차 read에도 적용해야 공정하다.
  // 축은 `writeStrategy`다 — `layout`으로 가르면 per-locale + surgical(yaml·code-dict)이 잘못 분류된다.
  const dropEmpty = adapter.writeStrategy === "regenerate";
  survey.roundtrip.semantic = sameMeaning(read1, read2, dropEmpty) ? "same" : "different";

  const entries2 = (locale: string): readonly LocaleEntry[] =>
    read2.locales.find((l) => l.locale === locale)?.entries ?? [];
  const write2 =
    layout === "multi-locale"
      ? writeMultiLocale(fmt, asFiles(write1), localeNames, base, entries2)
      // 2차 write의 원본은 **1차 write의 결과**다 — 고정점을 재는 것이므로.
      : writePerLocale(fmt, localeNames, base, entries2, write1);
  survey.roundtrip.byteFixpoint = sameBytes(write1, write2) ? "same" : "different";

  // diff 비율은 **base 로케일 파일** 기준 — 첫 pull PR에서 사람이 제일 먼저 보는 파일이다.
  const basePath =
    layout === "multi-locale"
      ? originals[0]?.path
      : base === undefined
        ? undefined
        : fmt.pathTemplate.replace("{locale}", base);
  const before = basePath === undefined ? undefined : input.files.get(basePath);
  const after = basePath === undefined ? undefined : write1.get(basePath);
  if (before !== undefined && after !== undefined) {
    survey.diffRatio = roundtripDiffRatio(before, after);
    survey.diffApproximate = usedApproximation(before, after);
  }

  // **수술적 어댑터는 실제로 치환 경로를 밟게 한다.** 위 왕복은 값이 전부 같아 원본을 그대로
  // 돌려주므로 재직렬화가 한 줄도 돌지 않는다 — 키 하나를 바꿔 write하고 hunk가 1인지 본다.
  if (adapter.writeStrategy === "surgical" && before !== undefined && basePath !== undefined && base !== undefined) {
    const first = [...entriesOf(base)].sort((a, b) => compareKeys(a.key, b.key)).find((e) => e.message !== "");
    if (first !== undefined) {
      const edited: LocaleEntry = { ...first, message: `${first.message}·편집` };
      const editedOf = (locale: string): readonly LocaleEntry[] => (locale === base ? [edited] : []);
      const written =
        layout === "multi-locale"
          ? writeMultiLocale(fmt, originals, localeNames, base, editedOf).get(basePath)
          : writePerLocale(fmt, [base], base, editedOf, byPath).get(basePath);
      if (written !== undefined) survey.surgicalEditHunks = changedHunks(before, written);
    }
  }

  // **비-base 파일도 잰다.** base 순서를 전 로케일에 전파하는 설계에서는 위험이 이쪽에 산다 —
  // base만 보면 "base가 흐트러졌지만 비-base는 이미 우리 순서"인 리포에서 격차가 안 보인다.
  if (layout === "per-locale") {
    const others: number[] = [];
    for (const locale of localeNames) {
      if (locale === base) continue;
      const p = fmt.pathTemplate.replace("{locale}", locale);
      const src = input.files.get(p);
      const out = write1.get(p);
      if (src !== undefined && out !== undefined) others.push(roundtripDiffRatio(src, out));
    }
    survey.diffRatioNonBase = median(others);
  }
}

/**
 * @param originals 경로 → 원본 내용. **수술적 치환 어댑터에 필수다.**
 *
 * ⚠️ 안 넘기면 write가 매번 `null`을 내고 결과가 `not-run`으로 조용히 빠진다 — 실측 2회차에서
 * code-dict 리포 8개가 전부 그 상태였다. pull에서 같은 부류를 고치고(`writeStrategy` 분기)
 * 여기를 안 고친 것이다.
 */
function writePerLocale(
  fmt: DetectedFormat,
  locales: readonly string[],
  base: string | undefined,
  entriesOf: (locale: string) => readonly LocaleEntry[],
  originals: ReadonlyMap<string, string>,
  reportedErrors?: { count: number },
): Map<string, string> {
  const adapter = adapterFor(fmt);
  const out = new Map<string, string>();
  for (const locale of locales) {
    const path = fmt.pathTemplate.replace("{locale}", locale);
    // **원본을 어댑터 종류와 무관하게 넘긴다** — 수술적은 write에 필수이고, 재생성은 표현
    // (들여쓰기)을 거기서 읽는다. ⚠️ 이 홉이 빠지면 2차 write가 **1차 결과를 원본으로 받으면서**
    // 기본값으로 떨어져 **바이트 고정점 지표가 구조적 거짓 음성**이 된다 — "측정이 개선을 못 본다"
    // 보다 나쁘다 (POSTMORTEM 2026-09-02).
    const original = originals.get(path);
    // 원본이 없으면 수술적 치환은 파일을 안 만든다. 재생성은 기본값으로 계속 만든다.
    if (original === undefined && adapter.writeStrategy === "surgical") continue;
    const writeFormat =
      original === undefined ? fmt : { ...fmt, currentFiles: [{ path, content: original }] };
    const input = { locale, isBase: locale === base, entries: entriesOf(locale) };
    // ⚠️ **`writeWithErrors`가 있으면 그걸 쓴다.** 없으면 write가 버린 항목이 조용히 사라져,
    // 왕복이 "의미 불일치"만 보이고 **왜 잃었는지가 지표에 남지 않는다** — 실측에서 siyuan·
    // musicblocks가 정확히 그 상태였다(에러 0, 손실 있음).
    if (adapter.writeWithErrors !== undefined) {
      const res = adapter.writeWithErrors(writeFormat, input);
      if (reportedErrors) reportedErrors.count += res.errors.length;
      if (res.content !== null) out.set(path, res.content);
      continue;
    }
    const content = adapter.write(writeFormat, input);
    if (content !== null) out.set(path, content);
  }
  return out;
}

/**
 * ⚠️ **파일 × 로케일 이중 루프다** (ARCHITECTURE §3 함정).
 *
 * `ts-dict.write`는 `currentFiles[0]`만 보고 `input.locale`로 로케일 객체 하나를 고르므로, 파일
 * 하나를 완성하려면 로케일마다 한 번씩 부르며 **직전 결과를 다음 호출의 원본으로 넘겨야** 한다.
 * 파일 축만 돌면 나머지 로케일이 조용히 원본으로 남아 왕복이 거짓 통과한다.
 */
function writeMultiLocale(
  fmt: DetectedFormat,
  originals: readonly AdapterFile[],
  locales: readonly string[],
  base: string | undefined,
  entriesOf: (locale: string) => readonly LocaleEntry[],
): Map<string, string> {
  const adapter = adapterFor(fmt);
  const out = new Map<string, string>();
  for (const file of originals) {
    let content = file.content;
    for (const locale of locales) {
      const next = adapter.write(
        { ...fmt, currentFiles: [{ path: file.path, content }] },
        { locale, isBase: locale === base, entries: entriesOf(locale) },
      );
      if (next !== null) content = next;
    }
    out.set(file.path, content);
  }
  return out;
}

function sameMeaning(a: ReadResult, b: ReadResult, dropEmpty: boolean): boolean {
  const shape = (r: ReadResult) => {
    const m = new Map<string, Map<string, string>>();
    for (const loc of r.locales) {
      const inner = new Map<string, string>();
      for (const e of loc.entries) {
        if (dropEmpty && e.message === "") continue;
        inner.set(e.key, e.message);
      }
      if (inner.size > 0) m.set(loc.locale, inner);
    }
    return m;
  };
  const x = shape(a);
  const y = shape(b);
  if (x.size !== y.size) return false;
  for (const [locale, inner] of x) {
    const other = y.get(locale);
    if (other === undefined || other.size !== inner.size) return false;
    for (const [key, value] of inner) if (other.get(key) !== value) return false;
  }
  return true;
}

function sameBytes(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [path, content] of a) if (b.get(path) !== content) return false;
  return true;
}
