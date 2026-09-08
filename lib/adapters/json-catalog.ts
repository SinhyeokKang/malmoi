import { localeFromPath, verify } from "./chrome-locales";
import { observeJsonStyle, serializeJson, KEY_SEP } from "./json-style";
import {
  compareKeys,
  hasStrongLocale,
  looksLikeLocale,
  pathSignals,
  rankTemplateCandidates,
  splitLocaleSuffix,
  orderedEntries,
} from "./shared";
import type { Adapter, AdapterError, DetectedFormat, FileProbe, LocaleEntry, ReadLocale, ReadResult, WriteInput } from "./types";

/**
 * 범용 JSON 카탈로그 — `<dir>/<locale>.json`. 조사한 리포 중 둘을 덮는다:
 *   - skillflo (`src/shared/i18n/locales/`) — flat 점 표기, 1446키 × 6로케일
 *   - bugshot-web (`src/lib/i18n/`) — next-intl 중첩, 배열값 포함
 *
 * **중첩은 `.`으로 평탄화해 읽고 write에서 복원한다.** 평탄화만 하고 복원하지 않으면 읽은
 * 포맷과 다른 모양으로 되돌려주게 되어 왕복이 깨진다 (MVP §4).
 *
 * `description`을 담을 곳이 없다 — DB엔 남지만 파일로 나가지 않는다.
 *
 * ⚠️ **경로 모양이 셋이다** (2026-09-02 3차 실측으로 둘이 늘었다). read·write는 완전히 같고
 * `pathTemplate`만 다르므로 어댑터를 새로 만들지 않았다:
 *   - `<dir>/<locale>.json` — 원래 형태
 *   - `<dir>/<locale>/<name>.json` — 로케일이 디렉터리 (grafana·open-webui·outline·cal.com·zulip)
 *   - `<dir>/<prefix><sep><locale>.json` — 접두사 붙은 파일명 (gitea·jitsi)
 *
 * **로케일 디렉터리에 파일이 여럿이면 디렉터리당 하나만 후보로 낸다** (`PRIMARY_NAMES`).
 * `Project`가 포맷을 하나만 들기 때문이고, 그래서 Ghost의 5개 네임스페이스 중 1개만 덮는다 —
 * 나머지는 프로젝트를 나눠야 한다 (MVP §7).
 */

const SEP = KEY_SEP;
const JSON_FILE = /^(.*\/)([^/]+)\.json$/;
/** `<dir>/<locale>/<name>.json` — 로케일이 디렉터리이고 파일명은 따로다. */
const LOCALE_DIR_FILE = /^((?:[^/]+\/)*)([^/]+)\/([^/]+)\.json$/;

/**
 * 로케일 디렉터리에 파일이 여럿일 때 고르는 이름 순위. **앞이 이긴다.**
 *
 * 알파벳순으로 고르면 zulip이 `legacy_stream_translations.json`을, automa가 `blocks.json`을
 * 집는다 — 둘 다 옆에 `translations.json`·`common.json`이 있다 (2026-09-02 3차 실측).
 * 여기 없는 이름들만 남으면 알파벳순으로 떨어진다 (Ghost의 5개 네임스페이스가 그렇다).
 */
const PRIMARY_NAMES = ["translation", "translations", "common", "messages", "default"];

type Group = { pathTemplate: string; locales: Set<string> };

/** `key` 기준으로 로케일을 모으고, 2개 이상 + 강한 코드 하나 이상인 그룹만 남긴다. */
function groupsOf(rows: readonly { key: string; locale: string; template: (key: string) => string }[]): Group[] {
  const byKey = new Map<string, { locales: Set<string>; template: (key: string) => string }>();
  for (const { key, locale, template } of rows) {
    const at = byKey.get(key) ?? { locales: new Set<string>(), template };
    at.locales.add(locale);
    byKey.set(key, at);
  }
  const out: Group[] = [];
  for (const [key, { locales, template }] of byKey) {
    // 로케일이 하나뿐이면 `config/en.json` 같은 우연일 수 있다. 강한 코드가 없으면 로케일
    // 모음이 아니다 — `{add,get}.json`이 후보가 된 경로가 정확히 이 구멍이었다.
    if (locales.size < 2 || !hasStrongLocale(locales)) continue;
    out.push({ pathTemplate: template(key), locales });
  }
  return out;
}

function detectCandidates(paths: readonly string[], probe?: FileProbe): DetectedFormat[] {
  const plain: { key: string; locale: string; template: (key: string) => string }[] = [];
  const prefixed: { key: string; locale: string; template: (key: string) => string }[] = [];
  /** `dir` → 파일 이름 → 로케일 집합. 디렉터리당 이름 하나만 후보로 낸다. */
  const localeDir = new Map<string, Map<string, Set<string>>>();

  for (const path of paths) {
    const m = JSON_FILE.exec(path);
    if (m) {
      const [, dir = "", base = ""] = m;
      if (looksLikeLocale(base)) {
        plain.push({ key: dir, locale: base, template: (dir) => `${dir}{locale}.json` });
      } else {
        const split = splitLocaleSuffix(base);
        if (split) {
          prefixed.push({
            key: `${dir}${split.prefix}`,
            locale: split.locale,
            template: (k) => `${k}{locale}.json`,
          });
        }
      }
    }

    const d = LOCALE_DIR_FILE.exec(path);
    if (d) {
      const [, dir = "", locale = "", name = ""] = d;
      // 크롬 `_locales/{locale}/messages.json`은 자기 어댑터가 있다 — 같은 후보를 두 번 내지 않는다.
      const isChrome = name === "messages" && dir.endsWith("_locales/");
      if (looksLikeLocale(locale) && !isChrome) {
        const byName = localeDir.get(dir) ?? new Map<string, Set<string>>();
        (byName.get(name) ?? byName.set(name, new Set()).get(name)!).add(locale);
        localeDir.set(dir, byName);
      }
    }
  }

  const groups = [...groupsOf(plain), ...groupsOf(prefixed)];
  for (const [dir, byName] of localeDir) {
    // ⚠️ **로케일 디렉터리 형태만 경로에 i18n 신호를 요구한다.** 디렉터리 이름이 로케일처럼
    // 보이는 일이 파일 이름보다 훨씬 흔하다 — n8n의 `packages/@n8n/{ai,di,…}/package.json`이
    // 4로케일 후보로 올라와 1순위가 됐다 (2026-09-02 3차). 실측에서 이 형태로 잡히는 진짜
    // 카탈로그 7개는 **전부** 경로에 `locale(s)`·`i18n`을 갖는다(grafana·open-webui·outline·
    // Ghost·cal.com·zulip·automa). 편향이 한 방향이다 — 과소 탐지일 뿐 오탐을 만들지 않는다.
    if (!pathSignals(`${dir}x/y.json`).hint) continue;
    const usable = [...byName.entries()].filter(([, s]) => s.size >= 2 && hasStrongLocale(s));
    const best = usable.slice().sort(([na, sa], [nb, sb]) => {
      const ra = PRIMARY_NAMES.indexOf(na);
      const rb = PRIMARY_NAMES.indexOf(nb);
      if (ra !== rb) return (ra === -1 ? PRIMARY_NAMES.length : ra) - (rb === -1 ? PRIMARY_NAMES.length : rb);
      if (sa.size !== sb.size) return sb.size - sa.size;
      return compareKeys(na, nb);
    })[0];
    if (best) groups.push({ pathTemplate: `${dir}{locale}/${best[0]}.json`, locales: best[1] });
  }

  const found: DetectedFormat[] = [];
  for (const { pathTemplate, locales } of rankTemplateCandidates(groups)) {
    // 경로 신호만 믿으면 `public/search/{locale}.json`(검색 인덱스)을 잡는다 — 실제로 발생했다.
    if (probe && !verify(pathTemplate, locales, probe)) continue;
    found.push({ adapter: "json-catalog", pathTemplate, locales: [...locales] });
  }
  return found;
}

function detect(paths: readonly string[], probe?: FileProbe): DetectedFormat | undefined {
  return detectCandidates(paths, probe)[0];
}

function read(format: DetectedFormat, files: readonly { path: string; content: string }[]): ReadResult {
  const locales: ReadLocale[] = [];
  const errors: AdapterError[] = [];
  /** 어느 파일에서든 중첩을 봤으면 중첩 포맷이다 — 거친 값이고 하위 호환용이다. */
  let nested = false;
  /**
   * ⚠️ **파일별로 따로 관측한다.** 포맷 단위 boolean으로 두면 로케일 파일 하나가 중첩일 때 형제
   * 파일까지 중첩으로 취급돼 **평평한 파일의 점 포함 키가 쪼개지고 값이 사라진다** — musicblocks
   * 84로케일 중 81개에서 각 4키가 그렇게 없어졌다 (ARCHITECTURE §1.35).
   */
  const nestedByPath: Record<string, boolean> = {};

  for (const file of files) {
    const locale = localeFromPath(format.pathTemplate, file.path);
    if (locale === undefined) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(file.content);
    } catch (cause) {
      errors.push({ path: file.path, code: "parse-failed", detail: (cause as Error).message });
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      errors.push({ path: file.path, code: "root-not-object" });
      continue;
    }

    const top = parsed as Record<string, unknown>;
    const fileNested = Object.values(top).some((v) => v !== null && typeof v === "object");
    nestedByPath[file.path] = fileNested;
    if (fileNested) nested = true;

    const entries: LocaleEntry[] = [];
    flatten(top, "", entries, errors, file.path);
    entries.sort((a, b) => compareKeys(a.key, b.key));
    locales.push({ locale, entries });
  }

  locales.sort((a, b) => compareKeys(a.locale, b.locale));
  return { locales, errors, nested, nestedByPath };
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
      // `out.length`가 곧 평탄화 순서다 — 이 순회가 파일 순서 그대로 돌고, 정렬은 호출부에서
      // **뒤에** 일어난다. 별도 순회를 두면 두 순서가 갈릴 수 있다.
      out.push({ key, message: value, order: out.length });
      continue;
    }
    if (value !== null && typeof value === "object") {
      flatten(value as Record<string, unknown> | unknown[], key, out, errors, path);
      continue;
    }
    // ⚠️ **`null`은 에러가 아니라 미번역이다.** 실측에서 jsxc 한 리포가 이것만으로 5,099건의
    // 에러를 냈다 — 그 리포는 번역되지 않은 키를 `null`로 두는 관례다. 빈 문자열과 같은 취급이
    // 맞고, 에러로 세면 남의 CI를 우리 관례로 실패시키게 된다. 숫자·불린은 그대로 에러다.
    if (value === null) continue;
    errors.push({ path, code: "value-not-string-or-container", key, detail: typeof value });
  }
}

function write(format: DetectedFormat, input: WriteInput): string | null {
  return writeWithErrors(format, input).content;
}

/**
 * `write` + 버린 항목 보고.
 *
 * ⚠️ **중첩 복원은 키가 `.`을 품으면 값을 삼킬 수 있다** (ARCHITECTURE §1.35). `a.b`(문자열)와
 * `a.b.c`가 함께 있으면 복원에서 `a.b` 자리가 객체로 덮인다 — 전에는 `setDeep`이 그걸 조용히
 * 했다. 이제 **얕은 쪽을 건너뛰고 에러로 알린다**: 값을 잃더라도 어느 키에서 잃었는지 알려주는
 * 것이 최소 조건이다.
 */
function writeWithErrors(
  format: DetectedFormat,
  input: WriteInput,
): { content: string | null; errors: AdapterError[] } {
  const usable = orderedEntries(input.entries);
  const errors: AdapterError[] = [];
  if (usable.length === 0) return { content: null, errors };

  // 파일별 관측값이 우선이다 — `nested`는 형제 파일 때문에 true가 될 수 있다.
  const path = format.pathTemplate.replaceAll("{locale}", input.locale);
  // ⚠️ **`?.[path] ?? …`를 쓰지 않는다** (POSTMORTEM 2026-09-08 감사 후속). `nestedByPath`는 `Project`의
  // Json 컬럼에서 온 평범한 객체라 `path`가 프로토타입 키(`constructor`·`toString`)와 같으면
  // `Object.prototype`에서 **값이 찾아져** `??`가 안 걸리고 `nested`가 함수가 된다 — truthy로 읽혀
  // 평평한 파일이 중첩으로 쓰이고 **점 포함 키의 값이 사라진다**(§1.35의 손실 계열). 도달 조건은
  // 확장자 없는 `{locale}` 템플릿 + 그 이름의 로케일이라 좁지만, 결과가 조용한 데이터 손실이다.
  const byPath = format.nestedByPath;
  const observed = byPath !== undefined && Object.hasOwn(byPath, path) ? byPath[path] : undefined;
  const nested = observed ?? format.nested ?? false;
  // **표현은 원본에서 읽는다** (ARCHITECTURE §1.4를 재생성으로 옮긴 것). 원본이 없으면 기본값이다 —
  // 재생성은 원본 없이도 파일을 만들어야 한다(신규 로케일). ⚠️ `currentFiles?.[0]`가 아니라
  // **경로로 조회한다**: 호출부가 여러 파일을 실으면 다른 로케일의 스타일을 읽게 된다.
  const style = observeJsonStyle(format.currentFiles?.find((c) => c.path === path)?.content);

  if (!nested) {
    // flat 포맷 — 키를 그대로 쓴다. 정렬한 순서로 재조립한다. 충돌이 성립하지 않는다.
    const out: Record<string, string> = {};
    for (const e of usable) out[e.key] = e.message;
    return { content: serializeJson(out, style), errors };
  }

  // 접두 충돌을 먼저 걸러낸다. `a.b`가 `a.b.c`의 점 경계 접두이면 `a.b`를 버린다 —
  // 깊은 쪽을 살리는 것은 임의 선택이 아니다: 얕은 쪽을 살리면 그 아래 전부를 잃는다.
  const keys = new Set(usable.map((e) => e.key));
  const shadowed = new Set<string>();
  for (const key of keys) {
    for (const other of keys) {
      if (other.length > key.length && other.startsWith(`${key}${SEP}`)) {
        shadowed.add(key);
        break;
      }
    }
  }
  const root: Record<string, unknown> = {};
  for (const e of usable) {
    if (shadowed.has(e.key)) {
      errors.push({ path, code: "key-shadowed", key: e.key });
      continue;
    }
    setDeep(root, e.key.split(SEP), e.message);
  }
  return { content: serializeJson(normalizeArrays(root), style), errors };
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
  // ⚠️ **여기서 다시 정렬하지 않는다.** `setDeep`이 `orderedEntries`의 순서대로 트리를 만들고
  // `Object.keys`가 그 삽입 순서를 주므로, **각 층은 이미 파일에서의 첫 등장 순**이다. 전에는
  // 마지막에 `sortedByKey`로 다시 정렬해서, 최상위를 고쳐도 하위 층이 통째로 재정렬됐다 —
  // diff 비율은 낮은데 hunk가 수십 개가 되는 모양이다 (spec §왜 diff 비율 하나로는 부족한가).
  return isDense ? names.map((n) => converted[n]) : converted;
}

export const jsonCatalog: Adapter = {
  name: "json-catalog",
  layout: "per-locale",
  writeStrategy: "regenerate",
  detect,
  detectCandidates,
  read,
  write,
  writeWithErrors,
};
