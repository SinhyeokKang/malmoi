import { adapterFor, compareKeys } from "../adapters";
import type { AdapterFile, DetectedFormat, LocaleEntry, ReadLocale, ReadResult } from "../adapters/types";
import { roundtripDiffRatio, usedApproximation } from "./diff";
import { candidatesFor } from "./merge";
import { tsShape } from "./ts-shape";
import {
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
    roundtrip: { semantic: "not-run", byteFixpoint: "not-run" },
    diffApproximate: false,
    separators: { dot: 0, underscore: 0, colon: 0, slash: 0, none: 0 },
    icuPluralKeys: 0,
    placeholderKeys: 0,
    configFiles: [],
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
    survey.keyCollisions += duplicateCount(loc);
    for (const e of loc.entries) allKeys.add(e.key);
  }
  survey.localeCount = read1.locales.length;
  survey.keyCount = allKeys.size;
  survey.separators = countSeparators(allKeys);
  countMessages(read1.locales, survey);

  if (adapter.name === "ts-dict") {
    const shape = tsShape(adapterFiles);
    survey.silentSkips = shape.silentSkips;
    survey.literalCount = shape.literalCount;
    survey.readKeyCount = allKeys.size;
    survey.errors["adapter-threw"] += shape.parseFailures;
  }

  // write는 read가 관측한 중첩 여부를 알아야 같은 모양으로 되돌린다 (ARCHITECTURE §1.3).
  const fmt: DetectedFormat = { ...chosen, nested: read1.nested };
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

/** `en`이 있으면 `en`, 없으면 사전순 첫 번째 (ARCHITECTURE §1.3 — 아직 추정이다). */
function pickBase(locales: readonly string[]): string | undefined {
  return locales.includes("en") ? "en" : [...locales].sort(compareKeys)[0];
}

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
  // `multi-locale` — pathTemplate이 글롭(`<dir>*.ts`)이라 같은 디렉터리의 파일을 모은다.
  const dir = fmt.pathTemplate.replace(/\*\.tsx?$/, "");
  for (const path of [...input.files.keys()].sort(compareKeys)) {
    if (!path.startsWith(dir)) continue;
    if (path.slice(dir.length).includes("/")) continue;
    if (!/\.tsx?$/.test(path)) continue;
    out.push({ path, content: input.files.get(path)! });
  }
  return out;
}

function classify(message: string): ReadErrorKind {
  if (message.includes("JSON 파싱 실패")) return "json-parse";
  if (message.includes("최상위가 객체가 아니다")) return "non-object-root";
  if (message.includes("chrome.i18n이 허용하지 않는")) return "chrome-key";
  if (message.includes("문자열 리터럴이 아니다")) return "non-literal-value";
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
 * 같은 로케일 안에서 키가 겹친 횟수.
 *
 * `json-catalog`의 `flatten`이 중복을 검사하지 않아 `"a.b": "x"`와 `{"a":{"b":"y"}}`가 같은 키로
 * 둘 다 들어온다 — write에서 하나가 조용히 사라진다. 빈도를 모르는 채로 고치지 않기 위해 센다.
 */
function duplicateCount(loc: ReadLocale): number {
  const seen = new Set<string>();
  let dup = 0;
  for (const e of loc.entries) {
    if (seen.has(e.key)) dup += 1;
    else seen.add(e.key);
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

  const write1 =
    layout === "multi-locale"
      ? writeMultiLocale(fmt, originals, localeNames, base, entriesOf)
      : writePerLocale(fmt, localeNames, base, entriesOf);
  if (write1.size === 0) return;

  const asFiles = (m: ReadonlyMap<string, string>): AdapterFile[] =>
    [...m.entries()].sort(([a], [b]) => compareKeys(a, b)).map(([path, content]) => ({ path, content }));

  const read2 = adapter.read({ ...fmt, currentFiles: asFiles(write1) }, asFiles(write1));
  // 재생성 writer는 미번역(빈 값)을 빼므로, 그 규칙을 1차 read에도 적용해야 공정하다.
  const dropEmpty = layout === "per-locale";
  survey.roundtrip.semantic = sameMeaning(read1, read2, dropEmpty) ? "same" : "different";

  const entries2 = (locale: string): readonly LocaleEntry[] =>
    read2.locales.find((l) => l.locale === locale)?.entries ?? [];
  const write2 =
    layout === "multi-locale"
      ? writeMultiLocale(fmt, asFiles(write1), localeNames, base, entries2)
      : writePerLocale(fmt, localeNames, base, entries2);
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
}

function writePerLocale(
  fmt: DetectedFormat,
  locales: readonly string[],
  base: string | undefined,
  entriesOf: (locale: string) => readonly LocaleEntry[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const locale of locales) {
    const content = adapterFor(fmt).write(fmt, { locale, isBase: locale === base, entries: entriesOf(locale) });
    if (content !== null) out.set(fmt.pathTemplate.replace("{locale}", locale), content);
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
