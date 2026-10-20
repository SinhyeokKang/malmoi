import { parse } from "@xml-tools/parser";

import { isAndroidLocale } from "@/lib/locale-code";
export { isAndroidLocale } from "@/lib/locale-code";

import { localeFromPath } from "./chrome-locales";
import { compareKeys, orderedEntries, pathSignals, rankTemplateCandidates } from "./shared";
import type { Adapter, AdapterError, AdapterFile, DetectedFormat, FileProbe, LocaleEntry, ReadLocale, ReadResult, WriteInput } from "./types";
import { ANDROID_STRINGS_FILE } from "./android-paths";

/**
 * Android `res/values*​/strings.xml` (android-strings design §2) — Compose Multiplatform `composeResources/values*​/strings.xml`도 같다(orch 결정 2).
 *
 * ⚠️ **`per-locale` + 수술적 치환이다.** `<string>` 안쪽 범위만 다시 써 넣고, XML 선언·주석·들여쓰기·속성 따옴표·`translatable="false"`·`<plurals>`·
 * `<string-array>`는 원본 바이트 그대로다. **XML을 다시 직렬화하지 않는다** — 직렬화는 빈 줄·주석·엔티티 표기를 바꿔 고정점을 깬다(선례 Weblate·Tolgee).
 * `@xml-tools/parser`는 **읽기·offset 전용**이다(design §2.1).
 *
 * ⚠️ **기준 언어 파일은 템플릿 밖이다** — `values/strings.xml`(`basePath`)에는 언어 코드가 없어, 그 파일의 언어는 포맷의 `templateLocale`이 말한다.
 * 호출부(저장된 표면 `formatFromProject` · 적재 깔때기 `assemblePushInput` · survey)가 기준 언어 코드를 싣는다. 없으면 그 파일을 읽지 않는다.
 *
 * ⚠️ **값 문법(orch 결정 14)** — DB·화면 값에서 `<`는 언제나 실제 자식 태그의 시작이고 태그 문자열 그대로다. 글자 `<`는 `&lt;`로 남는다 — 파일의
 * `&lt;b&gt;`(Html.fromHtml이 읽는 글)와 실제 태그 `<b>`를 같은 값으로 풀면 편집한 셀이 Publish에서 글↔태그로 뒤집힌다. 글자 `&`는 `&`이고 바로 뒤가
 * `lt;`·`amp;`일 때만 `&amp;`다(파일 `&amp;lt;`와 `&lt;`가 다른 값이 되게). 그 밖의 엔티티·문자 참조와 aapt2 이스케이프·공백 규칙은 푼다.
 */

/** 기준 경로 규칙의 정본은 `android-paths.ts`다 — 클라이언트 모듈도 쓰는 잎이라 어댑터 그래프 밖에 둔다. */
export { ANDROID_STRINGS_FILE };

/** 빌드 산출물 — 커밋돼 있어도 소스가 아니다. survey 선택(`lib/survey/select.ts`)도 같은 거름을 쓴다. */
export const ANDROID_NOT_SOURCE = /(^|\/)build\//;

/** 원본 형 — 다시 쓸 때 지킨다(design §3). 따옴표로 감싼 값은 감싼 채, CDATA는 CDATA로. */
export type AndroidForm = { quoted: boolean; cdata: boolean };

export type AndroidSlot = {
  key: string;
  translatable: boolean;
  /** 리소스 참조(`@string/x`·`?attr/y`) — 번역할 글이 아니다. */
  reference: boolean;
  /** `<string …>…</string>` 전체. 끝은 배타. */
  element: { start: number; end: number };
  /** 안쪽 내용. self-closing이면 없다. */
  content: { start: number; end: number } | undefined;
  /** self-closing의 `/>`(앞 공백 포함) 범위 — 값을 넣을 때 `>…</string>`로 바꾼다. */
  selfClose: { start: number; end: number } | undefined;
  /** 값 문법(결정 14)으로 푼 값. */
  value: string;
  form: AndroidForm;
  /** `formatted` 속성 원문(`formatted="false"`) — 코드가 소유하는 키 메타데이터라 새 엔트리에 기준 파일의 것을 나른다(결정 18). */
  formatted: string | undefined;
};

type Root = {
  /** 루트 시작 태그 `<resources …>`의 끝(배타) — self-closing이면 없다. */
  closeTag: { start: number } | undefined;
  /** `<resources/>`의 `/>`(앞 공백 포함) 범위. */
  selfClose: { start: number; end: number } | undefined;
  /** 루트 시작 태그의 `xmlns:*` 속성 원문 — create가 나른다. */
  namespaces: string[];
  /** XML 선언 원문(있으면). */
  declaration: string | undefined;
};

export type AndroidTokenized =
  | { ok: true; slots: AndroidSlot[]; unmanaged: { key: string; start: number }[]; root: Root }
  | { ok: false; detail: string };

const BOM = String.fromCharCode(0xfeff);
const xmlSpace = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r";
/** aapt2가 접는 공백 — C `isspace`(ASCII). NBSP는 아니다. */
const aaptSpace = (c: string) => xmlSpace(c) || c === "\v" || c === "\f";
/** XML 1.0 `Char`가 아닌 코드 포인트 — expat이 거부한다(aapt2 오류). */
const xmlChar = (cp: number) => cp === 0x9 || cp === 0xa || cp === 0xd || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);
const RAW_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/**
 * 엔티티 참조 하나(`&amp;`·`&#8230;`·`&#x41;`) → 글자. XML에 담을 수 없거나 모르는 이름이면 `undefined`. 문자 참조는 **전체 형식**만 받는다 —
 * `parseInt`는 `&#12abc;`의 앞 숫자만 읽어 통과시킨다(리뷰 R2).
 */
function entityChar(ref: string): string | undefined {
  const body = ref.slice(1, -1);
  const dec = /^#([0-9]+)$/.exec(body);
  const hex = /^#x([0-9A-Fa-f]+)$/.exec(body);
  if (dec !== null || hex !== null) {
    const cp = dec !== null ? parseInt(dec[1]!, 10) : parseInt(hex![1]!, 16);
    return Number.isSafeInteger(cp) && xmlChar(cp) ? String.fromCodePoint(cp) : undefined;
  }
  return Object.hasOwn(NAMED, body) ? NAMED[body] : undefined;
}

/** 속성 값 원문(따옴표 포함) → 값. */
function attributeValue(raw: string): string | undefined {
  let out = "";
  const inner = raw.slice(1, -1);
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] !== "&") {
      out += inner[i];
      continue;
    }
    const end = inner.indexOf(";", i);
    const char = end === -1 ? undefined : entityChar(inner.slice(i, end + 1));
    if (char === undefined) return undefined;
    out += char;
    i = end;
  }
  return out;
}

/**
 * 파서 CST의 필요한 만큼만 — 타입 원본(`chevrotain`)은 전이 의존성이라 pnpm에서 직접 import할 수 없다. 끝 offset은 **포함**이다(T3.0d 실측).
 */
type CstToken = { image: string; startOffset: number; endOffset?: number };
type Located = { location?: { startOffset: number; endOffset?: number } };
type Node = Located & { name: string; children: Record<string, (Node | CstToken)[]> };
const tokens = (node: Node, name: string) => (node.children[name] ?? []) as CstToken[];
const nodes = (node: Node, name: string) => (node.children[name] ?? []) as Node[];
const startOf = (x: Node | CstToken) => ("image" in x ? x.startOffset : x.location!.startOffset);

/** 내용 조각 — 문서 순서. 글(원문·엔티티·CDATA)과 자식 태그. 주석·처리 지시는 aapt2가 값에서 버린다. */
type Piece = { kind: "text"; text: string } | { kind: "tag"; raw: string; span: boolean };

/** 원문 글 구간 → 글. 엔티티·문자 참조를 푼다. XML에 담을 수 없는 문자·모르는 엔티티면 진단 문자열이다. */
function rawText(source: string, out: Piece[]): string | undefined {
  if (RAW_CONTROL.test(source)) return "control character in text";
  // XML 파서(expat·javax)는 줄 끝을 LF 하나로 바꾼 뒤 읽는다 — 따옴표 안·Compose처럼 공백을 접지 않는 자리에서 CRLF가 두 글자로 남지 않게 한다.
  const raw = source.replace(/\r\n?/g, "\n");
  let text = "";
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== "&") {
      text += raw[i];
      continue;
    }
    const end = raw.indexOf(";", i);
    const char = end === -1 ? undefined : entityChar(raw.slice(i, end + 1));
    if (char === undefined) return `unknown or invalid entity at ${raw.slice(i, i + 12)}`;
    text += char;
    i = end;
  }
  if (text !== "") out.push({ kind: "text", text });
  return undefined;
}

/**
 * 요소 내용 `[start, end)`를 조각으로 편다. 자식 요소는 시작·끝 태그 원문을 그대로 싣는다. `<xliff:g>`는 스팬이 아니다(aapt2의 번역 제외 구간 — 공백
 * 접기가 이어진다). 실패하면 진단 문자열을 돌려준다.
 *
 * ⚠️ **글 구간은 파서 토큰이 아니라 원문에서 읽는다** — `@xml-tools/parser` 1.0.12의 렉서가 16진 문자 참조 `&#x41;`를 `&#x4` + 글 `1;`로 자른다
 * (T3.0d 실측). 요소·CDATA·주석·처리 지시 사이의 틈이 글이고, 엔티티는 `entityChar`가 푼다.
 */
function piecesOf(text: string, start: number, end: number, content: Node | undefined, out: Piece[]): string | undefined {
  const items: (Node | CstToken)[] = content === undefined ? [] : [
    ...nodes(content, "element"), ...tokens(content, "CData"), ...tokens(content, "Comment"), ...tokens(content, "PROCESSING_INSTRUCTION"),
  ].sort((a, b) => startOf(a) - startOf(b));
  let pos = start;
  for (const item of items) {
    const at = startOf(item);
    const gap = rawText(text.slice(pos, at), out);
    if (gap !== undefined) return gap;
    if ("image" in item) {
      pos = at + item.image.length;
      // CDATA — 안쪽 글은 aapt2에게 그냥 글이다(이스케이프·따옴표·공백 규칙을 그대로 지난다). 주석·처리 지시는 값이 아니다.
      if (item.image.startsWith("<![CDATA[")) {
        const inner = item.image.slice("<![CDATA[".length, -"]]>".length);
        if (RAW_CONTROL.test(inner)) return "control character in CDATA";
        out.push({ kind: "text", text: inner.replace(/\r\n?/g, "\n") });
      }
      continue;
    }
    const name = tokens(item, "Name")[0]!.image;
    const span = name !== "xliff:g";
    const loc = item.location!;
    pos = loc.endOffset! + 1;
    const startClose = tokens(item, "START_CLOSE")[0];
    if (startClose === undefined) {
      out.push({ kind: "tag", raw: text.slice(loc.startOffset, pos), span });
      continue;
    }
    const slashOpen = tokens(item, "SLASH_OPEN")[0]!.startOffset;
    out.push({ kind: "tag", raw: text.slice(loc.startOffset, startClose.endOffset! + 1), span });
    const inner = piecesOf(text, startClose.endOffset! + 1, slashOpen, nodes(item, "content")[0], out);
    if (inner !== undefined) return inner;
    out.push({ kind: "tag", raw: text.slice(slashOpen, pos), span });
  }
  return rawText(text.slice(pos, end), out);
}

/** 푼 결과 한 칸 — 글자(공백 접기로 생긴 칸인지 표시) 또는 태그 원문. */
type Out = { kind: "char"; c: string; collapsed: boolean } | { kind: "tag"; raw: string };

/**
 * aapt2 `StringBuilder`의 의미(aapt2 2.20 채록 — 테스트 픽스처)로 조각을 푼다:
 * - 따옴표 밖 공백(ASCII `isspace`)은 한 칸으로 접는다. **스팬 태그 경계(시작·끝)에서 접기와 따옴표 구간이 둘 다 다시 시작된다**(리뷰 R1 — `"  <b>x</b>  "`는
 *   `  x `다). 스팬이 없으면 접어서 생긴 앞뒤 칸을 자르고, 스팬이 있으면 자르지 않는다. `<xliff:g>`는 스팬이 아니라 둘 다 이어진다.
 * - `"`는 따옴표 구간을 열고 닫는다(글자가 아니다). `\` 이스케이프: `t`·`n`·`uXXXX`(서로게이트·NUL은 버린다), 그 밖은 그 글자. 끝의 `\`는 버린다.
 * - 따옴표 밖 이스케이프 안 된 `'`는 aapt2 오류지만 글자로 읽는다(design §3 — 그 셀이 바뀔 때만 정규형으로 다시 쓴다).
 * 잘못된 `\u`(16진이 아닌 글자)는 `undefined`다(aapt2 오류).
 */
function interpret(pieces: readonly Piece[]): Out[] | undefined {
  const out: Out[] = [];
  let quote = false;
  let lastSpace = false;
  let hasSpan = false;
  // 태그 사이의 글은 이어진 한 덩어리다 — 이스케이프가 엔티티·CDATA 경계를 넘을 수 있다(`&#92;n`).
  const runs: (string | { raw: string; span: boolean })[] = [];
  for (const p of pieces) {
    const last = runs[runs.length - 1];
    if (p.kind === "tag") runs.push({ raw: p.raw, span: p.span });
    else if (typeof last === "string") runs[runs.length - 1] = last + p.text;
    else runs.push(p.text);
  }
  for (const run of runs) {
    if (typeof run !== "string") {
      out.push({ kind: "tag", raw: run.raw });
      if (run.span) {
        hasSpan = true;
        lastSpace = false;
        quote = false;
      }
      continue;
    }
    const chars = Array.from(run);
    for (let i = 0; i < chars.length; i += 1) {
      const c = chars[i]!;
      if (!quote && aaptSpace(c)) {
        if (!lastSpace) out.push({ kind: "char", c: " ", collapsed: true });
        lastSpace = true;
        continue;
      }
      lastSpace = false;
      if (c === "\\") {
        i += 1;
        if (i >= chars.length) break;
        const e = chars[i]!;
        if (e === "t") out.push({ kind: "char", c: "\t", collapsed: false });
        else if (e === "n") out.push({ kind: "char", c: "\n", collapsed: false });
        else if (e === "u") {
          let value = 0;
          let n = 0;
          while (n < 4 && i + 1 < chars.length) {
            const h = chars[i + 1]!;
            if (!/^[0-9A-Fa-f]$/.test(h)) return undefined;
            value = value * 16 + parseInt(h, 16);
            i += 1;
            n += 1;
          }
          // aapt2는 서로게이트 하나하나를 UTF-8로 못 바꿔 버린다(채록). NUL은 DB(Postgres text)에 담을 수 없다.
          if (value !== 0 && (value < 0xd800 || value > 0xdfff)) out.push({ kind: "char", c: String.fromCharCode(value), collapsed: false });
        } else out.push({ kind: "char", c: e, collapsed: false });
      } else if (c === '"') quote = !quote;
      else out.push({ kind: "char", c, collapsed: false });
    }
  }
  if (!hasSpan) {
    const chars = out.filter((o): o is Extract<Out, { kind: "char" }> => o.kind === "char");
    const first = chars[0];
    const last = chars[chars.length - 1];
    return out.filter((o) => !(o.kind === "char" && o.collapsed && (o === first || o === last)));
  }
  return out;
}

/**
 * Compose Multiplatform 리소스 변환기의 의미(gradle 플러그인 1.12.2 `XmlValuesConverterTask` — 테스트의 채록 픽스처)로 조각을 푼다: 값은 DOM
 * `textContent`(엔티티·CDATA를 푼 글을 태그 없이 이은 것)에 `handleSpecialCharacters`를 건 것이다 — `\n`·`\t`·`\uXXXX`(정확히 4자리)만 풀고 그 앞이
 * `\\`의 둘째 글자면 그대로 둔 뒤, `\\`를 `\`로 줄인다. 공백 접기·따옴표 구간·`\'`·`\@` 이스케이프가 **없다**(aapt2와 다르다). 태그는 값에 원문
 * 그대로 남기되 Compose가 본 글의 같은 자리에 다시 끼운다(이스케이프가 태그를 건너도 그 함수의 결과와 같다).
 * 짝 없는 서로게이트나 NUL이 나오면 DB(UTF-8 text)에 담을 수 없어 `undefined`다.
 */
function interpretCompose(pieces: readonly Piece[]): Out[] | undefined {
  let text = "";
  const marks: { at: number; raw: string }[] = [];
  for (const p of pieces) {
    if (p.kind === "tag") marks.push({ at: text.length, raw: p.raw });
    else text += p.text;
  }
  const first = replaceMapped(text, /\\u[a-fA-F0-9]{4}|\\n|\\t/g, (() => {
    const doubles = new Set([...text.matchAll(/\\\\/g)].map((m) => m.index));
    return (match: string, at: number) => (doubles.has(at - 1) ? match : match === "\\n" ? "\n" : match === "\\t" ? "\t" : String.fromCharCode(parseInt(match.slice(2), 16)));
  })());
  const second = replaceMapped(first.text, /\\\\/g, () => "\\");
  const result = second.text;
  if (result.includes("\u0000") || !wellFormedUtf16(result)) return undefined;
  const out: Out[] = [];
  let next = 0;
  const at = (boundary: number) => second.map[first.map[boundary]!]!;
  for (const mark of marks) {
    const to = at(mark.at);
    for (; next < to; next += 1) out.push({ kind: "char", c: result[next]!, collapsed: false });
    out.push({ kind: "tag", raw: mark.raw });
  }
  for (; next < result.length; next += 1) out.push({ kind: "char", c: result[next]!, collapsed: false });
  // 서로게이트 쌍은 한 글자로 묶는다 — 값 문법(`toValue`)은 글자 단위다.
  return out.reduce<Out[]>((acc, o) => {
    const prev = acc[acc.length - 1];
    if (o.kind === "char" && prev?.kind === "char" && /[\ud800-\udbff]$/.test(prev.c) && /^[\udc00-\udfff]/.test(o.c)) prev.c += o.c;
    else acc.push(o);
    return acc;
  }, []);
}

/**
 * 정규식 치환 + 경계 대응표 — `map[k]`는 원문 경계 k(글자 k 앞)가 결과에서 놓이는 경계다. 치환된 구간 안의 경계는 치환 결과 뒤로 가고, **그대로 둔 매치
 * 안의 경계는 제자리다**(리뷰 R2-2 — `\\` 뒤 `\n`을 그대로 둘 때 끝으로 밀면 `\<b>n</b>`의 태그가 `n` 뒤로 간다).
 */
function replaceMapped(text: string, pattern: RegExp, replace: (match: string, at: number) => string): { text: string; map: number[] } {
  const map: number[] = [];
  let out = "";
  let pos = 0;
  for (const m of text.matchAll(pattern)) {
    for (; pos < m.index; pos += 1) {
      map[pos] = out.length;
      out += text[pos];
    }
    const rep = replace(m[0], m.index);
    map[pos] = out.length;
    for (let k = pos + 1; k < pos + m[0].length; k += 1) map[k] = out.length + (rep === m[0] ? k - pos : rep.length);
    out += rep;
    pos += m[0].length;
  }
  for (; pos < text.length; pos += 1) {
    map[pos] = out.length;
    out += text[pos];
  }
  map[text.length] = out.length;
  return { text: out, map };
}

/** 짝 없는 서로게이트가 없는가 — `String.prototype.isWellFormed`(ES2024)는 tsconfig `lib` 밖이다. */
function wellFormedUtf16(text: string): boolean {
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

/** 푼 결과 → 값 문법(결정 14). 글자 `<`는 `&lt;`, 바로 뒤 글자가 `lt;`·`amp;`인 `&`는 `&amp;`. */
function toValue(out: readonly Out[]): string {
  let value = "";
  for (let i = 0; i < out.length; i += 1) {
    const o = out[i]!;
    if (o.kind === "tag") value += o.raw;
    else if (o.c === "<") value += "&lt;";
    else if (o.c === "&") {
      let ahead = "";
      for (let j = i + 1; j < out.length && ahead.length < 4; j += 1) {
        const n = out[j]!;
        if (n.kind !== "char") break;
        ahead += n.c;
      }
      value += ahead.startsWith("lt;") || ahead.startsWith("amp;") ? "&amp;" : "&";
    } else value += o.c;
  }
  return value;
}

/** 리소스 참조 — aapt2가 문자열이 아니라 참조로 읽는다(`@string/app_name`·`@null`·`?attr/x`). */
const REFERENCE = /^(?:@(?:\+)?(?:[\w.]+:)?[\w-]+\/[\w.]+|@null|@empty|\?(?:[\w.]+:)?(?:[\w-]+\/)?[\w.]+)$/;

/** 요소 트리 전체의 닫는 태그 이름과 같은 속성 반복을 본다 — 파서는 둘 다 통과시킨다(T3.0d 실측). */
function wellFormed(node: Node): string | undefined {
  const name = tokens(node, "Name")[0]?.image;
  const end = tokens(node, "END_NAME")[0]?.image;
  if (end !== undefined && end !== name) return `closing tag </${end}> does not match <${name}>`;
  const seen = new Set<string>();
  for (const attribute of nodes(node, "attribute")) {
    const attr = tokens(attribute, "Name")[0]!.image;
    if (seen.has(attr)) return `duplicate attribute ${attr}`;
    seen.add(attr);
    const raw = tokens(attribute, "STRING")[0]?.image;
    if (raw === undefined || attributeValue(raw) === undefined) return `invalid attribute ${attr}`;
  }
  for (const content of nodes(node, "content")) for (const child of nodes(content, "element")) {
    const bad = wellFormed(child);
    if (bad !== undefined) return bad;
  }
  return undefined;
}

/**
 * `<resources>` 직속 `<string>`의 범위와 값을 파일 순서대로 낸다(T3.0d 실측 — offset은 JS 문자열 인덱스, 끝은 포함). 범위는 원본 좌표다(UTF-8 BOM 포함).
 * 주석 안의 `<string>`은 엔트리가 아니다. `<plurals>`·`<string-array>`는 `unmanaged`로 낸다. 중복 이름도 그대로 둔다(read가 알린다).
 */
export function tokenizeAndroid(text: string, dialect: AndroidDialect = "aapt2"): AndroidTokenized {
  const fail = (detail: string): AndroidTokenized => ({ ok: false, detail });
  // 파서는 BOM을 받지 않는다(T3.0d) — 건너뛰고 좌표를 되돌린다.
  const skip = text.startsWith(BOM) ? 1 : 0;
  const body = text.slice(skip);
  const parsed = parse(body);
  if (parsed.lexErrors.length > 0) return fail(parsed.lexErrors[0]!.message);
  if (parsed.parseErrors.length > 0) return fail(parsed.parseErrors[0]!.message);
  const document = parsed.cst as unknown as Node;
  const root = nodes(document, "element")[0];
  if (root === undefined || tokens(root, "Name")[0]?.image !== "resources") return fail("the root element is not <resources>");
  const bad = wellFormed(root);
  if (bad !== undefined) return fail(bad);

  const at = (offset: number) => offset + skip;
  const prolog = nodes(document, "prolog")[0] as (Node & Located) | undefined;
  const rootAttrs = nodes(root, "attribute") as (Node & Located)[];
  const attrRaw = (a: Node & Located) => body.slice(a.location!.startOffset, a.location!.endOffset! + 1);
  const afterAttrs = (element: Node, attrs: readonly (Node & Located)[]) =>
    attrs.length === 0 ? tokens(element, "Name")[0]!.endOffset! + 1 : attrs[attrs.length - 1]!.location!.endOffset! + 1;
  const rootStartClose = tokens(root, "START_CLOSE")[0];
  const rootLoc = (root as Located).location!;
  const rootInfo: Root = {
    closeTag: rootStartClose === undefined ? undefined : { start: at(tokens(root, "SLASH_OPEN")[0]!.startOffset) },
    selfClose: rootStartClose === undefined ? { start: at(afterAttrs(root, rootAttrs)), end: at(rootLoc.endOffset! + 1) } : undefined,
    namespaces: rootAttrs.filter((a) => /^xmlns(:|$)/.test(tokens(a, "Name")[0]!.image)).map(attrRaw),
    declaration: prolog === undefined ? undefined : body.slice(prolog.location!.startOffset, prolog.location!.endOffset! + 1),
  };

  const slots: AndroidSlot[] = [];
  const unmanaged: { key: string; start: number }[] = [];
  const content = nodes(root, "content")[0];
  for (const element of content === undefined ? [] : (nodes(content, "element") as (Node & Located)[])) {
    const kind = tokens(element, "Name")[0]!.image;
    const attrs = nodes(element, "attribute") as (Node & Located)[];
    const attr = (name: string) => {
      const found = attrs.find((a) => tokens(a, "Name")[0]!.image === name);
      return found === undefined ? undefined : attributeValue(tokens(found, "STRING")[0]!.image);
    };
    const key = attr("name");
    const loc = element.location!;
    if (kind === "plurals" || kind === "string-array") {
      if (key !== undefined) unmanaged.push({ key, start: at(loc.startOffset) });
      continue;
    }
    if (kind !== "string") continue;
    if (key === undefined) return fail("<string> missing 'name' attribute");
    const startClose = tokens(element, "START_CLOSE")[0];
    const inner = startClose === undefined ? undefined : { start: startClose.endOffset! + 1, end: tokens(element, "SLASH_OPEN")[0]!.startOffset };
    const pieces: Piece[] = [];
    const broken = inner === undefined ? undefined : piecesOf(body, inner.start, inner.end, nodes(element, "content")[0], pieces);
    if (broken !== undefined) return fail(broken);
    const out = dialect === "compose" ? interpretCompose(pieces) : interpret(pieces);
    if (out === undefined) return fail(`invalid escape in <string name="${key}">`);
    const raw = inner === undefined ? "" : body.slice(inner.start, inner.end);
    const children = nodes(element, "content")[0]?.children ?? {};
    const onlyCdata = (children.CData?.length ?? 0) === 1 && (children.element?.length ?? 0) === 0 && (children.reference?.length ?? 0) === 0
      && (nodes(element, "content")[0] === undefined || nodes(nodes(element, "content")[0]!, "chardata").every((c) => /^\s*$/.test(body.slice((c as Located).location!.startOffset, (c as Located).location!.endOffset! + 1))));
    slots.push({
      key,
      translatable: attr("translatable") !== "false",
      // Compose는 참조를 풀지 않는다 — `@string/x`도 글이다.
      reference: dialect === "aapt2" && REFERENCE.test(raw.trim()),
      element: { start: at(loc.startOffset), end: at(loc.endOffset! + 1) },
      content: inner === undefined ? undefined : { start: at(inner.start), end: at(inner.end) },
      selfClose: inner === undefined ? { start: at(afterAttrs(element, attrs)), end: at(loc.endOffset! + 1) } : undefined,
      value: toValue(out),
      form: { quoted: /^\s*"[\s\S]*"\s*$/.test(raw) && !onlyCdata, cdata: onlyCdata },
      formatted: (() => {
        const found = attrs.find((a) => tokens(a, "Name")[0]!.image === "formatted");
        return found === undefined ? undefined : attrRaw(found);
      })(),
    });
  }
  return { ok: true, slots, unmanaged, root: rootInfo };
}

/**
 * 값 의미의 출처 — `res/`는 aapt2, `composeResources/`는 Compose Multiplatform 리소스 변환기(리뷰 Y2). 둘은 따옴표·공백·이스케이프 해석이 다르다.
 */
export type AndroidDialect = "aapt2" | "compose";

/**
 * 템플릿 → 값 의미. **`values-{locale}/strings.xml` 바로 앞 리소스 디렉터리**가 신호다(`ANDROID_STRINGS_FILE`의 마지막 세그먼트) — 조상 이름이 아니다.
 * `composeResources/app/src/main/res/`는 aapt2가 컴파일하는 `res`다(리뷰 R2-1). 탐지·read·write·create가 이 판정 하나를 쓴다.
 */
export function dialectOf(pathTemplate: string): AndroidDialect {
  return ANDROID_STRINGS_FILE.exec(pathTemplate)?.[1]?.endsWith("composeResources/") === true ? "compose" : "aapt2";
}

/** 원문 내용 하나 → 값(결정 14). 담을 수 없는 원문(잘못된 `\u`·XML 오류)이면 `undefined`. */
export function decodeAndroidValue(raw: string, dialect: AndroidDialect = "aapt2"): string | undefined {
  const result = tokenizeAndroid(`<resources><string name="v">${raw}</string></resources>`, dialect);
  return result.ok && result.slots.length === 1 ? result.slots[0]!.value : undefined;
}

const NAME = /[A-Za-z_][\w:.-]*/y;
// XML의 공백(S)은 이 넷뿐이다 — `\s`는 NBSP·줄 구분자까지 받아, 파서가 거부하는 태그가 값 판정을 지나 키 없는 파일 실패가 된다(리뷰 R2-3).
const SPACE = /[ \t\r\n]*/y;
const EQ = /[ \t\r\n]*=[ \t\r\n]*/y;

/**
 * `value[i]`의 `<`에서 태그 하나를 읽는다. **XML 문법 그대로**만 받는다(리뷰 R2) — 이름, 시작 태그의 속성(따옴표 값, `<` 없음, `&`는 완전한 엔티티·문자
 * 참조, 같은 이름 반복 없음), 끝 태그는 속성 없음. 못 읽으면 `undefined`.
 */
function readTag(value: string, i: number): { raw: string; name: string; kind: "open" | "close" | "self" } | undefined {
  const at = (re: RegExp, from: number) => {
    re.lastIndex = from;
    const m = re.exec(value);
    return m === null ? undefined : { text: m[0], end: from + m[0].length };
  };
  let pos = i + 1;
  const closing = value[pos] === "/";
  if (closing) pos += 1;
  const name = at(NAME, pos);
  if (name === undefined) return undefined;
  pos = name.end;
  const seen = new Set<string>();
  for (;;) {
    const space = at(SPACE, pos)!;
    const rest = value.slice(space.end, space.end + 2);
    if (rest.startsWith(">") || (!closing && rest === "/>")) {
      const end = space.end + (rest.startsWith(">") ? 1 : 2);
      return { raw: value.slice(i, end), name: name.text, kind: closing ? "close" : rest === "/>" ? "self" : "open" };
    }
    // 끝 태그는 속성을 갖지 않는다. 속성 앞에는 공백이 있어야 한다.
    if (closing || space.text === "") return undefined;
    const attr = at(NAME, space.end);
    if (attr === undefined || seen.has(attr.text)) return undefined;
    seen.add(attr.text);
    const eq = at(EQ, attr.end);
    if (eq === undefined) return undefined;
    const quote = value[eq.end];
    if (quote !== '"' && quote !== "'") return undefined;
    const close = value.indexOf(quote, eq.end + 1);
    if (close === -1) return undefined;
    const inner = value.slice(eq.end + 1, close);
    if (inner.includes("<") || attributeValue(`${quote}${inner}${quote}`) === undefined) return undefined;
    pos = close + 1;
  }
}

type ValueToken = { kind: "char"; c: string } | { kind: "tag"; raw: string; name: string };

/** 값 → 글자·태그. `<`가 XML 태그를 시작하지 않거나 태그 짝이 맞지 않으면 `undefined`(결정 14 · 리뷰 R2). */
function tokensOfValue(value: string): ValueToken[] | undefined {
  const out: ValueToken[] = [];
  const open: string[] = [];
  for (let i = 0; i < value.length; ) {
    if (value.startsWith("&lt;", i)) {
      out.push({ kind: "char", c: "<" });
      i += 4;
    } else if (value.startsWith("&amp;", i)) {
      out.push({ kind: "char", c: "&" });
      i += 5;
    } else if (value[i] === "<") {
      const tag = readTag(value, i);
      if (tag === undefined) return undefined;
      if (tag.kind === "close" && open.pop() !== tag.name) return undefined;
      if (tag.kind === "open") open.push(tag.name);
      out.push({ kind: "tag", raw: tag.raw, name: tag.name });
      i += tag.raw.length;
    } else {
      const c = String.fromCodePoint(value.codePointAt(i)!);
      out.push({ kind: "char", c });
      i += c.length;
    }
  }
  return open.length === 0 ? out : undefined;
}

/**
 * **값의 태그 판정** — 값 문법(결정 14)에서 태그 원문을 순서대로 낸다. `<`가 XML 태그를 시작하지 않거나(속성 엔티티·중복 속성·끝 태그 속성 포함)
 * 짝이 맞지 않으면 `undefined`다. writer가 쓰기 전에 지나고, 저장 검증(batch E — orch 결정 17)도 같은 판정을 쓴다.
 */
export function androidValueTags(value: string): string[] | undefined {
  return tokensOfValue(value)?.flatMap((t) => (t.kind === "tag" ? [t.raw] : []));
}

/** aapt2 이스케이프 — 한 글자. 맨 앞 `@`·`?`는 참조로 읽히지 않게 이스케이프한다. */
function aaptChar(c: string, first: boolean, cdata: boolean, before: string): string {
  if (c === "\\" || c === '"' || c === "'") return `\\${c}`;
  if (c === "\n") return "\\n";
  if (c === "\t") return "\\t";
  if (c < " " || c === "\u007f") return `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;
  if (first && (c === "@" || c === "?")) return `\\${c}`;
  return xmlText(c, cdata, before);
}

/** Compose 이스케이프 — 한 글자. Compose는 `\\`·`\n`·`\t`·`\uXXXX`만 푼다 — 따옴표·`@`는 글자 그대로다. */
function composeChar(c: string, cdata: boolean, before: string): string {
  if (c === "\\") return "\\\\";
  if (c === "\n") return "\\n";
  if (c === "\t") return "\\t";
  if (c < " " || c === "\u007f") return `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;
  return xmlText(c, cdata, before);
}

/** XML 글 — `&`·글자 `<`는 엔티티, `]]>`의 `>`만 엔티티. CDATA 안은 그대로다. */
function xmlText(c: string, cdata: boolean, before: string): string {
  if (cdata) return c;
  if (c === "&") return "&amp;";
  if (c === "<") return "&lt;";
  if (c === ">" && before.endsWith("]]")) return "&gt;";
  return c;
}

/**
 * 값 → 원문 내용. **정규형**이다. `dialect`가 값 의미의 출처다(`dialectOf`).
 *
 * aapt2: `\`·`"`·`'`는 역슬래시, 개행·탭은 `\n`·`\t`, 그 밖의 제어 문자는 `\uXXXX`, 맨 앞 `@`·`?`만 역슬래시(중간은 그대로 — translate-toolkit #5064),
 * `&`·글자 `<`는 엔티티. aapt2가 접거나 자를 공백은 따옴표로 지킨다(Weblate 규칙):
 * - 스팬 태그가 없으면 앞뒤 공백·연속 공백이 있을 때 값 전체를 감싼다. 감싼 원본은 감싼 채다.
 * - 스팬 태그가 있으면 **스팬 경계 사이 구간마다** 연속 공백이 있을 때만 그 구간을 감싼다 — aapt2는 스팬 경계에서 따옴표 구간을 닫고 접기를 다시 시작하며
 *   앞뒤를 자르지 않는다(리뷰 R1 — 값 전체를 감싸면 경계 뒤 공백을 잃는다).
 * Compose: `\`·개행·탭·제어 문자만 이스케이프하고 따옴표로 감싸지 않는다(공백을 접지 않는다).
 * `form`은 원본 형이다 — CDATA는 CDATA로(태그·`]]>`가 있으면 엔티티 형). 값 문법(결정 14·R2)에 맞지 않으면 `undefined` — 호출부가 명시 실패로 알린다.
 */
export function encodeAndroidValue(value: string, form: Partial<AndroidForm> = {}, dialect: AndroidDialect = "aapt2"): string | undefined {
  const parts = tokensOfValue(value);
  if (parts === undefined) return undefined;
  const literal = parts.map((p) => (p.kind === "char" ? p.c : "")).join("");
  const cdata = form.cdata === true && parts.every((p) => p.kind === "char") && !literal.includes("]]>");
  const wrap = (body: string) => (cdata ? `<![CDATA[${body}]]>` : body);
  if (dialect === "compose") {
    let out = "";
    for (const p of parts) out += p.kind === "tag" ? p.raw : composeChar(p.c, cdata, out);
    return wrap(out);
  }
  // 스팬 경계로 나눈 구간 — 각 구간은 aapt2에게 따옴표·접기를 새로 시작하는 단위다. `<xliff:g>`는 경계가 아니다.
  const spans = parts.some((p) => p.kind === "tag" && p.name !== "xliff:g");
  const runs: ValueToken[][] = [[]];
  const between: string[] = [];
  for (const p of parts) {
    if (spans && p.kind === "tag" && p.name !== "xliff:g") {
      between.push(p.raw);
      runs.push([]);
    } else runs[runs.length - 1]!.push(p);
  }
  let first = true;
  const encodeRun = (run: readonly ValueToken[]) => {
    let out = "";
    for (const p of run) {
      if (p.kind === "tag") out += p.raw;
      else out += aaptChar(p.c, first, cdata, out);
      first = false;
    }
    return out;
  };
  if (!spans) {
    const quoted = form.quoted === true || literal.startsWith(" ") || literal.endsWith(" ") || literal.includes("  ");
    const body = encodeRun(parts);
    return wrap(quoted ? `"${body}"` : body);
  }
  let out = "";
  runs.forEach((run, i) => {
    const text = run.map((p) => (p.kind === "char" ? p.c : "")).join("");
    const body = encodeRun(run);
    out += text.includes("  ") ? `"${body}"` : body;
    if (i < between.length) {
      out += between[i];
      first = false;
    }
  });
  return wrap(out);
}

/** 탐지 순위 층 — main 소스셋(`src/main`·`src/commonMain`·`src/androidMain`)과 소스셋 없는 `<모듈>/res`가 0, flavor·빌드 타입이 1, 테스트·예제가 2. */
function tier(pathTemplate: string): number {
  if (pathSignals(pathTemplate).aside || /(^|\/)\.github\//.test(pathTemplate)) return 2;
  const set = /(^|\/)src\/([^/]+)\//.exec(pathTemplate)?.[2];
  if (set === undefined || /^(main|commonMain|androidMain)$/.test(set)) return 0;
  return /test/i.test(set) ? 2 : 1;
}

/** 공용 순위 신호(로케일 수·깊이)가 같을 때만 경로를 세그먼트로 견준다. 신호가 다르면 0 — 공용 순위(`rankTemplateCandidates`)를 따른다. */
function sameSignals(a: { pathTemplate: string; locales: ReadonlySet<string> }, b: { pathTemplate: string; locales: ReadonlySet<string> }): number {
  const [sa, sb] = [pathSignals(a.pathTemplate), pathSignals(b.pathTemplate)];
  if (a.locales.size !== b.locales.size || sa.depth !== sb.depth || sa.hint !== sb.hint) return 0;
  const as = a.pathTemplate.split("/");
  const bs = b.pathTemplate.split("/");
  for (let i = 0; i < Math.max(as.length, bs.length); i += 1) if (as[i] !== bs[i]) return compareKeys(as[i] ?? "", bs[i] ?? "");
  return 0;
}

/** 내용이 `<resources>` 루트의 XML인가. */
function resourcesVerdict(content: string, dialect: AndroidDialect): boolean {
  return tokenizeAndroid(content, dialect).ok;
}

function detectCandidates(paths: readonly string[], probe?: FileProbe): DetectedFormat[] {
  const groups = new Map<string, { locales: Set<string>; base: boolean }>();
  for (const path of paths) {
    if (ANDROID_NOT_SOURCE.test(path)) continue;
    const m = ANDROID_STRINGS_FILE.exec(path);
    if (!m) continue;
    const [, dir = "", qualifier] = m;
    const g = groups.get(dir) ?? groups.set(dir, { locales: new Set(), base: false }).get(dir)!;
    if (qualifier === undefined) g.base = true;
    else if (isAndroidLocale(qualifier)) g.locales.add(qualifier);
  }
  // `values/`가 없는 디렉터리는 기본 리소스가 없는 변형 오버레이다 — 기준 언어 파일이 없어 소스가 아니다.
  const candidates = [...groups].filter(([, g]) => g.base).map(([dir, g]) => ({ dir, pathTemplate: `${dir}values-{locale}/strings.xml`, locales: g.locales }));
  // flavor·테스트 소스셋보다 main이 앞이다 — 로케일 수가 같으면 경로순으로 `src/debug`가 `src/main`을 이겨 probe 예산 안 자리를 먼저 차지한다(NFCReader).
  // 마지막 비교는 경로를 **세그먼트로** 견준다 — 문자 순이면 `dokit-autotest/`가 `dokit/`보다 앞이다(`-` < `/`, DoKit 재측정).
  // 어댑터 간 정렬이 이 순서를 지우므로 `detectCandidatesAcross`가 이 어댑터의 자리를 이 순서로 다시 채운다(`index.ts`).
  const ranked = rankTemplateCandidates(candidates).map((g, i) => ({ g, i }));
  const ordered = ranked.sort((a, b) => tier(a.g.pathTemplate) - tier(b.g.pathTemplate) || sameSignals(a.g, b.g) || a.i - b.i).map(({ g }) => g);
  return ordered
    .filter((g) => {
      if (probe === undefined) return true;
      const content = probe(`${g.dir}values/strings.xml`);
      return content !== undefined && resourcesVerdict(content, dialectOf(g.pathTemplate));
    })
    .map((g) => ({ adapter: "android-strings" as const, pathTemplate: g.pathTemplate, basePath: `${g.dir}values/strings.xml`, locales: [...g.locales].sort(compareKeys) }));
}

function detect(paths: readonly string[], probe?: FileProbe): DetectedFormat | undefined {
  return detectCandidates(paths, probe)[0];
}

/** 파일 → 언어. 기준 언어 파일(basePath)은 `templateLocale`이다. */
function localeOfFile(format: DetectedFormat, path: string): string | undefined {
  if (format.basePath !== undefined && path === format.basePath) return format.templateLocale;
  return localeFromPath(format.pathTemplate, path);
}

function read(format: DetectedFormat, files: readonly AdapterFile[]): ReadResult {
  const locales: ReadLocale[] = [];
  const errors: AdapterError[] = [];
  for (const file of files) {
    const locale = localeOfFile(format, file.path);
    if (locale === undefined) continue;
    const parsed = tokenizeAndroid(file.content, dialectOf(format.pathTemplate));
    if (!parsed.ok) {
      errors.push({ path: file.path, code: "parse-failed", detail: parsed.detail });
      continue;
    }
    // 같은 이름은 aapt2 빌드 오류다(`duplicate value for resource`, translatable과 무관) — 어느 사본이 값인지 정할 수 없어 그 키를 싣지 않는다(orch 결정 8).
    const counts = new Map<string, number>();
    for (const slot of parsed.slots) counts.set(slot.key, (counts.get(slot.key) ?? 0) + 1);
    const reports: { start: number; error: AdapterError }[] = [];
    for (const [key, n] of counts) if (n > 1) reports.push({ start: parsed.slots.find((s) => s.key === key)!.element.start, error: { path: file.path, code: "duplicate-key", key } });
    for (const u of parsed.unmanaged) reports.push({ start: u.start, error: { path: file.path, code: "value-not-string", key: u.key } });
    const entries: LocaleEntry[] = [];
    for (const slot of parsed.slots) {
      if (counts.get(slot.key)! > 1 || !slot.translatable) continue;
      if (slot.reference) {
        reports.push({ start: slot.element.start, error: { path: file.path, code: "value-not-string", key: slot.key } });
        continue;
      }
      // ⚠️ **수술적 어댑터지만 `order`를 낸다** — 적재가 그것을 `sortIndex`로 옮겨야 비기준 파일의 누락 키를 기준 순서상 앞 키 뒤에 넣는다(design §2.1).
      entries.push({ key: slot.key, message: slot.value, order: entries.length });
    }
    errors.push(...reports.sort((a, b) => a.start - b.start).map((r) => r.error));
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

const attributeText = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const DEFAULT_INDENT = "    ";

/** 요소 줄의 들여쓰기 — 요소 앞이 공백뿐일 때만. */
function indentOf(text: string, start: number): string | undefined {
  const lead = text.slice(text.lastIndexOf("\n", start - 1) + 1, start);
  return /^[ \t]*$/.test(lead) ? lead : undefined;
}

/** 요소 뒤 삽입 자리 — 같은 줄에 주석만 남았으면 그 주석 뒤, CRLF면 CR 앞이다. */
function afterElement(text: string, end: number): number {
  let j = end;
  while (text[j] === " " || text[j] === "\t") j += 1;
  if (text.startsWith("<!--", j)) {
    const close = text.indexOf("-->", j);
    if (close !== -1) {
      const k = close + 3;
      let t = k;
      while (text[t] === " " || text[t] === "\t") t += 1;
      if (t >= text.length || text[t] === "\n" || text[t] === "\r") return k;
    }
  }
  return end;
}

/**
 * ⚠️ **파싱 실패·인코드 실패는 "변경 없음"이 아니다** — 원본을 그대로 돌려주되 `write-parse-failed`로 알린다. `write`만 부르면 호출부가 blob SHA가
 * 같다고 읽어 그 파일이 PR에서 조용히 빠진다.
 */
function writeWithErrors(format: DetectedFormat, input: WriteInput): { content: string | null; errors: AdapterError[] } {
  // 원본은 위치가 아니라 경로로 고른다(L3.6). 기준 언어 파일은 템플릿 밖이다 — 그 언어(`templateLocale`)일 때만 basePath를 본다.
  const path = format.pathTemplate.replaceAll("{locale}", input.locale);
  let file = format.currentFiles?.find((c) => c.path === path);
  const isBase = file === undefined && format.basePath !== undefined && format.templateLocale === input.locale;
  if (isBase) file = format.currentFiles?.find((c) => c.path === format.basePath);
  if (file === undefined) return { content: null, errors: [] };
  const text = file.content;
  const dialect = dialectOf(format.pathTemplate);
  const parsed = tokenizeAndroid(text, dialect);
  if (!parsed.ok) return { content: text, errors: [{ path: file.path, code: "write-parse-failed", detail: parsed.detail }] };

  const counts = new Map<string, number>();
  for (const slot of parsed.slots) counts.set(slot.key, (counts.get(slot.key) ?? 0) + 1);
  const slots = new Map(parsed.slots.filter((s) => counts.get(s.key) === 1).map((s) => [s.key, s]));

  const edits: Edit[] = [];
  const failed: AdapterError[] = [];
  /** 그 셀만 빠지는 오류 — 렌더가 셀 보류로 분류하고(`lib/pull/undeliverable.ts`) 같은 파일의 다른 셀은 쓴다. */
  const skipped: AdapterError[] = [];
  const missing: { entry: LocaleEntry; raw: string }[] = [];
  for (const entry of input.entries) {
    // orphaned·빈 값은 원본 값을 남긴다(불변식 3 — 수술적 표면은 비울 수 없다).
    if (entry.orphaned === true || entry.message === "") continue;
    // ⚠️ **비기준 파일에서 쓸 자리가 없는 셀은 키가 붙은 오류다** (audit 2026-10-20 #1) — 전달 판정(`planDelivery`)은 per-locale 표면에서 기준 파일만
    // 읽어 이 셀을 전달로 센다. 건너뛰기만 하면 값이 PR에 없는데 토큰이 지워진다(POSTMORTEM 2026-10-07). 기준 파일은 알리지 않는다 — read가 그 키를
    // 내지 않아 판정이 이미 보류로 센다(B3.4). 같은 이름이 둘이면(aapt2 오류) 어느 사본도 고치지 않고 파일 전체가 실패다(프로젝트 차단).
    if (counts.has(entry.key) && !slots.has(entry.key)) {
      if (!isBase) failed.push({ path: file.path, code: "key-shadowed", key: entry.key });
      continue;
    }
    const slot = slots.get(entry.key);
    // 값이 같으면 파일이 이미 그 값을 갖고 있다 — 전달로 세는 것이 참이다. 이 비교를 아래 보류보다 뒤에 두면 파일이 이미 가진 값의 편집이 보류로 남아
    // 토큰이 풀리지 않는다(리뷰 W2). 값을 견줘 하나를 고르는 것이 아니라 "쓸 것이 없다"는 판정이다.
    if (slot !== undefined && slot.value === entry.message) continue;
    // 참조·`translatable="false"`는 그 셀만 빠진다(리뷰 Y1 · 결정 D9) — 편집이 아닌 옛 DB 값은 토큰이 없어 아무것도 막지 않는다.
    if (slot !== undefined && (!slot.translatable || slot.reference)) {
      if (!isBase) skipped.push({ path: file.path, code: "write-slot-not-string-literal", key: entry.key, detail: slot.translatable ? "resource reference" : 'translatable="false"' });
      continue;
    }
    const raw = encodeAndroidValue(entry.message, slot?.form, dialect);
    if (raw === undefined) {
      failed.push({ path: file.path, code: "write-parse-failed", key: entry.key, detail: UNWRITABLE });
      continue;
    }
    if (slot === undefined) {
      // 기준 언어 파일에는 넣지 않는다 — 키 존재는 코드가 정한다(B3.4). 렌더도 원본 키로 거른다.
      if (!isBase) missing.push({ entry, raw });
    } else if (slot.content !== undefined) edits.push({ at: slot.content.start, end: slot.content.end, text: raw });
    else edits.push({ at: slot.selfClose!.start, end: slot.selfClose!.end, text: `>${raw}</string>` });
  }
  if (failed.length > 0) return { content: text, errors: failed };
  edits.push(...insertions(text, parsed, slots, missing, input, baseFormatted(format, dialect)));

  // 뒤에서 앞으로 — 앞 치환이 뒤 범위를 밀지 않는다. 같은 자리를 두 번 쓰는 편집은 없다(삽입은 요소 뒤·닫는 태그 앞 한 자리로 모인다).
  let out = text;
  for (const edit of edits.sort((a, b) => b.at - a.at)) out = out.slice(0, edit.at) + edit.text + out.slice(edit.end);
  // 쓴 결과도 읽혀야 한다 — 값 하나하나를 검사해도 이어 붙인 결과가 XML이 아니면 PR이 깨진 파일을 싣는다(리뷰 R2의 마지막 그물).
  const check = tokenizeAndroid(out, dialect);
  if (!check.ok) return { content: text, errors: [{ path: file.path, code: "write-parse-failed", detail: `the written file is not valid XML: ${check.detail}` }] };
  return { content: out, errors: skipped };
}

const UNWRITABLE = "the value has a < that does not start a well-formed XML tag";

/**
 * 기준 파일의 키별 `formatted` 속성 원문(결정 18) — 렌더가 비기준 쓰기에 기준 파일을 `representationSource`로 싣는다. 값이 아니라 코드가 소유하는 키
 * 메타데이터라 키마다 출처가 하나다(arb `@key`와 같은 부류 — 병합이 아니다). 기준 파일을 못 읽으면 속성 없이 넣는다.
 */
function baseFormatted(format: DetectedFormat, dialect: AndroidDialect): ReadonlyMap<string, string> {
  const source = format.representationSource;
  const parsed = source === undefined ? undefined : tokenizeAndroid(source, dialect);
  return new Map(parsed?.ok ? parsed.slots.flatMap((s) => (s.formatted === undefined ? [] : [[s.key, s.formatted] as const])) : []);
}

/** 새 `<string>` 줄 — `formatted`는 기준 파일의 속성 원문 그대로다. */
const stringLine = (key: string, raw: string, formatted: string | undefined) =>
  `<string name="${attributeText(key)}"${formatted === undefined ? "" : ` ${formatted}`}>${raw}</string>`;

/**
 * 누락 키의 삽입 편집. 자리는 **기준 순서(`order`)상 바로 앞 키**의 `<string>` 뒤이고, 그 키가 파일에 없으면 `</resources>` 앞이다(design §2.1).
 * 앞 키 후보는 파일에 있는 키 중 순서를 아는 것 — 값 있는 엔트리와 이 언어만 값이 없는 키(`untranslated`)다. 들여쓰기·줄바꿈은 이웃에서 빌린다.
 */
function insertions(
  text: string,
  parsed: Extract<AndroidTokenized, { ok: true }>,
  slots: ReadonlyMap<string, AndroidSlot>,
  missing: readonly { entry: LocaleEntry; raw: string }[],
  input: WriteInput,
  formatted: ReadonlyMap<string, string>,
): Edit[] {
  if (missing.length === 0) return [];
  const orderOf = new Map<string, number>();
  for (const u of input.untranslated ?? []) if (u.order !== undefined) orderOf.set(u.key, u.order);
  for (const e of input.entries) if (e.order !== undefined && e.orphaned !== true) orderOf.set(e.key, e.order);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lastChild = parsed.slots[parsed.slots.length - 1];
  const fallbackIndent = (lastChild === undefined ? undefined : indentOf(text, lastChild.element.start)) ?? DEFAULT_INDENT;

  type Anchor = { order: number; at: number | "end"; indent: string };
  const anchors: Anchor[] = [...slots.values()].flatMap((slot) => {
    const order = orderOf.get(slot.key);
    return order === undefined ? [] : [{ order, at: afterElement(text, slot.element.end), indent: indentOf(text, slot.element.start) ?? fallbackIndent }];
  });
  const groups = new Map<number, string[]>();
  const tail: string[] = [];
  const placed: Anchor[] = [];
  const sorted = [...missing].sort((a, b) => (a.entry.order ?? Infinity) - (b.entry.order ?? Infinity) || compareKeys(a.entry.key, b.entry.key));
  for (const { entry, raw } of sorted) {
    const order = entry.order;
    let before: Anchor | undefined;
    if (order !== undefined) for (const list of [anchors, placed]) for (const c of list) if (c.order < order && (before === undefined || c.order > before.order)) before = c;
    const indent = before?.indent ?? fallbackIndent;
    const line = `${indent}${stringLine(entry.key, raw, formatted.get(entry.key))}`;
    if (before === undefined || before.at === "end") tail.push(line);
    else (groups.get(before.at) ?? groups.set(before.at, []).get(before.at)!).push(line);
    if (order !== undefined) placed.push({ order, at: before?.at ?? "end", indent });
  }

  // 한 offset에는 편집 하나다 — 닫는 태그가 마지막 요소와 같은 줄이면 꼬리 자리가 그 요소 뒤 자리와 같다. 앞 키 뒤 줄이 먼저, 꼬리 줄이 나중이다
  // (POSTMORTEM 2026-09-16 · apple-strings 리뷰 Y2 — 같은 offset의 편집 둘은 정렬이 입력 순서에 기대 결과가 갈렸다).
  const at = new Map<number, string>([...groups].map(([offset, lines]) => [offset, lines.map((l) => `${eol}${l}`).join("")]));
  const edits: Edit[] = [];
  if (tail.length > 0) {
    const { root } = parsed;
    if (root.selfClose !== undefined) {
      edits.push({ at: root.selfClose.start, end: root.selfClose.end, text: `>${eol}${tail.map((l) => `${l}${eol}`).join("")}</resources>` });
    } else {
      const close = root.closeTag!.start;
      const lineStart = text.lastIndexOf("\n", close - 1) + 1;
      // 닫는 태그가 제 줄에 있으면 그 줄 앞에 줄로 넣고, 아니면(한 줄 파일) 닫는 태그 바로 앞에 줄을 연다.
      if (lineStart > 0 && /^[ \t]*$/.test(text.slice(lineStart, close))) at.set(lineStart, (at.get(lineStart) ?? "") + tail.map((l) => `${l}${eol}`).join(""));
      else at.set(close, `${at.get(close) ?? ""}${tail.map((l) => `${eol}${l}`).join("")}${eol}`);
    }
  }
  edits.push(...[...at].map(([offset, insert]) => ({ at: offset, end: offset, text: insert })));
  return edits;
}

/**
 * 새 언어 파일(ADD의 create·revive). 기준 언어 파일에서 **뼈대만** 빌린다 — BOM·XML 선언·줄바꿈·들여쓰기·`<resources>`와 네임스페이스 속성(design §2).
 * 주석·`translatable="false"`·`<plurals>`·기준 값은 싣지 않는다(선례 Weblate도 기준 값을 복사하지 않는다). 값 있는 활성 키만 기준 순서로 쓰고,
 * 키마다 기준 파일의 CDATA 형을 따른다. 다음 번역은 write가 삽입한다.
 */
function create(format: DetectedFormat, input: WriteInput & { baseLocale: string }): { content: string | null; errors: AdapterError[] } {
  const path = format.pathTemplate.replaceAll("{locale}", input.locale);
  const source = format.representationSource;
  if (source === undefined) return { content: null, errors: [{ path, code: "write-create-unsupported", detail: "Base language file is missing" }] };
  const dialect = dialectOf(format.pathTemplate);
  const parsed = tokenizeAndroid(source, dialect);
  if (!parsed.ok) return { content: null, errors: [{ path, code: "write-parse-failed", detail: parsed.detail }] };
  const entries = orderedEntries(input.entries).filter((e) => e.message !== "");
  if (entries.length === 0) return { content: null, errors: [] };
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const first = parsed.slots[0];
  const indent = (first === undefined ? undefined : indentOf(source, first.element.start)) ?? DEFAULT_INDENT;
  const bySlot = new Map(parsed.slots.map((s) => [s.key, s]));
  const lines: string[] = [];
  for (const e of entries) {
    const slot = bySlot.get(e.key);
    const raw = encodeAndroidValue(e.message, slot === undefined ? {} : { cdata: slot.form.cdata }, dialect);
    if (raw === undefined) return { content: null, errors: [{ path, code: "write-parse-failed", key: e.key, detail: UNWRITABLE }] };
    // `formatted`는 기준 `<string>`의 속성 원문 그대로다(결정 18) — 빠지면 위치 없는 `%s %d`가 aapt2 오류다.
    lines.push(`${indent}${stringLine(e.key, raw, slot?.formatted)}${eol}`);
  }
  const { root } = parsed;
  const bom = source.startsWith(BOM) ? BOM : "";
  const head = `${bom}${root.declaration === undefined ? "" : `${root.declaration}${eol}`}`;
  const open = `<resources${root.namespaces.map((n) => ` ${n}`).join("")}>`;
  const content = `${head}${open}${eol}${lines.join("")}</resources>${/\r?\n$/.test(source) ? eol : ""}`;
  const check = tokenizeAndroid(content, dialect);
  if (!check.ok) return { content: null, errors: [{ path, code: "write-parse-failed", detail: `the created file is not valid XML: ${check.detail}` }] };
  return { content, errors: [] };
}

export const androidStrings: Adapter = {
  name: "android-strings",
  layout: "per-locale",
  writeStrategy: "surgical",
  detect,
  detectCandidates,
  read,
  write,
  writeWithErrors,
  create,
};
