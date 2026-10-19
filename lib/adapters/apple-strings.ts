import { localeFromPath } from "./chrome-locales";
import { compareKeys, hasStrongLocale, looksLikeLocale, orderedEntries, pathSignals, rankTemplateCandidates, verifySamples, type CatalogVerdict } from "./shared";
import type { Adapter, AdapterError, AdapterFile, DetectedFormat, FileProbe, LocaleEntry, ReadLocale, ReadResult, WriteInput } from "./types";

/**
 * Apple `.strings` — `<dir>/<locale>.lproj/<table>.strings` (apple-strings design §2.1).
 *
 * ⚠️ **`per-locale` + 수술적 치환이다.** 값 리터럴의 범위만 다시 이스케이프해 바꾸고, 주석·빈 줄·키 순서·바꾸지 않은 리터럴의 표기(비정규 이스케이프
 * 포함)는 원본 바이트 그대로다. 파서는 의존성 없는 토크나이저 하나이고 read·write·탐지가 같은 것을 지난다.
 *
 * ⚠️ **비-base 파일의 누락 키는 삽입한다** (2026-10-19 사용자 결정). create는 값 있는 키만 쓰므로 언어 파일을 만든 뒤 다른 키를 번역하면 그 파일에
 * 자리가 없다 — 원본이 있으니 write로 가고, per-locale `write-slot-missing`은 Publish 전체를 막는 blocking이다(`lib/pull/undeliverable.ts`). base 파일은
 * 렌더가 원본의 키 집합으로 거른 엔트리만 넘기므로(B3.4) 여기서 삽입할 키가 생기지 않는다.
 *
 * 인코딩(UTF-16 LE·BE, BOM)은 파일 층(`lib/file-encoding.ts`)이 든다 — 이 어댑터는 문자열만 본다. UTF-8 BOM만 본문 첫 글자 U+FEFF로 남아 있다.
 */

/** `<dir>/<locale>.lproj/<table>.strings`. */
export const STRINGS_FILE = /^((?:[^/]*\/)*)([^/]+)\.lproj\/([^/]+)\.strings$/;

/**
 * 후보가 아닌 디렉터리 — 스토어 메타데이터(`fastlane/`), 의존성(`Pods/`), 빌드 산출물(`build/`), 그리고 번들 안(`*.framework/`·`*.app/` — 재측정에서
 * iTerm2·Lifeslice가 벤더 `Sparkle.framework`의 사본을 1순위로 냈다). 공용 `ASIDE_HINT`에 더하면 기존 어댑터의 순위까지 움직여 재측정 대상이 된다
 * (design §5) — 이 어댑터의 후보 판정 안에서만 거른다. `*.bundle/`은 거르지 않는다 — 리소스 번들이 정답인 리포가 있다(TwitchAdBlock).
 */
const NOT_SOURCE = /(^|\/)((fastlane|Pods|build)|[^/]+\.(framework|app))\//;

/** UTF-8 BOM이 디코드된 본문 첫 글자. 소스에 보이지 않는 글자를 두지 않으려고 코드로 만든다. */
const BOM = String.fromCharCode(0xfeff);

/** Xcode가 `NSLocalizedString`의 기본 테이블로 쓰는 이름 — 같은 리포의 다른 테이블(스토리보드·`InfoPlist`)보다 앞선다. */
const MAIN_TABLE = "Localizable.strings";

export type StringsSlot = {
  key: string;
  /** 키 토큰 시작 ~ `;` 다음. */
  start: number;
  end: number;
  /** 키 토큰 끝 — `"key";`(값 생략) 꼴의 값을 넣는 자리다. */
  keyEnd: number;
  /** 값 리터럴의 범위 — 따옴표를 포함한다. `"key";`처럼 값을 생략했으면 없다(값 = 키). */
  value: { start: number; end: number } | undefined;
};
export type Tokenized = { ok: true; entries: StringsSlot[] } | { ok: false; detail: string };

/** 따옴표 없는 토큰에 쓸 수 있는 글자 — old-style plist의 unquoted string. */
const BARE = /[A-Za-z0-9_$+/:.-]/;

/**
 * 바이너리 plist(`bplist00`)인가. 파일 층이 NUL을 보고 UTF-16으로 디코드했을 수도 있어 세 모양을 다 본다(design §2.2 — M1 코퍼스 Lifeslice 22파일).
 * 작은 바이너리는 "유효한 UTF-16"으로 읽혀 조용히 엉뚱한 글자가 되므로 매직으로 명시 거부한다.
 */
function isBinaryPlist(text: string): boolean {
  if (text.startsWith("bplist")) return true;
  const units = [0, 1, 2].map((i) => text.charCodeAt(i));
  const le = [0x7062, 0x696c, 0x7473];
  const be = [0x6270, 0x6c69, 0x7374];
  return units.every((u, i) => u === le[i]) || units.every((u, i) => u === be[i]);
}

/** 공백·주석을 건너뛴다. 닫히지 않은 블록 주석이면 -1. */
function skipTrivia(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    const c = text[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v") i += 1;
    else if (text.startsWith("//", i)) {
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? text.length : nl + 1;
    } else if (text.startsWith("/*", i)) {
      const close = text.indexOf("*/", i + 2);
      if (close === -1) return -1;
      i = close + 2;
    } else break;
  }
  return i;
}

/** 리터럴 토큰 하나. 따옴표 문자열이면 짝 따옴표까지, 아니면 unquoted 글자들. 못 읽으면 `undefined`. */
function readToken(text: string, at: number): { start: number; end: number } | undefined {
  const q = text[at];
  if (q === '"' || q === "'") {
    let i = at + 1;
    while (i < text.length && text[i] !== q) i += text[i] === "\\" ? 2 : 1;
    return i < text.length ? { start: at, end: i + 1 } : undefined;
  }
  let i = at;
  while (i < text.length && BARE.test(text[i]!)) i += 1;
  return i > at ? { start: at, end: i } : undefined;
}

/**
 * 엔트리와 값 리터럴의 범위를 파일 순서대로 낸다. 중복 키도 그대로 둔다(read가 알린다). 범위는 원본 문자열 좌표다(UTF-8 BOM 문자를 포함한 채로).
 * 주석 안의 `"a" = "b";`는 엔트리가 아니다 — 주석을 먼저 건너뛰고 토큰을 읽는다.
 */
export function tokenizeStrings(text: string): Tokenized {
  const fail = (detail: string): Tokenized => ({ ok: false, detail });
  if (isBinaryPlist(text)) return fail("binary property list (bplist00), not a text strings file");
  const entries: StringsSlot[] = [];
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (;;) {
    i = skipTrivia(text, i);
    if (i === -1) return fail("unterminated comment");
    if (i >= text.length) return { ok: true, entries };
    const key = readToken(text, i);
    if (key === undefined) return fail(`unexpected character at offset ${i}`);
    i = skipTrivia(text, key.end);
    if (i === -1) return fail("unterminated comment");
    let value: { start: number; end: number } | undefined;
    if (text[i] === "=") {
      i = skipTrivia(text, i + 1);
      if (i === -1) return fail("unterminated comment");
      value = readToken(text, i);
      if (value === undefined) return fail(`expected a value at offset ${i}`);
      i = skipTrivia(text, value.end);
      if (i === -1) return fail("unterminated comment");
    }
    if (text[i] !== ";") return fail(`expected ";" at offset ${i}`);
    i += 1;
    // 키·값 리터럴을 여기서 한 번 검증한다 — 담을 수 없는 값(짝 없는 서로게이트)이 있으면 파일 전체가 실패다(R1).
    const keyText = decodeStringsLiteral(text.slice(key.start, key.end));
    if (keyText === undefined || (value !== undefined && decodeStringsLiteral(text.slice(value.start, value.end)) === undefined)) {
      return fail(`unpaired surrogate escape at offset ${key.start}`);
    }
    entries.push({ key: keyText, start: key.start, end: i, keyEnd: key.end, value });
  }
}

const SIMPLE_ESCAPES: Record<string, number> = { n: 0x0a, t: 0x09, r: 0x0d, a: 0x07, b: 0x08, f: 0x0c, v: 0x0b };

/**
 * 8진 이스케이프 0o200–0o377 → 코드 포인트. Apple 파서는 8진 값을 **NeXTSTEP 인코딩 바이트**로 읽는다 — 이 표는 `/usr/bin/plutil`에서
 * 2026-10-19에 0o200–0o377 전부를 채록했다(0o376·0o377은 NUL). 0o400 이상은 NUL이다.
 */
const NEXTSTEP_HIGH: readonly number[] = [
  0x00a0, 0x00c0, 0x00c1, 0x00c2, 0x00c3, 0x00c4, 0x00c5, 0x00c7, 0x00c8, 0x00c9, 0x00ca, 0x00cb, 0x00cc, 0x00cd, 0x00ce, 0x00cf,
  0x00d0, 0x00d1, 0x00d2, 0x00d3, 0x00d4, 0x00d5, 0x00d6, 0x00d9, 0x00da, 0x00db, 0x00dc, 0x00dd, 0x00de, 0x00b5, 0x00d7, 0x00f7,
  0x00a9, 0x00a1, 0x00a2, 0x00a3, 0x2044, 0x00a5, 0x0192, 0x00a7, 0x00a4, 0x2019, 0x201c, 0x00ab, 0x2039, 0x203a, 0xfb01, 0xfb02,
  0x00ae, 0x2013, 0x2020, 0x2021, 0x00b7, 0x00a6, 0x00b6, 0x2022, 0x201a, 0x201e, 0x201d, 0x00bb, 0x2026, 0x2030, 0x00ac, 0x00bf,
  0x00b9, 0x02cb, 0x00b4, 0x02c6, 0x02dc, 0x00af, 0x02d8, 0x02d9, 0x00a8, 0x00b2, 0x02da, 0x00b8, 0x00b3, 0x02dd, 0x02db, 0x02c7,
  0x2014, 0x00b1, 0x00bc, 0x00bd, 0x00be, 0x00e0, 0x00e1, 0x00e2, 0x00e3, 0x00e4, 0x00e5, 0x00e7, 0x00e8, 0x00e9, 0x00ea, 0x00eb,
  0x00ec, 0x00c6, 0x00ed, 0x00aa, 0x00ee, 0x00ef, 0x00f0, 0x00f1, 0x0141, 0x00d8, 0x0152, 0x00ba, 0x00f2, 0x00f3, 0x00f4, 0x00f5,
  0x00f6, 0x00e6, 0x00f9, 0x00fa, 0x00fb, 0x0131, 0x00fc, 0x00fd, 0x0142, 0x00f8, 0x0153, 0x00df, 0x00fe, 0x00ff, 0x0000, 0x0000,
];

/**
 * 리터럴 토큰(따옴표 포함) → 값. 따옴표 없는 토큰은 그대로다. **Apple 파서(`plutil`)와 같은 의미다**(리뷰 R1 — 테스트의 채록 픽스처):
 * - `\U` 뒤 16진 최대 4자리가 UTF-16 코드 유닛이고, 16진이 없으면 NUL이다. 소문자 `\u`는 이스케이프가 아니다(`u` 글자).
 * - 8진 최대 3자리는 NeXTSTEP 바이트다(위 표). 0o400 이상은 NUL.
 * - `a b f v n t r`는 제어 문자, 그 밖의 글자(따옴표·역슬래시·줄바꿈 포함)는 그 글자 자신이다.
 *
 * 짝 없는 서로게이트가 나오면 `undefined`다 — DB(UTF-8)에 담을 수 없는 값을 다른 값으로 바꿔 적재하지 않고 호출부가 파일을 실패시킨다.
 */
export function decodeStringsLiteral(literal: string): string | undefined {
  const q = literal[0];
  if (q !== '"' && q !== "'") return literal;
  const body = literal.slice(1, -1);
  let out = "";
  const unit = (code: number) => (out += String.fromCharCode(code));
  for (let i = 0; i < body.length; i += 1) {
    const c = body.charCodeAt(i);
    if (c !== 0x5c) {
      unit(c);
      continue;
    }
    i += 1;
    const next = body[i] ?? "";
    if (Object.hasOwn(SIMPLE_ESCAPES, next)) unit(SIMPLE_ESCAPES[next]!);
    else if (next === "U") {
      const hex = /^[0-9A-Fa-f]{0,4}/.exec(body.slice(i + 1))![0];
      unit(hex === "" ? 0 : parseInt(hex, 16));
      i += hex.length;
    } else if (/[0-7]/.test(next)) {
      const oct = /^[0-7]{1,3}/.exec(body.slice(i))![0];
      const byte = parseInt(oct, 8);
      unit(byte < 0o200 ? byte : byte < 0o400 ? NEXTSTEP_HIGH[byte - 0o200]! : 0);
      i += oct.length - 1;
    } else unit(body.charCodeAt(i));
  }
  return wellFormed(out) ? out : undefined;
}

/** 짝 없는 서로게이트가 없는가 — `String.prototype.isWellFormed`(ES2024)는 tsconfig `lib` 밖이다. */
function wellFormed(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const low = text.charCodeAt(i + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) return false;
      i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

/**
 * 값 → 리터럴(따옴표 포함). **정규형**이다: `\` · 그 따옴표 · `\n` `\t` `\r`만 글자 이스케이프이고, 나머지 제어 문자는 `\Uxxxx`, 그 밖은 원문 그대로다.
 * `decode(encode(v)) === v`이고, 정규형 리터럴은 `encode(decode(l)) === l`이다 — 바뀌지 않은 셀은 이 함수를 지나지 않으므로 비정규 원본도 남는다.
 */
export function encodeStringsLiteral(value: string, quote: '"' | "'" = '"'): string {
  let out = quote;
  for (const c of value) {
    if (c === "\\" || c === quote) out += `\\${c}`;
    else if (c === "\n") out += "\\n";
    else if (c === "\t") out += "\\t";
    else if (c === "\r") out += "\\r";
    else if (c < " " || c === "\u007f") out += `\\U${c.charCodeAt(0).toString(16).padStart(4, "0")}`;
    else out += c;
  }
  return out + quote;
}

function stringsVerdict(content: string): CatalogVerdict {
  const parsed = tokenizeStrings(content);
  if (!parsed.ok) return "no";
  return parsed.entries.length === 0 ? "unknown" : "yes";
}

function detectCandidates(paths: readonly string[], probe?: FileProbe): DetectedFormat[] {
  const byTemplate = new Map<string, Set<string>>();
  for (const path of paths) {
    if (NOT_SOURCE.test(path)) continue;
    const m = STRINGS_FILE.exec(path);
    if (!m) continue;
    const [, dir = "", locale = "", table = ""] = m;
    // `Base.lproj`는 로케일 코드가 아니다(Base Internationalization — spec 비목표). `looksLikeLocale`이 대문자 시작을 받지 않아 함께 빠진다.
    if (!looksLikeLocale(locale)) continue;
    const template = `${dir}{locale}.lproj/${table}.strings`;
    (byTemplate.get(template) ?? byTemplate.set(template, new Set()).get(template)!).add(locale);
  }
  const groups = [...byTemplate].filter(([, s]) => hasStrongLocale(s)).map(([pathTemplate, locales]) => ({ pathTemplate, locales }));
  // `Localizable`을 앞세운다 — 테이블이 많은 리포에서 정답이 probe 예산(1패스 상위 5) 밖으로 밀리지 않게(design §5). 어댑터 간 정렬이 이 순서를
  // 지우므로 `detectCandidatesAcross`가 이 어댑터의 자리를 이 순서로 다시 채운다(`index.ts`).
  // ⚠️ 예제·픽스처 감점이 먼저다 — 재측정에서 ResearchKit의 `samples/…/Localizable.strings`가 정답 테이블을 눌렀다.
  const ranked = rankTemplateCandidates(groups);
  const tier = (g: { pathTemplate: string }) => (pathSignals(g.pathTemplate).aside ? 2 : 0) + (g.pathTemplate.endsWith(`/${MAIN_TABLE}`) ? 0 : 1);
  const ordered = ranked.map((g, i) => ({ g, i })).sort((a, b) => tier(a.g) - tier(b.g) || a.i - b.i).map(({ g }) => g);
  return ordered
    .filter((g) => !probe || verifySamples(g.pathTemplate, g.locales, probe, stringsVerdict))
    .map((g) => ({ adapter: "apple-strings" as const, pathTemplate: g.pathTemplate, locales: [...g.locales] }));
}

/**
 * Flutter 앱의 iOS·macOS 셸인가 — 템플릿이 `<root>ios/`·`<root>macos/` 아래이고 `<root>pubspec.yaml`이 있다. 셸의 `.strings`는 권한 문구 같은 플랫폼
 * 몫이고 앱 문자열은 ARB다. 재측정(T2.3)에서 smooth-app(ARB 128 · `ios/Runner` 129로케일)·Mono-Dash의 ARB 정답을 눌러 `detectCandidatesAcross`가
 * 맨 뒤로 보낸다. 빼지 않는다 — 둘째 소스로 연결한 표면의 CI가 탐지 목록에서 자기 템플릿을 찾는다.
 */
export function isFlutterShell(pathTemplate: string, paths: ReadonlySet<string>): boolean {
  const m = /^((?:[^/]*\/)*?)(?:ios|macos)\//.exec(pathTemplate);
  return m !== null && paths.has(`${m[1] ?? ""}pubspec.yaml`);
}

function detect(paths: readonly string[], probe?: FileProbe): DetectedFormat | undefined {
  return detectCandidates(paths, probe)[0];
}

function read(format: DetectedFormat, files: readonly AdapterFile[]): ReadResult {
  const locales: ReadLocale[] = [];
  const errors: AdapterError[] = [];
  for (const file of files) {
    const locale = localeFromPath(format.pathTemplate, file.path);
    if (locale === undefined) continue;
    const parsed = tokenizeStrings(file.content);
    if (!parsed.ok) {
      errors.push({ path: file.path, code: "parse-failed", detail: parsed.detail });
      continue;
    }
    // Apple처럼 나중 값이 이긴다 — 키 대입은 Map이라 `__proto__`도 own 키다. write도 그 나중 리터럴만 고쳐 잃는 번역이 없으므로
    // code-dict·ts-dict와 같은 경고(`duplicate-property`)다 — 대상 리포 CI를 red로 만들지 않는다(지휘자 결정 2026-10-19).
    const effective = new Map<string, StringsSlot>();
    const duplicated = new Set<string>();
    for (const slot of parsed.entries) {
      if (effective.has(slot.key) && !duplicated.has(slot.key)) {
        errors.push({ path: file.path, code: "duplicate-property", key: slot.key });
        duplicated.add(slot.key);
      }
      effective.set(slot.key, slot);
    }
    // ⚠️ **수술적 어댑터지만 `order`를 낸다** — 적재가 그것을 `sortIndex`로 옮겨야 비-base 파일의 누락 키를 기준 순서상 앞 키 뒤에 넣을 수 있다
    // (design §2.1). 값을 쓰는 엔트리(중복이면 나중 것)의 파일 위치 순서다.
    const entries: LocaleEntry[] = [...effective.values()].sort((a, b) => a.start - b.start).map((slot, order) => ({
      key: slot.key,
      // 토크나이저가 검증한 리터럴이라 `undefined`가 아니다.
      message: slot.value === undefined ? slot.key : decodeStringsLiteral(file.content.slice(slot.value.start, slot.value.end))!,
      order,
    }));
    entries.sort((a, b) => compareKeys(a.key, b.key));
    locales.push({ locale, entries });
  }
  locales.sort((a, b) => compareKeys(a.locale, b.locale));
  return { locales, errors, nested: false };
}

function write(format: DetectedFormat, input: WriteInput): string | null {
  return writeWithErrors(format, input).content;
}

type Edit = { at: number; end: number; text: string };

/** 줄의 들여쓰기(엔트리 앞이 공백뿐일 때만)와 `=` 앞뒤 간격 — 삽입 줄이 이웃을 따른다. */
function neighborStyle(text: string, slot: StringsSlot | undefined): { indent: string; separator: string } {
  if (slot === undefined) return { indent: "", separator: " = " };
  const lineStart = text.lastIndexOf("\n", slot.start - 1) + 1;
  const lead = text.slice(lineStart, slot.start);
  const between = slot.value === undefined ? "" : text.slice(slot.keyEnd, slot.value.start);
  return { indent: /^[ \t]*$/.test(lead) ? lead : "", separator: /^[ \t]*=[ \t]*$/.test(between) ? between : " = " };
}

/** 엔트리 뒤 삽입 자리 — 같은 줄에 줄 주석만 남았으면 그 줄 끝, 다른 것이 이어지면 `;` 바로 뒤다. */
function afterLine(text: string, slot: StringsSlot): number {
  let j = slot.end;
  while (text[j] === " " || text[j] === "\t") j += 1;
  if (text.startsWith("//", j)) {
    const nl = text.indexOf("\n", j);
    // CRLF면 CR 앞이다 — LF 자리에 넣으면 주석 줄 끝에 CR이 남고 새 줄은 LF로 끝난다(리뷰 Y1).
    j = nl === -1 ? text.length : nl > j && text[nl - 1] === "\r" ? nl - 1 : nl;
  }
  if (j < text.length && text[j] !== "\n" && text[j] !== "\r") return slot.end;
  return j;
}

/**
 * ⚠️ **파싱 실패는 "변경 없음"이 아니다** — 원본을 그대로 돌려주되 `write-parse-failed`로 알린다(code-dict와 같다). `write`만 부르면 호출부가
 * blob SHA가 같다고 읽어 그 파일이 PR에서 조용히 빠진다.
 */
function writeWithErrors(format: DetectedFormat, input: WriteInput): { content: string | null; errors: AdapterError[] } {
  // 원본은 위치가 아니라 경로로 고른다 — 호출부가 여러 파일을 실어도 남의 로케일 위에 치환하지 않는다(L3.6).
  const path = format.pathTemplate.replaceAll("{locale}", input.locale);
  const file = format.currentFiles?.find((c) => c.path === path);
  if (file === undefined) return { content: null, errors: [] };
  const text = file.content;
  const parsed = tokenizeStrings(text);
  if (!parsed.ok) return { content: text, errors: [{ path: file.path, code: "write-parse-failed", detail: parsed.detail }] };

  // 중복 키는 나중 엔트리가 값이다 — **가려진 앞 리터럴을 고치지 않는다**(POSTMORTEM 2026-10-07: 쓰기 성공과 값 전달을 같게 셌다).
  const slots = new Map<string, StringsSlot>();
  for (const slot of parsed.entries) slots.set(slot.key, slot);

  const edits: Edit[] = [];
  const missing: LocaleEntry[] = [];
  for (const entry of input.entries) {
    // orphaned·빈 값은 원본 값을 남긴다(불변식 3 — 수술적 표면은 비울 수 없다).
    if (entry.orphaned === true || entry.message === "") continue;
    const slot = slots.get(entry.key);
    if (slot === undefined) {
      missing.push(entry);
      continue;
    }
    if (slot.value === undefined) {
      if (entry.message !== slot.key) edits.push({ at: slot.keyEnd, end: slot.keyEnd, text: ` = ${encodeStringsLiteral(entry.message)}` });
      continue;
    }
    const literal = text.slice(slot.value.start, slot.value.end);
    if (decodeStringsLiteral(literal) === entry.message) continue;
    edits.push({ at: slot.value.start, end: slot.value.end, text: encodeStringsLiteral(entry.message, literal[0] === "'" ? "'" : '"') });
  }
  edits.push(...insertions(text, parsed.entries, slots, missing, input));

  // 뒤에서 앞으로 — 앞 치환이 뒤 범위를 밀지 않는다. 같은 자리를 두 번 쓰는 편집은 없다(삽입은 엔트리 `;` 뒤, 치환은 엔트리 안).
  let out = text;
  for (const edit of edits.sort((a, b) => b.at - a.at)) out = out.slice(0, edit.at) + edit.text + out.slice(edit.end);
  return { content: out, errors: [] };
}

/**
 * 누락 키의 삽입 편집. 자리는 **기준 순서(`order` = base `sortIndex`)상 바로 앞 키**의 엔트리 뒤이고, 그 키가 파일에 없으면 파일 끝이다(design §2.1).
 * 앞 키 후보는 파일에 있는 키 중 순서를 아는 것 — 값 있는 엔트리와 이 로케일만 값이 없는 키(`untranslated`)다. 먼저 넣은 누락 키도 다음 누락 키의
 * 앞 키가 된다(같은 자리에 순서대로 이어 붙는다).
 */
function insertions(text: string, all: readonly StringsSlot[], slots: ReadonlyMap<string, StringsSlot>, missing: readonly LocaleEntry[], input: WriteInput): Edit[] {
  if (missing.length === 0) return [];
  const orderOf = new Map<string, number>();
  for (const u of input.untranslated ?? []) if (u.order !== undefined) orderOf.set(u.key, u.order);
  for (const e of input.entries) if (e.order !== undefined && e.orphaned !== true) orderOf.set(e.key, e.order);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";

  const anchors = [...slots.values()].flatMap((slot) => {
    const order = orderOf.get(slot.key);
    return order === undefined ? [] : [{ order, at: afterLine(text, slot), style: neighborStyle(text, slot) }];
  });
  const groups = new Map<number, string[]>();
  const tail: string[] = [];
  const last = neighborStyle(text, all[all.length - 1]);
  const placed: { order: number; at: number | "end"; style: { indent: string; separator: string } }[] = [];
  const sorted = [...missing].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || compareKeys(a.key, b.key));
  for (const entry of sorted) {
    const order = entry.order;
    // 한 번 훑어 순서상 바로 앞 키를 고른다 — 새 파일에 수천 키를 한 번에 번역해도 정렬을 키마다 되풀이하지 않는다.
    let before: (typeof placed)[number] | undefined;
    if (order !== undefined) for (const a of [anchors, placed]) for (const c of a) if (c.order < order && (before === undefined || c.order > before.order)) before = c;
    const style = before?.style ?? last;
    const line = `${style.indent}${encodeStringsLiteral(entry.key)}${style.separator}${encodeStringsLiteral(entry.message)};`;
    if (before === undefined || before.at === "end") tail.push(line);
    else (groups.get(before.at) ?? groups.set(before.at, []).get(before.at)!).push(line);
    if (order !== undefined) placed.push({ order, at: before?.at ?? "end", style });
  }

  // 파일 끝은 한 편집이다 — 끝 개행이 없으면 "마지막 엔트리 뒤" 삽입도 파일 끝에 선다. 앞 키 뒤에 이어지는 줄이 먼저, 앞 키가 없는 줄이
  // 나중이다(리뷰 Y2 — 같은 offset의 편집 둘은 배열 순서에 기대 결과가 갈렸다).
  const atEnd = [...(groups.get(text.length) ?? []), ...tail];
  groups.delete(text.length);
  const edits: Edit[] = [...groups].map(([at, lines]) => ({ at, end: at, text: lines.map((l) => `${eol}${l}`).join("") }));
  if (atEnd.length > 0) {
    const endsWithLine = text.length === 0 || text === BOM || text.endsWith("\n");
    edits.push({ at: text.length, end: text.length, text: endsWithLine ? atEnd.map((l) => `${l}${eol}`).join("") : atEnd.map((l) => `${eol}${l}`).join("") });
  }
  return edits;
}

/**
 * 새 언어 파일(ADD의 create·revive). 기준 언어 파일에서 **BOM과 줄바꿈만** 빌리고 값·주석은 빌리지 않는다(design §2.1 — 선례 Weblate도 기준 값을
 * 복사하지 않는다). 인코딩은 파일 층이 기준 파일에서 물려준다. 값 있는 활성 키만 기준 순서로 쓴다 — 다음 번역은 write가 삽입한다.
 */
function create(format: DetectedFormat, input: WriteInput & { baseLocale: string }): { content: string | null; errors: AdapterError[] } {
  const path = format.pathTemplate.replaceAll("{locale}", input.locale);
  const source = format.representationSource;
  if (source === undefined) return { content: null, errors: [{ path, code: "write-create-unsupported", detail: "Base language file is missing" }] };
  const parsed = tokenizeStrings(source);
  if (!parsed.ok) return { content: null, errors: [{ path, code: "write-parse-failed", detail: parsed.detail }] };
  const entries = orderedEntries(input.entries).filter((e) => e.message !== "");
  if (entries.length === 0) return { content: null, errors: [] };
  const bom = source.charCodeAt(0) === 0xfeff ? BOM : "";
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  return { content: bom + entries.map((e) => `${encodeStringsLiteral(e.key)} = ${encodeStringsLiteral(e.message)};${eol}`).join(""), errors: [] };
}

export const appleStrings: Adapter = {
  name: "apple-strings",
  layout: "per-locale",
  writeStrategy: "surgical",
  detect,
  detectCandidates,
  read,
  write,
  writeWithErrors,
  create,
};
