import { CST, isAlias, isMap, isScalar, isSeq, parseDocument, stringify, type Document, type Node, type Scalar, type YAMLMap } from "yaml";

import { KEY_SEP } from "./json-style";
import {
  compareKeys,
  hasStrongLocale,
  looksLikeLocale,
  rankTemplateCandidates,
  splitLocaleSuffix,
  verdictFromValues,
  verifySamples,
  type CatalogVerdict,
} from "./shared";
import type {
  Adapter,
  AdapterError,
  AdapterFile,
  DetectedFormat,
  FileProbe,
  LocaleEntry,
  ReadLocale,
  ReadResult,
  WriteInput,
} from "./types";
import { localeFromPath } from "./chrome-locales";

/**
 * YAML 카탈로그 — `<dir>/{locale}.y(a)ml`.
 *
 * 오픈소스 109개에서 미지원 36개 중 **17개가 YAML**이었다 — 가장 큰 덩어리다 (mastodon 106로케일·
 * decidim 82·directus 69·redmine 50·misskey 42). `docs/ARCHITECTURE §1.9` §1①·§7.
 *
 * ⚠️ **`per-locale` + 수술적 치환이다.** 재생성으로 쓰면 Rails 로케일 파일의 주석·앵커·블록
 * 리터럴이 첫 pull에서 사라진다 — TS 딕셔너리에서 이미 겪은 구조 파괴다. `yaml` 패키지의
 * `parseDocument`가 CST를 들고 있어 스칼라만 갈아끼울 수 있다 (ARCHITECTURE §1.4).
 *
 * **루트 키 변형이 둘이다.** Rails는 최상위가 로케일 코드 하나(`ko:`)이고 그 아래가 내용인데,
 * misskey·directus는 루트에 바로 키가 온다. **`write`가 원본에서 직접 관측한다** — read가 돌려준
 * 값을 계약에 실어 나르지 않는다(전엔 `rootKeyedByPath`가 있었는데 write가 그걸 안 믿었다).
 */

const SEP = KEY_SEP;
const YAML_FILE = /^(.*\/)([^/]+)\.(ya?ml)$/;

/**
 * ⚠️ **`.github/` 아래는 잡지 않는다.** CI 설정이 `{locale}.yml`처럼 보이는 일이 흔하다 — 실측에서
 * immich·bitwarden·Shopify가 `.github/workflows/{ko,en}.yml`로 후보를 냈다. probe가 `on: push`를
 * 카탈로그로 읽어버리므로 경로에서 막는 편이 확실하다.
 */
const NEVER = /(^|\/)\.github\//;

function detectCandidates(paths: readonly string[], probe?: FileProbe): DetectedFormat[] {
  /**
   * `pathTemplate` → 로케일 집합. 확장자가 섞이면 별 후보다.
   *
   * ⚠️ **키가 디렉터리가 아니라 템플릿이다** (2026-09-02 3차). 접두사 붙은 파일명을 받게 되면서
   * 한 디렉터리가 후보를 여럿 낸다 — discourse의 `config/locales/`가 `client.{locale}.yml`과
   * `server.{locale}.yml` 둘이다. 디렉터리로 묶으면 그 둘이 한 그룹으로 뭉개진다.
   */
  const byTemplate = new Map<string, Set<string>>();
  const add = (template: string, locale: string): void => {
    const set = byTemplate.get(template) ?? new Set();
    set.add(locale);
    byTemplate.set(template, set);
  };

  for (const path of paths) {
    if (NEVER.test(path)) continue;
    const m = YAML_FILE.exec(path);
    if (!m) continue;
    const [, dir = "", base = "", ext = "yml"] = m;
    if (looksLikeLocale(base)) {
      add(`${dir}{locale}.${ext}`, base);
      continue;
    }
    // `config/locales/client.ar.yml` — discourse가 Rails 관례로 접두사를 붙인다.
    const split = splitLocaleSuffix(base);
    if (split) add(`${dir}${split.prefix}{locale}.${ext}`, split.locale);
  }

  const candidates = rankTemplateCandidates(
    [...byTemplate.entries()]
      // 강한 로케일 코드가 없으면 로케일 모음이 아니다 — `shared.hasStrongLocale`.
      .filter(([, s]) => s.size >= 2 && hasStrongLocale(s))
      .map(([pathTemplate, locales]) => ({ pathTemplate, locales })),
  );

  const found: DetectedFormat[] = [];
  for (const { pathTemplate, locales } of candidates) {
    if (probe && !verifySamples(pathTemplate, locales, probe, yamlVerdict)) continue;
    found.push({ adapter: "yaml-catalog", pathTemplate, locales: [...locales] });
  }
  return found;
}

function detect(paths: readonly string[], probe?: FileProbe): DetectedFormat | undefined {
  return detectCandidates(paths, probe)[0];
}

/**
 * 중복 키를 **에러로 만들지 않는** 파싱 옵션.
 *
 * ⚠️ `yaml`은 `Map keys must be unique`를 에러로 보고한다. 그걸 "카탈로그 아님"으로 읽으면 데이터
 * 흠 하나가 리포 전체를 탐지에서 지운다 — your-priorities의 **62로케일 카탈로그**가 중복 키 6개
 * 때문에 통째로 버려졌다. 중복은 `read`가 **보고하되** 탐지를 막지 않는다 (ARCHITECTURE §1.3의
 * `catalogVerdict` 완화와 같은 축).
 */
const PARSE_OPTS = { uniqueKeys: false } as const;

/** JSON과 같은 판정 규칙을 YAML 파싱 결과에 적용한다 (`shared.verdictFromValues`). */
function yamlVerdict(content: string): CatalogVerdict {
  let value: unknown;
  try {
    const doc = parseDocument(content, PARSE_OPTS);
    if (doc.errors.length > 0) return "no";
    value = doc.toJS();
  } catch {
    return "no";
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return "no";
  const top = value as Record<string, unknown>;
  // Rails식 루트 키면 한 겹 벗기고 본다 — 안 그러면 값이 항상 객체 1개라 판정이 무의미하다.
  const names = Object.keys(top);
  const only = names.length === 1 ? names[0] : undefined;
  const inner = only !== undefined && looksLikeLocale(only) ? top[only] : undefined;
  const target = inner !== null && typeof inner === "object" && !Array.isArray(inner) ? (inner as Record<string, unknown>) : top;
  return verdictFromValues(Object.values(target));
}

/** 최상위가 로케일 코드 하나로 감싸여 있는가 (Rails 관례). */
function rootKeyOf(doc: Document): string | undefined {
  const contents = doc.contents;
  if (!isMap(contents) || contents.items.length !== 1) return undefined;
  const item = contents.items[0];
  if (item === undefined) return undefined;
  const key = isScalar(item.key) ? String(item.key.value) : undefined;
  if (key === undefined || !looksLikeLocale(key)) return undefined;
  return isMap(item.value) ? key : undefined;
}

function read(format: DetectedFormat, files: readonly AdapterFile[]): ReadResult {
  const locales: ReadLocale[] = [];
  const errors: AdapterError[] = [];

  for (const file of files) {
    const locale = localeFromPath(format.pathTemplate, file.path);
    if (locale === undefined) continue;

    let doc: Document;
    try {
      doc = parseDocument(file.content, PARSE_OPTS);
    } catch (cause) {
      errors.push({ path: file.path, code: "parse-failed", detail: (cause as Error).message });
      continue;
    }
    if (doc.errors.length > 0) {
      errors.push({ path: file.path, code: "parse-failed", detail: doc.errors[0]?.message ?? "unknown" });
      continue;
    }

    const rootKey = rootKeyOf(doc);
    const root = rootKey === undefined ? doc.contents : (doc.getIn([rootKey], true) as Node | undefined);
    if (root === undefined || root === null) {
      errors.push({ path: file.path, code: "root-not-object" });
      continue;
    }
    if (!isMap(root)) {
      errors.push({ path: file.path, code: "root-not-object" });
      continue;
    }

    const collected: LocaleEntry[] = [];
    collect(root, "", collected, errors, file.path);
    // 중복 키는 **마지막이 이긴다** — YAML 로더의 의미와 같다. 위 `collect`가 사실을 이미
    // 보고했으므로 여기서는 값만 정한다. 안 하면 같은 키가 두 번 실려 push 페이로드가 흔들린다.
    const byKey = new Map<string, LocaleEntry>();
    for (const e of collected) byKey.set(e.key, e);
    const entries = [...byKey.values()].sort((a, b) => compareKeys(a.key, b.key));
    locales.push({ locale, entries });
  }

  locales.sort((a, b) => compareKeys(a.locale, b.locale));
  // YAML은 중첩이 기본이라 이 값이 write 분기에 쓰이지 않는다 — 수술적 치환이므로 원본이 모양을 정한다.
  return { locales, errors, nested: true };
}

/**
 * 스칼라 리프를 모은다.
 *
 * ⚠️ **알리아스(`*ref`)는 리프가 아니다.** 편집하면 앵커 관계가 깨지고, 값의 출처는 앵커 쪽이다.
 * 조용히 건너뛴다 — 에러가 아니라 구조적으로 편집 대상이 아니라는 뜻이다.
 */
function collect(
  node: Node,
  prefix: string,
  out: LocaleEntry[],
  errors: AdapterError[],
  path: string,
): void {
  if (isMap(node)) {
    const seen = new Set<string>();
    for (const item of node.items) {
      const name = isScalar(item.key) ? String(item.key.value) : undefined;
      if (name === undefined) continue;
      const key = prefix === "" ? name : `${prefix}${SEP}${name}`;
      // 중복 키는 값 하나가 사라진다 — 탐지를 막지는 않되(위 `PARSE_OPTS`) 사실은 알린다.
      if (seen.has(name)) errors.push({ path, code: "duplicate-key", key });
      else seen.add(name);
      if (item.value !== null && item.value !== undefined) collect(item.value as Node, key, out, errors, path);
    }
    return;
  }
  if (isSeq(node)) {
    node.items.forEach((v, i) => {
      const key = prefix === "" ? String(i) : `${prefix}${SEP}${i}`;
      if (v !== null && v !== undefined) collect(v as Node, key, out, errors, path);
    });
    return;
  }
  if (isAlias(node)) return;
  if (isScalar(node)) {
    if (typeof node.value === "string") out.push({ key: prefix, message: node.value });
    else if (node.value !== null) {
      errors.push({ path, code: "value-not-string", key: prefix, detail: typeof node.value });
    }
    return;
  }
}

function write(format: DetectedFormat, input: WriteInput): string | null {
  return writeWithErrors(format, input).content;
}

type Replacement = { start: number; end: number; text: string; indent?: number };

/** CST는 문자열 타입 판정을 하지 않으므로 스키마 판정은 serializer에 맡긴다. */
function flowString(value: string, doc: Document, type?: Scalar.Type): string {
  return stringify(value, {
    version: doc.directives?.yaml.version ?? "1.2",
    defaultStringType: type === "QUOTE_SINGLE" ? "QUOTE_SINGLE" : type === "QUOTE_DOUBLE" || value.includes("\n") ? "QUOTE_DOUBLE" : "PLAIN",
    blockQuote: false,
    doubleQuotedAsJSON: true,
    collectionStyle: "flow",
    lineWidth: 0,
  }).slice(0, -1);
}

function scalarReplacement(source: string, doc: Document, node: Scalar, value: string): Replacement {
  const [start, end] = node.range!;
  const token = node.srcToken;
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  if (token?.type === "block-scalar") {
    const header = CST.stringify(token.props[0]!);
    const explicit = /[1-9]/.exec(header)?.[0];
    let indent = explicit ? token.indent + Number(explicit)
      : /^( *)\S/m.exec(token.source)?.[1]?.length ?? token.indent + 2;
    /*
      ⚠️ **9는 YAML 명시 들여쓰기 지시자가 한 자리이기 때문이다** (`|4` · `>2` — 1~9만 쓸 수 있다).
      원본에서 관측한 들여쓰기가 부모보다 9를 넘으면 **그 폭을 지시자로 표현할 방법이 없고**,
      선행 공백·개행으로 시작하는 값은 지시자가 없으면 첫 줄이 들여쓰기로 먹혀 값이 달라진다.
      그 조합에서만 기본값(+2)으로 내린다 — 표현할 수 없는 폭을 고집하면 값이 깨진다.
    */
    if (!explicit && indent - token.indent > 9 && /^[ \n]/.test(value)) indent = token.indent + 2;
    const rendered = CST.createScalarToken(value, {
      type: value.trim() === "" ? "QUOTE_DOUBLE" : node.type, indent, end: [],
    });
    const suffix = token.props.slice(1).map((part) => CST.stringify(part)).join("");
    let text: string;
    if (rendered.type === "block-scalar") {
      const generated = CST.stringify(rendered.props[0]!);
      // 명시적 폭은 부모와의 차이다. CST 생성기는 선행 공백이 있으면 항상 2를 낸다.
      const digit = explicit ?? (/[1-9]/.test(generated) ? String(indent - token.indent) : "");
      const chomp = /[+-]/.exec(generated)?.[0] ?? "";
      // keep은 range 밖의 빈 줄까지 값으로 흡수한다. 범위를 넓히면 다른 삽입과 겹치므로
      // 이 경계에서만 인용해 요청값과 원본 빈 줄을 독립적으로 보존한다.
      if (chomp === "+" && /^[ \t]*\r?\n/.test(source.slice(end))) {
        return { start, end, text: flowString(value, doc, "QUOTE_DOUBLE") + suffix };
      }
      text = generated[0] + digit + chomp + suffix + (suffix.endsWith("\n") ? "" : newline)
        + rendered.source.replace(/\n/g, newline);
      if (!source.slice(start, end).endsWith("\n") && !value.endsWith("\n")) text = text.slice(0, -newline.length);
    } else {
      text = rendered.source + suffix;
    }
    return { start, end, text };
  }
  // 흐름 컬렉션에서도 안전한 표현을 쓴다. 콤마·대괄호가 값에서 구조로 바뀌면 안 된다.
  let text = flowString(value, doc, node.type);
  const indent = (token && "indent" in token ? token.indent : 0) + 2;
  text = text.replace(/\n/g, newline + " ".repeat(indent));
  if (start === end) {
    if (/[^\s[{,]/.test(source[start - 1] ?? "")) text = " " + text;
    if (source[start] === "#") text += " ";
  }
  return { start, end, text };
}

/** 기존 맵의 끝에만 새 항목을 더한다. 기존 노드는 직렬화하지 않는다. */
function insertion(source: string, doc: Document, map: YAMLMap | null, entries: [string, string][]): Replacement {
  const token = map?.srcToken;
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const pairs = entries.map(([key, value]) => `${flowString(key, doc)}: ${flowString(value, doc)}`);
  if (map?.flow) {
    const last = map.items.at(-1);
    const node = last?.value ?? last?.key;
    const at = node && typeof node === "object" && "range" in node && Array.isArray(node.range)
      ? node.range[1] as number : map.range![0] + 1;
    return { start: at, end: at, indent: token && "indent" in token ? token.indent : 0, text: (last ? ", " : "") + pairs.join(", ") };
  }
  const at = map?.range?.[1] ?? doc.range![1];
  const width = token && "indent" in token ? token.indent : 0;
  const indent = " ".repeat(width);
  const text = pairs.map((pair) => indent + pair.replace(/\n/g, newline + indent + "  ")).join(newline);
  return {
    start: at, end: at, indent: width,
    text: (at > 0 && source[at - 1] !== "\n" ? newline : "") + text
      + (at < source.length || source.endsWith("\n") ? newline : ""),
  };
}

/**
 * ⚠️ **파싱 실패는 "변경 없음"이 아니다.** 원본을 그대로 돌려주되 에러로 알린다 — `write`만 부르면
 * 호출부가 blob SHA가 같다고 읽어 그 파일이 PR에서 조용히 빠진다.
 */
function writeWithErrors(
  format: DetectedFormat,
  input: WriteInput,
): { content: string | null; errors: AdapterError[] } {
  // ⚠️ `currentFiles?.[0]`가 아니라 **경로로 고른다** — 호출부가 여러 파일을 실으면 다른 로케일의
  // 원본 위에 치환하게 된다 (launch-readiness L3.6, json-catalog·chrome-locales와 같은 규칙).
  const path = format.pathTemplate.replaceAll("{locale}", input.locale);
  const file = format.currentFiles?.find((c) => c.path === path);
  // 수술적 치환의 전제 — 원본이 없으면 치환할 대상이 없다. 파일을 새로 만들지 않는다.
  if (!file) return { content: null, errors: [] };

  let doc: Document;
  try {
    doc = parseDocument(file.content, { ...PARSE_OPTS, keepSourceTokens: true });
  } catch (cause) {
    return {
      content: file.content,
      errors: [{ path: file.path, code: "write-parse-failed", detail: (cause as Error).message }],
    };
  }
  if (doc.errors.length > 0) {
    return {
      content: file.content,
      errors: [{ path: file.path, code: "write-parse-failed", detail: doc.errors[0]?.message ?? "unknown" }],
    };
  }

  // 루트 키는 **원본에서 다시 관측한다.** `format.rootKeyedByPath`를 믿지 않는 이유: 그 값은 read
  // 시점의 관측이고, write에 들어오는 원본이 그 사이 바뀌었을 수 있다(pull은 base 트리에서 새로
  // 받는다). 여기서 다시 보면 두 값이 어긋날 여지가 없다.
  const prefixPath = ((k) => (k === undefined ? [] : [k]))(rootKeyOf(doc));

  /** 치환 대상: orphaned·빈 값은 제외한다 (ARCHITECTURE §1.4 — 원본 값을 남긴다). */
  const wanted = new Map<string, string>();
  for (const e of input.entries) {
    if (e.orphaned === true || e.message === "") continue;
    wanted.set(e.key, e.message);
  }

  // 루트 키 아래가 걷기의 시작점이다. 루트 키가 있는데 그 자리가 비어 있으면 아래 `emptyRoot`가 아니라
  // `write-slot-not-scalar`로 떨어진다 — 그 파일의 규약(루트 키)은 있는데 맵이 없는 상태라 삽입 위치가 없다.
  const start: unknown = prefixPath.length === 0 ? doc.contents : resolveLast(doc, prefixPath);

  const replacements: Replacement[] = [];
  const errors: AdapterError[] = [];
  const missing = new Map<string, Extract<Located, { kind: "missing" }>>();
  for (const [key, value] of wanted) {
    const hit = locate(start, key.split(SEP));
    if (hit.kind === "missing") {
      missing.set(key, hit);
      continue;
    }
    if (isScalar(hit.node)) {
      if (hit.node.value !== value) {
        replacements.push(scalarReplacement(file.content, doc, hit.node, value));
      }
      continue;
    }
    // 알리아스·맵·시퀀스 자리는 건드리지 않는다 — 구조를 바꾸는 일이다. **다만 조용히 버리지
    // 않는다**: 알리아스는 값의 출처가 앵커 쪽이라 편집이 원리적으로 무효이고, 맵 자리는 원본
    // 규약을 갈아치우게 된다. 어느 키를 못 넣었는지는 알려야 한다 (ARCHITECTURE §1.35).
    errors.push({ path: file.path, code: "write-slot-not-scalar", key });
  }

  // 같은 위치의 삽입을 묶고 정렬해 입력 순서와 관계없이 같은 바이트를 낸다.
  const additions = new Map<YAMLMap | null, [string, string][]>();
  for (const key of [...missing.keys()].sort(compareKeys)) {
    const value = wanted.get(key)!;
    const { parent, name } = missing.get(key)!;
    const emptyRoot = prefixPath.length === 0 && parent === start && (parent === null
      || (isScalar(parent) && parent.value === null && !parent.srcToken));
    /*
      ⚠️ **생산자를 못 찾은 방어다** (2026-09-16 리뷰). `locate`가 **맵·시퀀스인 동안만** 내려가므로 여기
      남는 것은 둘뿐인데 — 루트가 맵이 아닌 파일은 `read`가 `root-not-object`로 먼저 떨어뜨려 write에
      오지 않고, `keepSourceTokens: true`로 파싱한 맵은 `srcToken`을 늘 가진다. 부모가 스칼라·알리아스인
      경우는 `locate`가 그 위의 맵에서 평평한 점 키로 떨어뜨려 **이 분기에 닿지 않는다**(실측). 시퀀스
      부모만 여기 온다 — 항목을 늘리는 것은 구조 변경이라 넣지 않는다.
      ⚠️ **그래서 코드를 `write-slot-missing`으로 바꾸지 않는다** — 도달 불가한 라벨을 하나 더 만드는
      일이고, 그것이 POSTMORTEM 2026-09-08이 기록한 함정이다(도달 불가한 갈래를 겨냥한 테스트가
      1년치 green이었다). 방어는 남기되 **검증된 배정인 척하지 않는다.**
    */
    if (!emptyRoot && (!isMap(parent) || !parent.range || !parent.srcToken)) {
      errors.push({ path: file.path, code: "write-slot-not-scalar", key });
      continue;
    }
    const map = isMap(parent) ? parent : null;
    const entries = additions.get(map) ?? [];
    entries.push([name, value]);
    additions.set(map, entries);
  }
  for (const [map, entries] of additions) replacements.push(insertion(file.content, doc, map, entries));

  // 뒤에서 치환해야 앞 노드의 range가 이동하지 않는다. 같은 끝 위치는 부모를 먼저 넣어
  // 자식 삽입이 부모보다 앞에 남게 한다. 빈 스칼라 치환은 같은 위치의 모든 삽입 뒤에
  // 적용해야 값이 원래 키 옆에 남는다. indent는 맵 삽입에만 있다. 변경 0건이면 원본 그대로다.
  let content = file.content;
  for (const edit of replacements.sort((a, b) => b.start - a.start || b.end - a.end
    || Number(a.indent === undefined) - Number(b.indent === undefined)
    || (a.indent ?? 0) - (b.indent ?? 0))) {
    content = content.slice(0, edit.start) + edit.text + content.slice(edit.end);
  }
  return { content, errors };
}

/**
 * 경로가 가리키는 노드 — **중복 키가 있으면 마지막 것.**
 *
 * ⚠️ `doc.getIn`은 첫 항목을 준다. YAML 로더는 **마지막이 이기고** `read`도 그 규칙을 따르므로,
 * write가 첫 항목을 고치면 두 가지가 깨진다: 2차 write가 1차와 달라져 **결정성이 무너지고**
 * (solidusio/solidus_i18n 실측 — 중복 23건에서 바이트 고정점 실패), 더 나쁘게 **앱이 보는 값과
 * 우리가 고친 값이 달라 번역이 조용히 무효가 된다.**
 */
function resolveLast(doc: Document, path: readonly string[]): unknown {
  let node: unknown = doc.contents;
  for (const segment of path) {
    // ⚠️ **시퀀스도 걸어야 한다.** `read`가 시퀀스를 `key.0`으로 펼치므로, 맵만 걸으면 그 경로를
    // 못 찾고 없는 키로 판정해 리터럴 `"key.0"`을 새로 삽입한다 — 원본 시퀀스와 중복이 되어
    // 값이 진동한다 (directus 실측: 70로케일 중 4개에서 바이트 고정점 실패).
    if (isSeq(node)) {
      const at = Number(segment);
      if (!Number.isInteger(at) || at < 0 || at >= node.items.length) return undefined;
      const item = node.items[at];
      if (item === undefined || item === null) return undefined;
      node = item;
      continue;
    }
    if (!isMap(node)) return undefined;
    let found: unknown;
    for (const item of node.items) {
      const name = isScalar(item.key) ? String(item.key.value) : undefined;
      if (name === segment) found = item.value;
    }
    if (found === undefined || found === null) return undefined;
    node = found;
  }
  return node;
}

type Located =
  | { kind: "found"; node: unknown }
  /** 못 찾았다 — `parent`는 내려간 가장 깊은 컨테이너, `name`은 거기 넣을 남은 경로(리터럴 하나). */
  | { kind: "missing"; parent: unknown; name: string };

/** 맵에서 이름이 같은 **마지막** 항목의 값 — `resolveLast`와 같은 이유(YAML 로더는 마지막이 이긴다). */
function lastChild(map: YAMLMap, name: string): unknown {
  let found: unknown;
  for (const item of map.items) {
    const key = isScalar(item.key) ? String(item.key.value) : undefined;
    if (key === name) found = item.value;
  }
  return found === null ? undefined : found;
}

/**
 * 조회와 삽입이 **같은 걷기**를 쓴다 — 각 깊이에서 **가장 긴 리터럴 접두를 먼저** 보고, 컨테이너면 내려간다.
 *
 * ⚠️ "리터럴 전체 키 / 전부 split" 둘만 시도하면 `errors: { "messages.blank": x }`(read가 `errors.messages.blank`로
 * 낸다)를 **못 찾는다** — 전체 리터럴도 없고 `messages` 맵도 없다. 그러면 없는 키로 판정해 `errors` 아래에
 * `"messages.blank"`를 또 넣고, write마다 중복이 하나씩 늘었다(launch-readiness L1.4, POSTMORTEM 2026-09-02
 * "구분자가 데이터에도 있어서" 재발). 조회와 삽입이 다른 규칙으로 걸으면 같은 중복이 다시 생기므로 함수가 하나다.
 *
 * 같은 깊이에 `messages: { blank }`와 `"messages.blank"`가 함께 있으면 **긴 리터럴이 이긴다** — read의 last-wins와
 * 같아지는 것은 리터럴이 뒤에 올 때이고, 앞에 오는 파일은 read와 write가 다른 항목을 고를 수 있다(알려진 한계).
 * 시퀀스는 인덱스 한 칸씩만 내려간다 — read가 `key.0`으로 펼치므로 리터럴 조립이 없다.
 */
function locate(start: unknown, segments: readonly string[]): Located {
  let node = start;
  let at = 0;
  while (at < segments.length) {
    if (isSeq(node)) {
      const index = Number(segments[at]);
      const item = Number.isInteger(index) && index >= 0 ? node.items[index] : undefined;
      if (item === undefined || item === null) return { kind: "missing", parent: node, name: segments.slice(at).join(SEP) };
      node = item;
      at += 1;
      continue;
    }
    if (!isMap(node)) return { kind: "missing", parent: node, name: segments.slice(at).join(SEP) };
    let stepped = false;
    for (let len = segments.length - at; len >= 1; len -= 1) {
      const child = lastChild(node, segments.slice(at, at + len).join(SEP));
      if (child === undefined) continue;
      if (at + len === segments.length) return { kind: "found", node: child };
      // 스칼라·알리아스는 더 내려갈 수 없다 — 더 짧은 접두를 본다. 아무것도 없으면 이 맵이 삽입 지점이다.
      if (!isMap(child) && !isSeq(child)) continue;
      node = child;
      at += len;
      stepped = true;
      break;
    }
    if (!stepped) return { kind: "missing", parent: node, name: segments.slice(at).join(SEP) };
  }
  return { kind: "found", node };
}

export const yamlCatalog: Adapter = {
  name: "yaml-catalog",
  layout: "per-locale",
  writeStrategy: "surgical",
  detect,
  detectCandidates,
  read,
  write,
  writeWithErrors,
};
