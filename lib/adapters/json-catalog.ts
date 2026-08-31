import { localeFromPath, verify } from "./chrome-locales";
import { compareKeys, looksLikeLocale, rankCandidates, serialize, usableEntries } from "./shared";
import type { Adapter, AdapterError, DetectedFormat, FileProbe, LocaleEntry, ReadLocale, ReadResult } from "./types";

/**
 * 범용 JSON 카탈로그 — `<dir>/<locale>.json`. 조사한 리포 중 둘을 덮는다:
 *   - skillflo (`src/shared/i18n/locales/`) — flat 점 표기, 1446키 × 6로케일
 *   - bugshot-web (`src/lib/i18n/`) — next-intl 중첩, 배열값 포함
 *
 * **중첩은 `.`으로 평탄화해 읽고 write에서 복원한다.** 평탄화만 하고 복원하지 않으면 읽은
 * 포맷과 다른 모양으로 되돌려주게 되어 왕복이 깨진다 (MVP §4).
 *
 * `description`을 담을 곳이 없다 — DB엔 남지만 파일로 나가지 않는다.
 */

const SEP = ".";
const JSON_FILE = /^(.*\/)([^/]+)\.json$/;

function detect(paths: readonly string[], probe?: FileProbe): DetectedFormat | undefined {
  /** 디렉터리 → 로케일 코드 집합 */
  const byDir = new Map<string, Set<string>>();
  for (const path of paths) {
    const m = JSON_FILE.exec(path);
    if (!m) continue;
    const [, dir = "", base = ""] = m;
    if (!looksLikeLocale(base)) continue;
    const set = byDir.get(dir) ?? new Set();
    set.add(base);
    byDir.set(dir, set);
  }
  // 로케일이 2개 이상인 디렉터리만. 하나뿐이면 `config/en.json` 같은 우연일 수 있다.
  const candidates = rankCandidates(
    [...byDir.entries()].filter(([, s]) => s.size >= 2).map(([dir, locales]) => ({ dir, locales })),
  );

  for (const { dir, locales } of candidates) {
    const pathTemplate = `${dir}{locale}.json`;
    // 경로 신호만 믿으면 `public/search/{locale}.json`(검색 인덱스)을 잡는다 — 실제로 발생했다.
    if (probe && !verify(pathTemplate, locales, probe)) continue;
    return { adapter: "json-catalog", pathTemplate, locales: [...locales] };
  }
  return undefined;
}

function read(format: DetectedFormat, files: readonly { path: string; content: string }[]): ReadResult {
  const locales: ReadLocale[] = [];
  const errors: AdapterError[] = [];
  /** 어느 파일에서든 중첩을 봤으면 중첩 포맷이다. */
  let nested = false;

  for (const file of files) {
    const locale = localeFromPath(format.pathTemplate, file.path);
    if (locale === undefined) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(file.content);
    } catch (cause) {
      errors.push({ path: file.path, message: `JSON 파싱 실패: ${(cause as Error).message}` });
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      errors.push({ path: file.path, message: "최상위가 객체가 아니다" });
      continue;
    }

    const top = parsed as Record<string, unknown>;
    if (Object.values(top).some((v) => v !== null && typeof v === "object")) nested = true;

    const entries: LocaleEntry[] = [];
    flatten(top, "", entries, errors, file.path);
    entries.sort((a, b) => compareKeys(a.key, b.key));
    locales.push({ locale, entries });
  }

  locales.sort((a, b) => compareKeys(a.locale, b.locale));
  return { locales, errors, nested };
}

/**
 * 중첩 객체·배열을 `a.b.0` 형태로 평탄화한다.
 *
 * **배열은 인덱스 키로 펼친다** — bugshot-web의 `hero.subcopy`가 문자열 배열인데, 하나로
 * 합치면 번역자가 개별 문장을 손댈 수 없고 write에서 원래 길이를 복원할 수도 없다.
 */
function flatten(
  node: Record<string, unknown> | unknown[],
  prefix: string,
  out: LocaleEntry[],
  errors: AdapterError[],
  path: string,
): void {
  const pairs: Array<[string, unknown]> = Array.isArray(node)
    ? node.map((v, i) => [String(i), v])
    : Object.entries(node);

  for (const [name, value] of pairs) {
    const key = prefix === "" ? name : `${prefix}${SEP}${name}`;
    if (typeof value === "string") {
      out.push({ key, message: value });
      continue;
    }
    if (value !== null && typeof value === "object") {
      flatten(value as Record<string, unknown> | unknown[], key, out, errors, path);
      continue;
    }
    errors.push({ path, message: `'${key}'의 값이 문자열이나 객체/배열이 아니다 (${typeof value})` });
  }
}

function write(format: DetectedFormat, input: { locale: string; isBase: boolean; entries: readonly LocaleEntry[] }): string | null {
  const usable = usableEntries(input.entries);
  if (usable.length === 0) return null;

  if (!format.nested) {
    // flat 포맷 — 키를 그대로 쓴다. 정렬한 순서로 재조립한다.
    const out: Record<string, string> = {};
    for (const e of usable) out[e.key] = e.message;
    return serialize(out);
  }

  // 중첩 복원. 숫자만으로 된 세그먼트는 배열 인덱스로 되돌린다.
  const root: Record<string, unknown> = {};
  for (const e of usable) setDeep(root, e.key.split(SEP), e.message);
  return serialize(normalizeArrays(root));
}

function setDeep(node: Record<string, unknown>, segments: readonly string[], value: string): void {
  const [head, ...rest] = segments;
  if (head === undefined) return;
  if (rest.length === 0) {
    node[head] = value;
    return;
  }
  const next = node[head];
  const child = next !== null && typeof next === "object" ? (next as Record<string, unknown>) : {};
  node[head] = child;
  setDeep(child, rest, value);
}

/**
 * 키가 `0,1,2,...`로 빈틈없이 채워진 객체를 배열로 되돌린다.
 *
 * 빈틈이 있으면 객체로 남긴다 — 배열로 만들면 `undefined` 구멍이 `null`로 직렬화되어
 * 원본에 없던 값이 파일에 나타난다.
 */
function normalizeArrays(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  const names = Object.keys(obj);
  const converted: Record<string, unknown> = {};
  for (const name of names) converted[name] = normalizeArrays(obj[name]);

  const isDense = names.length > 0 && names.every((n, i) => n === String(i));
  return isDense ? names.map((n) => converted[n]) : sortedByKey(converted);
}

/** 객체 키를 정렬해 재조립 — 중첩 각 층에서도 순서가 결정적이어야 한다. */
function sortedByKey(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(obj).sort(compareKeys)) out[name] = obj[name];
  return out;
}

export const jsonCatalog: Adapter = { name: "json-catalog", layout: "per-locale", detect, read, write };
