import { parse as parseYaml } from "yaml";
import { localeFromPath } from "./chrome-locales";
import { observeJsonStyle, quote, stripBom } from "./json-style";
import { compareKeys, hasStrongLocale, looksLikeLocale, orderedEntries, rankTemplateCandidates, verifySamples, type CatalogVerdict } from "./shared";
import type { Adapter, AdapterError, DetectedFormat, FileProbe, LocaleEntry, ReadLocale, ReadResult, WriteInput } from "./types";
import { causeMessage } from "@/lib/cause";

/**
 * Flutter `gen-l10n`의 ARB — `lib/l10n/app_<locale>.arb` (arb design §2).
 *
 * 엔트리는 최상위 `"key": "string"`뿐이다. ICU 문자열(`{count, plural, …}`)은 **통짜 문자열**로 다룬다(PRODUCT §4.2 — 복수형 편집은 비범위).
 *
 * ⚠️ **원본에서 표현 말고도 나르는 것이 있는 첫 재생성 어댑터다.** `@key` 메타데이터와 `@@*` 전역 항목은 번역자가 로케일별로 고치는 값이
 * 아니라 개발자가 쓰는 소스 키 메타데이터라 소유자가 코드다 — 그래서 DB에 넣지 않고(2026-10-19 사용자 결정, 스키마 0) **같은 로케일
 * 원본 파일의 텍스트 구간을 바이트 그대로** 나른다. 키마다 출처가 하나이고 원본과 DB를 견줘 고르는 코드가 없으므로 병합이 아니다
 * (B3.4의 "원본에만 있는 키는 원본 엔트리 그대로"와 같은 형).
 */

/** `<dir>/<locale>.arb` · `<dir>/<prefix><locale>.arb`. 디렉터리 없는 루트 파일도 받는다. */
export const ARB_FILE = /^((?:[^/]*\/)*)([^/]+)\.arb$/;

/** gen-l10n 설정 파일. 리포 루트의 것만 본다(arb design §2). */
const L10N_CONFIG = "l10n.yaml";
/** `l10n.yaml`이 `arb-dir`을 생략했을 때 gen-l10n이 쓰는 값. */
const DEFAULT_ARB_DIR = "lib/l10n";

const BOM = "﻿";

/** 최상위 항목 하나. `value`는 원본의 **값 텍스트 그대로**다 — 나를 때 다시 직렬화하지 않는다. */
export type ArbMember = { name: string; value: string };

/**
 * 최상위 항목을 파일 순서대로 낸다. 중복 이름도 그대로 둔다(read가 warning으로 알린다). JSON이 아니거나 루트가 객체가 아니면 `undefined`.
 *
 * ⚠️ **`JSON.parse`로 먼저 검증하고 그다음 훑는다.** 훑기는 값의 경계만 찾고 해석은 하지 않으므로, 검증된 입력에서만 경계가 참이다.
 */
function parseArb(text: string): ArbMember[] | undefined {
  const t = stripBom(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;

  const members: ArbMember[] = [];
  let i = skipWs(t, 0) + 1; // `{`
  for (;;) {
    i = skipWs(t, i);
    if (t[i] === "}") break;
    const nameEnd = skipString(t, i);
    const name = JSON.parse(t.slice(i, nameEnd)) as string;
    i = skipWs(t, nameEnd) + 1; // `:`
    const start = skipWs(t, i);
    const end = skipValue(t, start);
    members.push({ name, value: t.slice(start, end) });
    i = skipWs(t, end);
    if (t[i] === ",") i += 1;
  }
  return members;
}

function skipWs(t: string, i: number): number {
  while (i < t.length && (t[i] === " " || t[i] === "\t" || t[i] === "\n" || t[i] === "\r")) i += 1;
  return i;
}

/** `"`에서 시작해 닫는 `"` 다음 위치. */
function skipString(t: string, i: number): number {
  i += 1;
  while (i < t.length && t[i] !== '"') i += t[i] === "\\" ? 2 : 1;
  return i + 1;
}

function skipValue(t: string, i: number): number {
  const ch = t[i];
  if (ch === '"') return skipString(t, i);
  if (ch === "{" || ch === "[") {
    let depth = 0;
    while (i < t.length) {
      const c = t[i];
      if (c === '"') {
        i = skipString(t, i);
        continue;
      }
      if (c === "{" || c === "[") depth += 1;
      else if (c === "}" || c === "]") {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
      i += 1;
    }
    return i;
  }
  while (i < t.length && !/[\s,}\]]/.test(t[i]!)) i += 1;
  return i;
}

/** `@foo` → `foo`. `@@*`(전역)와 엔트리는 `undefined`. */
function metaKeyOf(name: string): string | undefined {
  return name.startsWith("@") && !name.startsWith("@@") ? name.slice(1) : undefined;
}

/** 같은 이름이 여럿이면 마지막만 — `JSON.parse`의 의미와 같다. */
function lastWins(members: readonly ArbMember[]): ArbMember[] {
  const last = new Map<string, number>();
  members.forEach((m, i) => last.set(m.name, i));
  return members.filter((m, i) => last.get(m.name) === i);
}

/** 엔트리 값(`@`로 시작하지 않는 이름의 값)이 절반 이상 문자열이면 ARB다. 엔트리가 없으면 정보 없음이다(빈 스텁·`@@locale`만). */
function arbVerdict(content: string): CatalogVerdict {
  const members = parseArb(content);
  if (members === undefined) return "no";
  const values = lastWins(members).filter((m) => !m.name.startsWith("@")).map((m) => m.value);
  if (values.length === 0) return "unknown";
  const strings = values.filter((v) => v.startsWith('"')).length;
  return strings * 2 >= values.length ? "yes" : "no";
}

/**
 * 1패스 후보 목록에서 **설정이 가리키는 ARB 후보를 맨 앞으로** — 나머지 순서는 그대로다(리뷰 R1).
 *
 * probe 상한(`PROBE_LIMITS.jsonLike`)이 1패스 순위로 자르므로, 설정 대상이 경로 신호로 밀리면 내용이 안 와서 2패스 검증에서 떨어졌다.
 * 셸이 설정을 먼저 읽고 이 순서로 `probeTargets`에 넘긴다 — 예산은 그대로이고 밀려나는 것은 순위 끝 후보다.
 */
export function arbConfiguredFirst(candidates: readonly DetectedFormat[], configContent: string | undefined): DetectedFormat[] {
  const config = readL10nConfig(configContent);
  if (config === undefined) return candidates.slice();
  const hit = (c: DetectedFormat) => c.adapter === "arb-catalog" && matchesConfig(c.pathTemplate, c.locales, config);
  return [...candidates.filter(hit), ...candidates.filter((c) => !hit(c))];
}

/** 1패스가 내려받을 설정 파일 — 경로만으로는 `arb-dir`을 모른다. */
export function arbProbePaths(paths: readonly string[]): string[] {
  return paths.includes(L10N_CONFIG) ? [L10N_CONFIG] : [];
}

type L10nConfig = { arbDir: string; templateFile?: string };

/** 못 읽으면 `undefined` — 설정이 탐지를 막지 않는다. */
function readL10nConfig(content: string | undefined): L10nConfig | undefined {
  if (content === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch {
    return undefined;
  }
  const record = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  const field = (name: string): string | undefined => {
    const v = Object.hasOwn(record, name) ? record[name] : undefined;
    return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
  };
  const arbDir = (field("arb-dir") ?? DEFAULT_ARB_DIR).replace(/^\.\//, "").replace(/\/+$/, "");
  const templateFile = field("template-arb-file");
  return templateFile === undefined ? { arbDir } : { arbDir, templateFile };
}

/**
 * 설정이 가리키는 후보인가 — `arb-dir`이 같고, 템플릿 파일이 있으면 **그 파일이 이 후보의 파일**이어야 한다(재리뷰 Y3). 경로 모양만 보면
 * `{locale}.arb`도 `app_en.arb`를 로케일 `app_en`으로 받아 같은 디렉터리의 두 파일군이 둘 다 설정 대상이 된다.
 */
function matchesConfig(pathTemplate: string, locales: Iterable<string>, config: L10nConfig): boolean {
  const at = pathTemplate.lastIndexOf("/");
  const dir = at === -1 ? "" : pathTemplate.slice(0, at);
  if (dir !== config.arbDir) return false;
  if (config.templateFile === undefined) return true;
  const locale = localeFromPath(pathTemplate, `${dir === "" ? "" : `${dir}/`}${config.templateFile}`);
  return locale !== undefined && new Set(locales).has(locale);
}

type Reading = { prefix: string; locale: string };

/** 파일 이름 하나를 `접두사 + 로케일`로 읽는 방법 전부 — 접두사 없음(맨 로케일)도 하나다. 구분자는 `splitLocaleSuffix`와 같은 셋이다. */
function readingsOf(base: string): Reading[] {
  const out: Reading[] = looksLikeLocale(base) ? [{ prefix: "", locale: base }] : [];
  for (let i = 1; i < base.length - 1; i += 1) {
    const ch = base[i];
    if (ch !== "." && ch !== "-" && ch !== "_") continue;
    const locale = base.slice(i + 1);
    if (looksLikeLocale(locale)) out.push({ prefix: base.slice(0, i + 1), locale });
  }
  return out;
}

/**
 * 디렉터리 하나의 파일 이름 → 고른 해석.
 *
 * ⚠️ **파일 하나로는 못 가른다** (리뷰 R2). `app_en`은 그 자체로 `looksLikeLocale`(3글자 + `_` + 2글자)을 통과하고, `en_gb`는 접두사 `en_` +
 * `gb`로도 읽힌다. 맨 로케일로도·접두사로도 읽히는 이름은 **그 이름의 언어 조각**(첫 구분자 앞)으로 가른다:
 * - 같은 디렉터리에 그 언어의 맨 로케일 파일이 있거나(`en.arb` 옆의 `en_gb.arb`) 조각이 2글자 언어 코드면(`en_gb` 하나뿐) 맨 로케일이다.
 * - 아니면(`app_`·`intl_`) 접두사다 — 접두사끼리는 형제가 더 많이 공유하는 쪽, 같으면 짧은 쪽이다(`app_en_gb` → `app_` + `en_gb`).
 *
 * ⚠️ **디렉터리 최다 해석 하나로 고르지 않는다** (재리뷰 Y3). `app_en`·`app_ko`·`en`·`ko`가 함께 있으면 맨 로케일 해석이 4표로 이겨 접두사 파일군을
 * `{locale}.arb`에 흡수했다 — 파일 하나가 더해진 것만으로 기존 `app_{locale}.arb` 소스의 경계가 바뀐다. raw 코드 정책이라 고른 로케일은
 * 파일명 조각 그대로다(`en_gb`·`en_GB`). 대가: 2글자 몸통의 접두사(`my_en`·`my_ko`)는 맨 로케일로 읽힌다.
 */
function readDirectory(bases: readonly string[]): Map<string, Reading> {
  const options = new Map(bases.map((b) => [b, readingsOf(b)]));
  const score = new Map<string, number>();
  for (const list of options.values()) for (const prefix of new Set(list.map((r) => r.prefix))) score.set(prefix, (score.get(prefix) ?? 0) + 1);
  // 접두사로는 읽히지 않는 맨 로케일 이름 — 모호한 이름의 언어 조각이 이 중 하나면 그 이름도 맨 로케일이다.
  const bareOnly = new Set([...options].filter(([, list]) => list.every((r) => r.prefix === "")).map(([base]) => base));
  const out = new Map<string, Reading>();
  for (const [base, list] of options) {
    const bare = list.find((r) => r.prefix === "");
    const prefixed = list.filter((r) => r.prefix !== "").sort((a, b) => (score.get(b.prefix) ?? 0) - (score.get(a.prefix) ?? 0) || a.prefix.length - b.prefix.length);
    const language = base.split(/[-._]/)[0] ?? base;
    const best = bare !== undefined && (prefixed.length === 0 || bareOnly.has(language) || /^[a-z]{2}$/.test(language)) ? bare : prefixed[0];
    if (best !== undefined) out.set(base, best);
  }
  return out;
}

function detectCandidates(paths: readonly string[], probe?: FileProbe): DetectedFormat[] {
  const byDir = new Map<string, string[]>();
  for (const path of paths) {
    const m = ARB_FILE.exec(path);
    if (!m) continue;
    const [, dir = "", base = ""] = m;
    (byDir.get(dir) ?? byDir.set(dir, []).get(dir)!).push(base);
  }
  const byTemplate = new Map<string, Set<string>>();
  for (const [dir, bases] of byDir) {
    for (const { prefix, locale } of readDirectory(bases).values()) {
      const template = `${dir}${prefix}{locale}.arb`;
      (byTemplate.get(template) ?? byTemplate.set(template, new Set()).get(template)!).add(locale);
    }
  }
  // `.arb` 확장자가 신호라 i18n 경로 신호를 요구하지 않는다(Flutter 기본 `lib/l10n`은 `I18N_HINT`에 없다).
  const groups = [...byTemplate].filter(([, s]) => hasStrongLocale(s)).map(([pathTemplate, locales]) => ({ pathTemplate, locales }));
  const verified = rankTemplateCandidates(groups).filter((g) => !probe || verifySamples(g.pathTemplate, g.locales, probe, arbVerdict));

  // **좁히기는 거르기가 아니라 순서다** — 설정이 가리키는 후보를 ARB 후보 맨 앞에 둔다. 걸러 내면 설정 밖 ARB를 둘째 소스로 연결한
  // 표면의 CI(`--path-template` 고정)가 탐지 목록에서 자기 템플릿을 못 찾아 영구 red다. 어댑터 간 정렬이 이 순서를 지우므로
  // `detectCandidatesAcross`가 ARB 자리를 이 순서로 다시 채운다(`index.ts`).
  const config = probe !== undefined && paths.includes(L10N_CONFIG) ? readL10nConfig(probe(L10N_CONFIG)) : undefined;
  const ordered = config === undefined ? verified
    : [...verified.filter((g) => matchesConfig(g.pathTemplate, g.locales, config)), ...verified.filter((g) => !matchesConfig(g.pathTemplate, g.locales, config))];
  return ordered.map((g) => {
    const templateLocale = config === undefined ? undefined : templateLocaleOf(g, config);
    return { adapter: "arb-catalog" as const, pathTemplate: g.pathTemplate, locales: [...g.locales], ...(templateLocale === undefined ? {} : { templateLocale }) };
  });
}

/** 설정이 가리키는 후보의 `template-arb-file` 로케일 — 그 파일이 후보의 파일 중에 있을 때만(`locales`는 실재하는 경로에서 왔다). */
function templateLocaleOf(group: { pathTemplate: string; locales: ReadonlySet<string> }, config: L10nConfig): string | undefined {
  if (config.templateFile === undefined || !matchesConfig(group.pathTemplate, group.locales, config)) return undefined;
  const locale = localeFromPath(group.pathTemplate, `${config.arbDir === "" ? "" : `${config.arbDir}/`}${config.templateFile}`);
  return locale !== undefined && group.locales.has(locale) ? locale : undefined;
}

function detect(paths: readonly string[], probe?: FileProbe): DetectedFormat | undefined {
  return detectCandidates(paths, probe)[0];
}

function read(format: DetectedFormat, files: readonly { path: string; content: string }[]): ReadResult {
  const locales: ReadLocale[] = [];
  const errors: AdapterError[] = [];
  for (const file of files) {
    const locale = localeFromPath(format.pathTemplate, file.path);
    if (locale === undefined) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripBom(file.content));
    } catch (cause) {
      errors.push({ path: file.path, code: "parse-failed", detail: causeMessage(cause) });
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      errors.push({ path: file.path, code: "root-not-object" });
      continue;
    }
    const members = parseArb(file.content) ?? [];
    const seen = new Set<string>();
    const warned = new Set<string>();
    for (const { name } of members) {
      if (seen.has(name) && !warned.has(name)) {
        errors.push({ path: file.path, code: "duplicate-property", key: name });
        warned.add(name);
      }
      seen.add(name);
    }
    const entries: LocaleEntry[] = [];
    for (const { name, value } of lastWins(members)) {
      if (name.startsWith("@")) continue;
      const message: unknown = JSON.parse(value);
      // 문자열이 아닌 엔트리 값은 gen-l10n도 거부한다. writer가 그 구간을 그대로 남기므로 잃는 값이 없다(unmanaged).
      if (typeof message !== "string") {
        errors.push({ path: file.path, code: "value-not-string", key: name });
        continue;
      }
      entries.push({ key: name, message, order: entries.length });
    }
    entries.sort((a, b) => compareKeys(a.key, b.key));
    locales.push({ locale, entries });
  }
  locales.sort((a, b) => compareKeys(a.locale, b.locale));
  return { locales, errors, nested: false };
}

/**
 * 엔트리는 `orderedEntries` 순서로 DB에서, `@key`는 그 키 바로 뒤에, 나머지(`@@*`·주석 `@x`·문자열이 아닌 엔트리 값 — "나르는 항목")는
 * 원본 텍스트 그대로 놓는다. 출력이 다시 원본이 되면 같은 배치를 낳는다(고정점).
 *
 * **나르는 항목의 자리 규칙**: 각 항목은 원본에서 바로 앞에 있던 **출력되는** 엔트리(없으면 맨 앞)에 묶인다. 출력은 그 엔트리 뒤에 내되,
 * 나르는 항목끼리의 **원본 상대 순서를 먼저 지킨다** — 앞 항목이 아직 못 나갔으면 뒤 항목은 묶인 엔트리를 지나도 기다렸다가 앞 항목 바로
 * 뒤에 나간다(리뷰 R4). 비-base는 base 키 순서로 다시 쓰여 메시지 순서가 원본과 달라지므로, 엔트리 자리만 따르면 `@@x-one`·`@@x-two`가
 * 뒤집힌다. 두 규칙이 부딪치면 상대 순서가 이긴다.
 *
 * - `@key`는 짝 키를 출력할 때 그 바로 뒤에 낸다. 짝 키가 **표면에 살아 있는데 이 로케일만 값이 없으면**(`input.untranslated`) 값 없이
 *   그 키가 설 자리에 `@key`만 남긴다(2026-10-19 사용자 결정 — Weblate류가 비-base 파일마다 복제해 둔 메타데이터를 첫 Publish가 수천 줄 지웠다).
 *   **표면에 아예 없는 이름**의 `@x`는 개발자 주석으로 보고 `@@*`처럼 원본 위치에 남긴다(fix1 지휘자 결정). **orphaned 키**(`input.orphaned`)의
 *   `@key`만 버린다 — 코드가 지운 키의 메타데이터다.
 * - `@@locale`은 **원본에 그 항목이 있을 때만** 경로의 코드로 낸다 — 원본 값과 견주지 않는다. 원본이 없는 새 파일에는 맨 앞에 늘 낸다.
 *   표현 출처(기준 언어 파일)의 `@key`·`@@*`는 싣지 않는다 — 그 파일의 것이지 새 언어의 것이 아니다.
 */
function write(format: DetectedFormat, input: WriteInput): string | null {
  const usable = orderedEntries(input.entries);
  // 원본은 위치가 아니라 경로로 고른다 — 호출부가 여러 파일을 실어도 남의 로케일 구간을 나르지 않는다.
  const path = format.pathTemplate.replaceAll("{locale}", input.locale);
  const original = format.currentFiles?.find((c) => c.path === path)?.content;
  if (usable.length === 0 && original === undefined) return null;
  const style = observeJsonStyle(original ?? format.representationSource);
  const member = (name: string, value: string) => `${style.indent}${quote(name, style)}: ${value}`;
  const localeValue = quote(input.locale, style);

  const lines: string[] = [];
  if (original === undefined) {
    lines.push(member("@@locale", localeValue));
    for (const e of usable) lines.push(member(e.key, quote(e.message, style)));
  } else {
    const written = new Set(usable.map((e) => e.key));
    // 미번역 키는 엔트리 줄 없이 자리만 갖는다. 렌더가 넘긴 `untranslated`와, 직접 호출이 실은 빈 값 엔트리(값을 지운 셀) 둘 다다.
    const missing = [
      ...(input.untranslated ?? []),
      ...input.entries.filter((e) => e.orphaned !== true && !written.has(e.key)).map((e) => ({ key: e.key, ...(e.order === undefined ? {} : { order: e.order }) })),
    ].filter((u) => !written.has(u.key));
    const ghosts = new Set(missing.map((u) => u.key));
    const orphaned = new Set([...(input.orphaned ?? []), ...input.entries.filter((e) => e.orphaned === true).map((e) => e.key)]);
    const meta = new Map<string, string>();
    /** 나르는 항목 — 원본 순서 그대로. `anchor`는 원본에서 바로 앞에 있던 출력 엔트리이고 `null`은 맨 앞이다. */
    const carried: { anchor: string | null; line: string }[] = [];
    let anchor: string | null = null;
    // 깨진 원본은 나를 구간이 없다 — 표현만 읽고 `@@locale`도 내지 않는다(있었는지 모른다).
    for (const m of lastWins(parseArb(original) ?? [])) {
      const metaKey = metaKeyOf(m.name);
      if (metaKey !== undefined) {
        if (written.has(metaKey) || ghosts.has(metaKey)) meta.set(metaKey, m.value);
        // 표면에 아예 없는 이름의 `@x`는 개발자 주석이다(smooth-app의 구획 주석) — `@@*`처럼 원본 위치에 남긴다. orphaned 키의 것만 버린다.
        else if (!orphaned.has(metaKey)) carried.push({ anchor, line: member(m.name, m.value) });
        continue;
      }
      if (written.has(m.name)) {
        anchor = m.name;
        continue;
      }
      // 엔트리였던 문자열 값은 DB가 주인이다 — 출력하지 않기로 했으면 그 값도 남지 않는다.
      if (!m.name.startsWith("@@") && m.value.startsWith('"')) continue;
      const value = m.name === "@@locale" ? localeValue : m.value;
      carried.push({ anchor, line: member(m.name, value) });
    }
    const emitted = new Set<string>();
    let next = 0;
    /** 묶인 엔트리가 이미 나간 항목을 원본 순서대로 낸다 — 앞 항목이 막히면 거기서 멈춘다(상대 순서 우선). */
    const flush = () => {
      for (; next < carried.length; next += 1) {
        const item = carried[next]!;
        if (item.anchor !== null && !emitted.has(item.anchor)) return;
        lines.push(item.line);
      }
    };
    flush();
    // `orderedEntries`가 정한 순서에 끼우려고 미번역 키에 빈 값이 아닌 자리표를 싣는다(메시지는 쓰지 않는다).
    const slots = orderedEntries([...usable, ...[...new Map(missing.map((u) => [u.key, u])).values()].map((u) => ({ ...u, message: "-" }))]);
    for (const e of slots) {
      if (ghosts.has(e.key)) {
        const m = meta.get(e.key);
        if (m !== undefined) lines.push(member(`@${e.key}`, m));
        continue;
      }
      lines.push(member(e.key, quote(e.message, style)));
      const m = meta.get(e.key);
      if (m !== undefined) lines.push(member(`@${e.key}`, m));
      emitted.add(e.key);
      flush();
    }
  }

  const eol = style.eol;
  const body = lines.length === 0 ? "{}" : `{${eol}${lines.join(`,${eol}`)}${eol}}`;
  return `${style.bom ? BOM : ""}${body}${eol}`;
}

export const arbCatalog: Adapter = {
  name: "arb-catalog",
  layout: "per-locale",
  writeStrategy: "regenerate",
  detect,
  detectCandidates,
  read,
  write,
};
