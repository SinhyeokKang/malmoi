import { NOT_SOURCE } from "./apple-strings";
import { compareKeys, exceedsGlobBudget, hasStrongLocale, pathSignals } from "./shared";
import type { Adapter, AdapterError, AdapterFile, DetectedFormat, FileProbe, LocaleEntry, ReadLocale, ReadResult, WriteInput } from "./types";
import { isLocaleShaped, isPathSafeLocale } from "@/lib/locale-code";

/**
 * Apple String Catalog `.xcstrings` (apple-strings design §2.3) — 모든 언어가 든 JSON 하나다.
 *
 * ```json
 * { "sourceLanguage" : "en", "strings" : { "Hello" : { "localizations" : { "de" : { "stringUnit" : { "state" : "translated", "value" : "Hallo" } } } } }, "version" : "1.0" }
 * ```
 *
 * ⚠️ **multi-locale + 수술적 치환이다.** 파서는 오프셋을 기억하는 JSON 파서 하나이고 read·write·탐지가 같은 것을 지난다. 값 문자열의 범위만 바꾸고,
 * **파일에 있는 키의 없는 언어 셀**만 Xcode 서식으로 넣는다(`insertsMissingCells`). 키는 넣지 않는다 — 키는 Xcode가 소스에서 뽑는다(코드가 정한다).
 * Xcode가 다시 저장해도 diff가 없게 서식을 맞춘다 — 근거는 `__tests__/fixtures/apple-xcstrings/README.md`(Xcode 26.6 `xcstringstool` 채록).
 *
 * ⚠️ **키 = 원문**(2026-10-19 사용자): SwiftUI가 뽑은 키는 원문 자체이고 원문 셀이 없는 것이 흔하다(Shotnix 1,780키 중 1,710). 그 키는 키 문자열을
 * 원문으로 읽고, 쓸 때 DB 원문이 키와 같으면 원문 셀을 쓰지 않는다(첫 Publish diff 0). 다르면 원문 셀을 넣는다 — Xcode가 카탈로그에서 원문을 고칠 때와 같다.
 * 셀 하나에 출처가 하나라 병합이 아니다.
 *
 * 복수형·기기별 `variations`와 `shouldTranslate: false`는 읽지 않고 보존만 한다(PRODUCT §4.2). 언어 추가·제거는 지원하지 않는다(ts-dict와 같다).
 */

/** 확장자가 곧 신호다 — survey 선택이 import한다. */
export const XCSTRINGS_FILE = /\.xcstrings$/;

/** Xcode의 기본 테이블 — `String(localized:)`가 고르는 카탈로그다. 같은 리포의 스토리보드·`InfoPlist` 카탈로그보다 앞선다. */
const MAIN_TABLE = "Localizable.xcstrings";

/**
 * 온보딩 1패스에서 내려받을 카탈로그 수. 카탈로그는 언어 목록이 파일 **안**에 있어 경로만 보는 1패스 후보가 없다 — ts-dict 씨앗과 같은 자리다.
 * 셋째부터는 미검증으로 화면에 안 뜬다(그때의 길은 수동 지정이다). 카탈로그 하나가 MB 단위라(Loop 1MB) 받는 수가 곧 응답 시간이다.
 */
const SEED_FILES = 2;

/** 중첩 상한 — 카탈로그는 10단 안팎이다(키 → localizations → 언어 → variations → plural → one → stringUnit). 재귀가 스택을 넘기 전에 막는다. */
const MAX_DEPTH = 64;

type JString = { type: "string"; start: number; end: number; value: string };
type JObject = { type: "object"; start: number; end: number; members: JMember[] };
/** 숫자·`true`·`false`·`null`·배열 — 원문 텍스트만 든다(`shouldTranslate`의 `false`를 가리려고). */
type JOther = { type: "other"; start: number; end: number; raw: string };
type JValue = JString | JObject | JOther;
/** `start`는 이름의 여는 따옴표, `nameEnd`는 닫는 따옴표 다음이다. */
type JMember = { name: string; start: number; nameEnd: number; value: JValue };

class JsonSyntaxError extends Error {}

/** `\"`·`\\`·`\/`·`\b`·`\f`·`\n`·`\r`·`\t` — 나머지 한 글자 이스케이프는 JSON이 아니다. */
const SIMPLE_ESCAPES = new Map([['"', '"'], ["\\", "\\"], ["/", "/"], ["b", "\b"], ["f", "\f"], ["n", "\n"], ["r", "\r"], ["t", "\t"]]);
const HEX4 = /^[0-9A-Fa-f]{4}$/;
const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

/** 짝 없는 서로게이트가 없는가. 정규식에 서로게이트 범위를 쓰지 않는다 — 코드 유닛을 직접 본다. */
function wellFormed(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c >= 0xdc00 && c <= 0xdfff) return false;
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i += 1;
    }
  }
  return true;
}

/**
 * RFC 8259 그대로의 JSON 파서 — 값마다 원문 오프셋을 기억한다. UTF-8 BOM만 앞에서 건너뛴다(원본 바이트로 남는다).
 *
 * 같은 객체에 같은 이름이 둘이어도 둘 다 `members`에 남긴다 — 어느 것을 읽을지는 `memberOf`(앞의 것)가 정한다.
 * ⚠️ **짝 없는 서로게이트도 실패다** — Xcode도 그 파일을 읽지 못하고, DB(UTF-8)에 담을 수 없어 대체 문자로 조용히 바뀐다.
 */
function parseJson(text: string): { ok: true; root: JValue } | { ok: false; detail: string } {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const fail = (detail: string): never => {
    throw new JsonSyntaxError(`${detail} at offset ${i}`);
  };
  const skipWhitespace = () => {
    for (;;) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i += 1;
      else return;
    }
  };
  const string = (): JString => {
    const start = i;
    i += 1;
    let value = "";
    let run = i;
    for (;;) {
      if (i >= text.length) fail("unterminated string");
      const c = text.charCodeAt(i);
      if (c === 0x22) break;
      if (c < 0x20) fail("control character in a string");
      if (c !== 0x5c) {
        i += 1;
        continue;
      }
      value += text.slice(run, i);
      const kind = text[i + 1] ?? "";
      const simple = SIMPLE_ESCAPES.get(kind);
      if (simple !== undefined) {
        value += simple;
        i += 2;
      } else if (kind === "u" && HEX4.test(text.slice(i + 2, i + 6))) {
        value += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16));
        i += 6;
      } else {
        fail("invalid escape");
      }
      run = i;
    }
    value += text.slice(run, i);
    i += 1;
    if (!wellFormed(value)) fail("unpaired surrogate");
    return { type: "string", start, end: i, value };
  };
  const value = (depth: number): JValue => {
    skipWhitespace();
    const start = i;
    const c = text[i];
    if (c === "{" || c === "[") {
      if (depth >= MAX_DEPTH) fail("nesting too deep");
      return c === "{" ? object(depth + 1) : array(depth + 1);
    }
    if (c === '"') return string();
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, i)) {
        i += literal.length;
        return { type: "other", start, end: i, raw: literal };
      }
    }
    NUMBER.lastIndex = i;
    const number = NUMBER.exec(text);
    if (number === null) return fail("unexpected character");
    i += number[0].length;
    return { type: "other", start, end: i, raw: number[0] };
  };
  const object = (depth: number): JObject => {
    const start = i;
    i += 1;
    const members: JMember[] = [];
    skipWhitespace();
    if (text[i] === "}") {
      i += 1;
      return { type: "object", start, end: i, members };
    }
    for (;;) {
      skipWhitespace();
      if (text[i] !== '"') fail("expected a name");
      const name = string();
      skipWhitespace();
      if (text[i] !== ":") fail('expected ":"');
      i += 1;
      members.push({ name: name.value, start: name.start, nameEnd: name.end, value: value(depth) });
      skipWhitespace();
      if (text[i] === ",") {
        i += 1;
        continue;
      }
      if (text[i] !== "}") fail('expected "," or "}"');
      i += 1;
      return { type: "object", start, end: i, members };
    }
  };
  const array = (depth: number): JOther => {
    const start = i;
    i += 1;
    skipWhitespace();
    if (text[i] !== "]") {
      for (;;) {
        value(depth);
        skipWhitespace();
        if (text[i] === ",") {
          i += 1;
          continue;
        }
        if (text[i] !== "]") fail('expected "," or "]"');
        break;
      }
    }
    i += 1;
    return { type: "other", start, end: i, raw: text.slice(start, i) };
  };
  try {
    const root = value(0);
    skipWhitespace();
    if (i !== text.length) fail("unexpected trailing characters");
    return { ok: true, root };
  } catch (error) {
    if (error instanceof JsonSyntaxError) return { ok: false, detail: error.message };
    throw error;
  }
}

/**
 * **같은 이름이 둘이면 앞의 것이다** — Xcode 26.6 `xcstringstool`이 그렇게 읽고, 다시 저장할 때 뒤의 사본을 지운다(픽스처 `xcode-duplicate-*`, 지휘자 결정 14).
 * `JSON.parse`는 뒤의 것을 읽는다 — 그 의미를 따르면 Xcode가 쓰지 않는 값을 싣고 고친다. 실제 정답 리포 HealthGPT의 카탈로그에 옛 Xcode가 쓴 중복 키가 있다.
 */
function memberOf(obj: JObject, name: string): JMember | undefined {
  return obj.members.find((m) => m.name === name);
}

/** 이 값 아래 어딘가에 같은 이름이 둘인 객체가 있는가 — 알림(`duplicate-property`)용이다. */
function hasDuplicateNames(value: JValue): boolean {
  if (value.type !== "object") return false;
  const names = new Set<string>();
  for (const m of value.members) {
    if (names.has(m.name)) return true;
    names.add(m.name);
  }
  return value.members.some((m) => hasDuplicateNames(m.value));
}

/** 언어 셀. `value`는 `stringUnit.value` 문자열이 있을 때만 — 없으면(`variations` 등) 읽지 않는 셀이다. */
type Cell = { node: JObject; value: JString | undefined };
/** `duplicated` — 이 키(또는 그 안)에 같은 이름이 둘이다. 앞의 것을 읽고 쓰며, 가려진 사본은 바이트 그대로다. */
type CatalogKey = { name: string; node: JObject; translate: boolean; localizations: JObject | undefined; cells: Map<string, Cell>; duplicated: boolean };
/** `duplicatedRoot` — 루트(`sourceLanguage` 등)에 같은 이름이 둘이다. */
type Catalog = { sourceLanguage: string; root: JObject; keys: CatalogKey[]; duplicatedRoot: boolean };

/**
 * 적재 경계(`lib/push/plan.ts`의 `LocaleCode`)가 받는 코드인가. 카탈로그의 언어 코드는 JSON 이름이라 무엇이든 될 수 있고, 하나라도 경계를 못 지나면
 * 페이로드 **전체**가 거부된다 — 그런 셀은 엔트리로 싣지 않고 파일에 그대로 둔다.
 */
function usableLocale(code: string): boolean {
  return isPathSafeLocale(code) && isLocaleShaped(code);
}

function parseCatalog(text: string): { ok: true; catalog: Catalog } | { ok: false; code: "parse-failed" | "root-not-object"; detail: string } {
  const parsed = parseJson(text);
  if (!parsed.ok) return { ok: false, code: "parse-failed", detail: parsed.detail };
  const root = parsed.root;
  if (root.type !== "object") return { ok: false, code: "root-not-object", detail: "the top level is not an object" };
  const bad = (detail: string) => ({ ok: false as const, code: "parse-failed" as const, detail });
  const source = memberOf(root, "sourceLanguage")?.value;
  if (source?.type !== "string") return bad("sourceLanguage is not a string");
  if (!usableLocale(source.value)) return bad("sourceLanguage is not a locale code");
  const strings = memberOf(root, "strings")?.value;
  if (strings?.type !== "object") return bad("strings is not an object");
  const keys: CatalogKey[] = [];
  const seen = new Map<string, CatalogKey>();
  for (const member of strings.members) {
    const shadowing = seen.get(member.name);
    // 가려진 사본은 읽지 않는다 — 모양이 무엇이든 Xcode가 다음 저장에서 지운다. 알림만 앞 키에 단다.
    if (shadowing !== undefined) {
      shadowing.duplicated = true;
      continue;
    }
    const node = member.value;
    if (node.type !== "object") return bad(`string ${JSON.stringify(member.name)} is not an object`);
    const flag = memberOf(node, "shouldTranslate")?.value;
    const localizations = memberOf(node, "localizations")?.value;
    if (localizations !== undefined && localizations.type !== "object") return bad(`localizations of ${JSON.stringify(member.name)} is not an object`);
    const cells = new Map<string, Cell>();
    for (const cell of localizations?.members ?? []) {
      if (cell.value.type !== "object") return bad(`localization ${JSON.stringify(cell.name)} of ${JSON.stringify(member.name)} is not an object`);
      const unit = memberOf(cell.value, "stringUnit")?.value;
      const value = unit?.type === "object" ? memberOf(unit, "value")?.value : undefined;
      if (!cells.has(cell.name)) cells.set(cell.name, { node: cell.value, value: value?.type === "string" ? value : undefined });
    }
    const key = { name: member.name, node, translate: !(flag?.type === "other" && flag.raw === "false"), localizations, cells, duplicated: hasDuplicateNames(node) };
    keys.push(key);
    seen.set(member.name, key);
  }
  const rootNames = root.members.map((m) => m.name);
  return { ok: true, catalog: { sourceLanguage: source.value, root, keys, duplicatedRoot: new Set(rootNames).size !== rootNames.length } };
}

/** 로케일 집합 — 셀 언어의 합집합 + sourceLanguage. 번역하지 않는 키의 셀도 센다(카탈로그가 다루는 언어다). */
function catalogLocales(catalog: Catalog): Set<string> {
  const out = new Set([catalog.sourceLanguage]);
  for (const key of catalog.keys) for (const code of key.cells.keys()) if (usableLocale(code)) out.add(code);
  return out;
}

/** 카탈로그가 될 수 있는 경로를 순위순으로 — `Localizable` → 예제·테스트 아님 → 얕은 경로 → 경로순. 씨앗과 후보가 같은 순서다. */
function catalogPaths(paths: readonly string[]): string[] {
  const tier = (path: string) => (pathSignals(path).aside ? 2 : 0) + (path === MAIN_TABLE || path.endsWith(`/${MAIN_TABLE}`) ? 0 : 1);
  return paths
    // 템플릿이 그 경로 자체다 — 글롭 문자가 든 경로는 다른 파일을 겨눌 수 있어 받지 않는다.
    .filter((p) => XCSTRINGS_FILE.test(p) && !NOT_SOURCE.test(p) && !p.includes("*") && !p.includes("{locale}") && !exceedsGlobBudget(p))
    .sort((a, b) => tier(a) - tier(b) || pathSignals(a).depth - pathSignals(b).depth || compareKeys(a, b));
}

/**
 * **경로만 보는 씨앗** — 온보딩이 1패스에서 내려받을 카탈로그(`probeTargets`). 이것이 없으면 이 어댑터는 화면에 존재하지 않는다(POSTMORTEM 2026-09-02):
 * 1패스 후보가 0이라 내려받을 목록에 안 실리고 2패스에도 내용이 없다. `detectCandidates`와 같은 순서를 지난다.
 */
export function xcstringsProbePaths(paths: readonly string[]): string[] {
  return catalogPaths(paths).slice(0, SEED_FILES);
}

/** 후보는 카탈로그 파일 하나다. probe가 없으면 `[]` — 로케일이 내용 안에 있다(ts-dict와 같다). */
function detectCandidates(paths: readonly string[], probe?: FileProbe): DetectedFormat[] {
  if (!probe) return [];
  return catalogPaths(paths).flatMap((pathTemplate) => {
    const content = probe(pathTemplate);
    if (content === undefined) return [];
    const parsed = parseCatalog(content);
    if (!parsed.ok) return [];
    const locales = catalogLocales(parsed.catalog);
    if (!hasStrongLocale(locales)) return [];
    // 기준 언어 힌트는 sourceLanguage다 — 요약·확정의 기본 기준 언어(`defaultBaseLocale`).
    return [{ adapter: "apple-xcstrings" as const, pathTemplate, locales: [...locales].sort(compareKeys), templateLocale: parsed.catalog.sourceLanguage }];
  });
}

function detect(paths: readonly string[], probe?: FileProbe): DetectedFormat | undefined {
  return detectCandidates(paths, probe)[0];
}

function read(_format: DetectedFormat, files: readonly AdapterFile[]): ReadResult {
  const byLocale = new Map<string, LocaleEntry[]>();
  const errors: AdapterError[] = [];
  const push = (locale: string, key: string, message: string) => {
    (byLocale.get(locale) ?? byLocale.set(locale, []).get(locale)!).push({ key, message });
  };
  for (const file of files) {
    const parsed = parseCatalog(file.content);
    if (!parsed.ok) {
      errors.push({ path: file.path, code: parsed.code, detail: parsed.detail });
      continue;
    }
    const { catalog } = parsed;
    const source = catalog.sourceLanguage;
    for (const locale of catalogLocales(catalog)) if (!byLocale.has(locale)) byLocale.set(locale, []);
    // 같은 이름은 Xcode처럼 앞의 것을 읽는다. write도 그 사본만 고쳐 잃는 값이 없으므로 code-dict·ts-dict·apple-strings와 같은 경고다 —
    // 대상 리포 CI를 red로 만들지 않는다(지휘자 결정 14).
    if (catalog.duplicatedRoot) errors.push({ path: file.path, code: "duplicate-property" });
    for (const key of catalog.keys) {
      if (key.duplicated) errors.push({ path: file.path, code: "duplicate-property", key: key.name });
      if (!key.translate) continue;
      const own = key.cells.get(source);
      // 원문이 복수형이면 키 전체가 복수형이다 — 어느 언어도 싣지 않고 파일에 남긴다(unmanaged).
      if (own !== undefined && own.value === undefined) {
        errors.push({ path: file.path, code: "value-not-string", key: key.name });
        continue;
      }
      push(source, key.name, own?.value?.value ?? key.name);
      let reported = false;
      for (const [code, cell] of key.cells) {
        if (code === source || !usableLocale(code)) continue;
        if (cell.value !== undefined) push(code, key.name, cell.value.value);
        else if (!reported) {
          errors.push({ path: file.path, code: "value-not-string", key: key.name });
          reported = true;
        }
      }
    }
  }
  const locales: ReadLocale[] = [...byLocale]
    .map(([locale, entries]) => ({ locale, entries: entries.sort((a, b) => compareKeys(a.key, b.key)) }))
    .sort((a, b) => compareKeys(a.locale, b.locale));
  return { locales, errors, nested: false };
}

function write(format: DetectedFormat, input: WriteInput): string | null {
  return writeWithErrors(format, input).content;
}

type Edit = { at: number; end: number; text: string };
/** 넣을 JSON 값 — 문자열 또는 이름 순서가 정해진 객체. */
type Tree = string | readonly (readonly [string, Tree])[];
/** 파일의 서식 — 줄바꿈·들여쓰기 단위·`" : "`. 공백 없는 파일이면 `pretty`가 false이고 공백 없이 넣는다. */
type Style = { pretty: boolean; eol: string; unit: string; separator: string };

/** 줄 첫머리의 공백 — 그 줄에 놓인 객체의 닫는 괄호가 설 자리다. */
function lineIndent(text: string, offset: number): string {
  const start = text.lastIndexOf("\n", offset - 1) + 1;
  return /^[ \t]*/.exec(text.slice(start, offset))?.[0] ?? "";
}

/** 루트의 첫 이름에서 서식을 읽는다 — Xcode는 2칸·`" : "`이고, 손으로 4칸·`": "`로 쓴 파일은 그 서식을 따른다. */
function styleOf(text: string, root: JObject): Style {
  const first = root.members[0];
  const pretty = first !== undefined && /[\r\n]/.test(text.slice(root.start + 1, first.start));
  const unit = pretty ? lineIndent(text, first.start) || "  " : "";
  const between = first === undefined ? "" : text.slice(first.nameEnd, first.value.start);
  const separator = /^[ \t]*:[ \t]*$/.test(between) ? between : pretty ? " : " : ":";
  return { pretty, eol: text.includes("\r\n") ? "\r\n" : "\n", unit, separator };
}

/** Xcode 26.6의 문자열 인코더와 같다 — `"`·`\`·C0만 이스케이프하고 `/`·U+007F·비ASCII는 그대로다(픽스처 README). */
const quote = (s: string) => JSON.stringify(s);

function render(tree: Tree, indent: string, style: Style): string {
  if (typeof tree === "string") return quote(tree);
  const inner = indent + style.unit;
  const members = tree.map(([name, value]) => `${style.pretty ? inner : ""}${quote(name)}${style.separator}${render(value, inner, style)}`);
  return style.pretty ? `{${style.eol}${members.join(`,${style.eol}`)}${style.eol}${indent}}` : `{${members.join(",")}}`;
}

/**
 * 객체에 이름 하나를 **코드 유닛 순 자리**에 넣는 편집. Xcode는 이름(언어 코드·필드)을 코드 유닛 순으로 쓴다 — 기존 순서가 그렇지 않은 파일(손 편집)에서도
 * "자기보다 큰 첫 이름 앞"이라 자리가 결정적이다. 빈 객체(`{\n\n    }`·`{}`)는 안쪽을 통째로 바꾼다.
 *
 * ⚠️ **편집 자리가 겹치지 않는다** (POSTMORTEM 2026-09-16 — YAML range 치환의 같은 위치). 한 write는 객체마다 이름을 하나만 넣고(언어 하나 또는
 * `localizations` 하나), 자리는 기존 이름의 여는 따옴표·마지막 값의 끝·빈 객체의 안쪽이다 — 값 문자열 치환 범위는 셀 객체 **안**이라 셋 중 어디와도 닿지 않는다.
 */
function insertMember(text: string, style: Style, obj: JObject, name: string, tree: Tree): Edit {
  const first = obj.members[0];
  const lead = first === undefined ? undefined : text.slice(text.lastIndexOf("\n", first.start - 1) + 1, first.start);
  const indent = lead !== undefined && /^[ \t]*$/.test(lead) ? lead : lineIndent(text, obj.start) + style.unit;
  const member = `${quote(name)}${style.separator}${render(tree, indent, style)}`;
  if (first === undefined) {
    const inside = style.pretty ? `${style.eol}${indent}${member}${style.eol}${lineIndent(text, obj.start)}` : member;
    return { at: obj.start + 1, end: obj.end - 1, text: inside };
  }
  const next = obj.members.find((m) => compareKeys(m.name, name) > 0);
  if (next !== undefined) return { at: next.start, end: next.start, text: style.pretty ? `${member},${style.eol}${indent}` : `${member},` };
  const last = obj.members[obj.members.length - 1]!;
  return { at: last.value.end, end: last.value.end, text: style.pretty ? `,${style.eol}${indent}${member}` : `,${member}` };
}

/**
 * 한 파일의 한 언어를 쓴다 — 렌더가 언어마다 부르며 직전 결과를 다음 원본으로 넘긴다(`renderLocaleFiles`의 multi-locale 갈래).
 *
 * - 셀이 있으면 `value` 문자열 범위만 바꾼다. `state`는 건드리지 않는다(`needs_review`를 Malmoi가 풀지 않는다).
 * - 셀이 없으면 `{ "stringUnit" : { "state" : "translated", "value" : … } }`를 넣는다 — `localizations`가 없으면 그것부터 만든다.
 * - 원문 셀이 없는 키에 DB 원문이 키와 같으면 아무것도 쓰지 않는다(키 = 원문).
 * - 파일에 없는 키·번역하지 않는 키·복수형 원문의 키는 쓰지 않는다. 복수형 셀에 값을 쓰려 하면 `write-slot-not-scalar`다(그 셀만 막지 않고 실패로 알린다 —
 *   쓰기 성공과 값 전달을 같게 세지 않는다, POSTMORTEM 2026-10-07).
 *
 * ⚠️ **파싱 실패는 "변경 없음"이 아니다** — 원본을 그대로 돌려주되 `write-parse-failed`로 알린다.
 */
function writeWithErrors(format: DetectedFormat, input: WriteInput): { content: string | null; errors: AdapterError[] } {
  // 한 번에 한 파일만 다룬다 — 호출부가 파일별로 부르는 계약이다(ts-dict와 같다).
  const file = format.currentFiles?.[0];
  if (file === undefined) return { content: null, errors: [] };
  const text = file.content;
  const parsed = parseCatalog(text);
  if (!parsed.ok) return { content: text, errors: [{ path: file.path, code: "write-parse-failed", detail: parsed.detail }] };
  const { catalog } = parsed;

  const wanted = new Map<string, string>();
  // orphaned·빈 값은 원본을 남긴다(불변식 3 — 수술적 표면은 비울 수 없다).
  for (const e of input.entries) if (e.orphaned !== true && e.message !== "") wanted.set(e.key, e.message);

  const style = styleOf(text, catalog.root);
  const edits: Edit[] = [];
  const errors: AdapterError[] = [];
  for (const key of catalog.keys) {
    const message = wanted.get(key.name);
    if (message === undefined || !key.translate) continue;
    const cell = key.cells.get(input.locale);
    if (cell !== undefined) {
      if (cell.value === undefined) errors.push({ path: file.path, code: "write-slot-not-scalar", key: key.name });
      else if (cell.value.value !== message) edits.push({ at: cell.value.start, end: cell.value.end, text: quote(message) });
      continue;
    }
    const source = key.cells.get(catalog.sourceLanguage);
    if (source !== undefined && source.value === undefined) continue;
    if (input.locale === catalog.sourceLanguage && message === key.name) continue;
    const created: Tree = [["stringUnit", [["state", "translated"], ["value", message]]]];
    edits.push(key.localizations !== undefined
      ? insertMember(text, style, key.localizations, input.locale, created)
      : insertMember(text, style, key.node, "localizations", [[input.locale, created]]));
  }
  if (edits.length === 0) return { content: text, errors };
  // 뒤에서 앞으로 — 앞 편집이 뒤 범위를 밀지 않는다.
  let out = text;
  for (const edit of edits.sort((a, b) => b.at - a.at)) out = out.slice(0, edit.at) + edit.text + out.slice(edit.end);
  return { content: out, errors };
}

export const appleXcstrings: Adapter = {
  name: "apple-xcstrings",
  layout: "multi-locale",
  writeStrategy: "surgical",
  insertsMissingCells: true,
  detect,
  detectCandidates,
  read,
  write,
  writeWithErrors,
};
