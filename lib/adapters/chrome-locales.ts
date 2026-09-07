import { observeJsonStyle, serializeJson } from "./json-style";
import {
  compareKeys,
  hasStrongLocale,
  looksLikeLocale,
  rankCandidates,
  orderedEntries,
  verifySamples,
} from "./shared";
import type {
  Adapter, AdapterError, DetectedFormat, FileProbe, LocaleEntry, ReadLocale, ReadResult, WriteInput,
} from "./types";

/**
 * 크롬 확장 표준 포맷 — `<root>/_locales/<locale>/messages.json`.
 *
 * 리프가 `{ message, description? }` 객체다. **`description`을 갖는 유일한 어댑터**라
 * 번역자 컨텍스트를 파일에서 그대로 얻는다.
 */

/**
 * 엔트리 안의 필드 순서. 기본값은 이 어댑터가 처음부터 내던 순서다.
 *
 * ⚠️ **파일 전체에 하나만 둔다.** 키마다 따로 두면 300키짜리 맵을 나르게 되는데, 새 키에는
 * 어차피 기본값이 필요하다. 실측 1건(Midnight-Lizard)이 파일 전체에서 균일한지는 §11.5에 적혀
 * 있지 않고, **다수결이 균일하지 않은 경우에도 안전하다는 것**이 근거다.
 */
const FIELDS = ["message", "description", "placeholders"] as const;
type EntryField = (typeof FIELDS)[number];
const DEFAULT_FIELD_ORDER: readonly EntryField[] = FIELDS;

/**
 * 원본 엔트리들의 필드 등장 순서 **다수결**. 동률·관측 불가면 기본값이다 — **던지지 않는다**.
 *
 * Midnight-Lizard 실측: 전 엔트리가 `description` → `message`라, 우리가 반대로 내면 값 편집이
 * 0건이어도 diff **0.456**이다 (ADAPTER-COVERAGE §11.5·§15.3).
 *
 * **결정성**: 다수결은 원본 텍스트의 함수이고 우리가 낸 파일은 그 순서로 **균일**해지므로 2차
 * 관측이 같은 답을 낸다. `dominantQuote`와 같은 논증이다 (ARCHITECTURE §1.4).
 *
 * ⚠️ **`JSON.parse`로 충분하다.** 필드 이름 셋이 전부 비-정수라 JS가 삽입 순서를 유지한다 —
 * `json-shape`의 스캐너가 필요했던 이유(정규 정수 키 hoisting)가 여기선 성립하지 않는다.
 */
export function dominantFieldOrder(text: string | undefined): readonly EntryField[] {
  if (text === undefined || text === "") return DEFAULT_FIELD_ORDER;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return DEFAULT_FIELD_ORDER;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return DEFAULT_FIELD_ORDER;

  const votes = new Map<string, { order: EntryField[]; n: number }>();
  for (const raw of Object.values(parsed as Record<string, unknown>)) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const order = Object.keys(raw).filter((k): k is EntryField => (FIELDS as readonly string[]).includes(k));
    // 필드가 하나면 순서를 말하지 않는다 — 표를 주면 다수가 "message 하나뿐인 엔트리"로 정해진다.
    if (order.length < 2) continue;
    const id = order.join(",");
    const seen = votes.get(id);
    if (seen === undefined) votes.set(id, { order, n: 1 });
    else seen.n += 1;
  }

  let best: { order: EntryField[]; n: number } | undefined;
  let tied = false;
  for (const v of votes.values()) {
    if (best === undefined || v.n > best.n) {
      best = v;
      tied = false;
    } else if (v.n === best.n) tied = true;
  }
  if (best === undefined || tied) return DEFAULT_FIELD_ORDER;
  // 관측되지 않은 필드는 기본 순서대로 뒤에 붙인다 — 그 필드를 쓰는 엔트리가 원본에 없었다는 뜻이라
  // 관측이 아무 말도 안 한 자리다. 우리가 낸 파일에는 생기므로 2차 관측이 이 완성형을 그대로 낸다.
  return [...best.order, ...DEFAULT_FIELD_ORDER.filter((f) => !best!.order.includes(f))];
}

/** `chrome.i18n`이 허용하는 메시지 이름. 밖의 문자는 크롬이 **조용히 무시**한다. */
const CHROME_KEY = /^[A-Za-z0-9_@]+$/;
const LOCALES_PATH = /^(.*)_locales\/([^/]+)\/messages\.json$/;

function detectCandidates(paths: readonly string[], probe?: FileProbe): DetectedFormat[] {
  /** root(접두 경로) → 로케일 코드 집합 */
  const byRoot = new Map<string, Set<string>>();
  for (const path of paths) {
    const m = LOCALES_PATH.exec(path);
    if (!m) continue;
    const [, root = "", locale = ""] = m;
    if (!looksLikeLocale(locale)) continue;
    const set = byRoot.get(root) ?? new Set();
    set.add(locale);
    byRoot.set(root, set);
  }
  // 로케일이 2개 이상인 root만 인정한다 — 하나뿐이면 우연일 수 있다.
  const candidates = rankCandidates(
    [...byRoot.entries()]
      // 강한 로케일 코드가 하나도 없으면 로케일 모음이 아니다 — `shared.hasStrongLocale`.
      .filter(([, s]) => s.size >= 2 && hasStrongLocale(s))
      .map(([dir, locales]) => ({ dir, locales })),
  );

  const found: DetectedFormat[] = [];
  for (const { dir, locales } of candidates) {
    const pathTemplate = `${dir}_locales/{locale}/messages.json`;
    if (probe && !verify(pathTemplate, locales, probe)) continue;
    found.push({ adapter: "chrome-locales", pathTemplate, locales: [...locales] });
  }
  return found;
}

function detect(paths: readonly string[], probe?: FileProbe): DetectedFormat | undefined {
  return detectCandidates(paths, probe)[0];
}

/**
 * 후보 로케일 파일 **여러 개**를 읽어 카탈로그 모양인지 확인한다.
 *
 * 전에는 정렬상 첫 로케일 하나만 봤고, 그게 지원 포맷 리포 3개를 통째로 버렸다 —
 * 상세는 `verifySamples` (ARCHITECTURE §1.3).
 */
export function verify(pathTemplate: string, locales: ReadonlySet<string>, probe: FileProbe): boolean {
  return verifySamples(pathTemplate, locales, probe);
}

function read(format: DetectedFormat, files: readonly AdapterFileLike[]): ReadResult {
  const locales: ReadLocale[] = [];
  const errors: AdapterError[] = [];

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

    const entries: LocaleEntry[] = [];
    for (const [key, raw] of Object.entries(parsed)) {
      if (!CHROME_KEY.test(key)) {
        errors.push({
          path: file.path,
          message: `키 이름 '${key}'에 chrome.i18n이 허용하지 않는 문자가 있다 (허용: A-Z a-z 0-9 _ @)`,
        });
        continue;
      }
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        errors.push({ path: file.path, message: `'${key}'의 값이 { message } 객체가 아니다` });
        continue;
      }
      const { message, description, placeholders } = raw as {
        message?: unknown;
        description?: unknown;
        placeholders?: unknown;
      };
      if (typeof message !== "string") {
        errors.push({ path: file.path, message: `'${key}'에 message 필드가 없다` });
        continue;
      }
      // `entries.length`가 곧 파일 순서다 — 정렬은 아래에서 **뒤에** 일어난다.
      const entry: LocaleEntry = { key, message, order: entries.length };
      if (typeof description === "string" && description !== "") entry.description = description;
      // **있으면 모양을 안 보고 그대로 싣는다.** 걸러내면 원본에 있던 것이 우리 PR에서 조용히
      // 사라지고, 그게 이 필드가 없애려는 손실이다. `undefined`(부재)와 `null`(있는데 null)은
      // 다른 파일이라 `in`으로 가른다.
      if ("placeholders" in raw) entry.placeholders = placeholders;
      entries.push(entry);
    }

    entries.sort((a, b) => compareKeys(a.key, b.key));
    locales.push({ locale, entries });
  }

  locales.sort((a, b) => compareKeys(a.locale, b.locale));
  // 크롬 포맷은 정의상 flat이다.
  return { locales, errors, nested: false };
}

function write(format: DetectedFormat, input: WriteInput): string | null {
  const usable = orderedEntries(input.entries);
  if (usable.length === 0) return null;

  // **표현은 원본에서** — 없으면 기본값(2칸)이다. 경로로 조회하는 이유는 json-catalog와 같다.
  const path = format.pathTemplate.replaceAll("{locale}", input.locale);
  const original = format.currentFiles?.find((c) => c.path === path)?.content;
  const style = observeJsonStyle(original);

  // `orderedEntries`가 낸 순서로 재조립한다 — `JSON.stringify`는 삽입 순서를 따른다(정규 정수
  // 키만 예외이고, chrome 키 이름 규칙상 여기선 생기지 않는다).
  const fieldOrder = dominantFieldOrder(original);

  const out: Record<string, Record<string, unknown>> = {};
  for (const e of usable) {
    const entry: Record<string, unknown> = {};
    // 삽입 순서가 곧 출력 순서다 — 원본이 `description`을 먼저 썼으면 우리도 먼저 넣는다.
    for (const field of fieldOrder) {
      if (field === "message") entry["message"] = e.message;
      // **로케일마다 낸다.** 엔트리의 description은 `Translation.description` — 그 로케일 파일이
      // 실제로 갖고 있던 값이고, 없으면 `rowsForLocale`이 안 싣는다(base만 키 단위 값으로 폴백).
      // 전에는 이 자리에 `isBase` 가드가 있었는데, 그때는 키 단위 값이 전 로케일에 실려서 가드를
      // 풀면 원본에 없던 description을 만들어 넣었다 — 실측 chrome 33개 중 20개가 잃던 필드다.
      // **base 폴백은 그 뒤 `lib/pull/render.ts`로 올라갔고**(그쪽이 `isBase`를 안다), 그래서 이
      // 어댑터는 그 값을 알 필요가 없다 — 파라미터도 계약(`WriteInput`)대로 돌렸다.
      else if (field === "description" && e.description) entry["description"] = e.description;
      // placeholders는 그 로케일 파일에서 읽은 것이라 그대로 되돌린다. 모양을 검사하지 않는다.
      else if (field === "placeholders" && "placeholders" in e) entry["placeholders"] = e.placeholders;
    }
    out[e.key] = entry;
  }
  return serializeJson(out, style);
}

/** 템플릿의 `{locale}` 자리에 무엇이 들어갔는지 역산한다. 매치 안 되면 undefined. */
export function localeFromPath(pathTemplate: string, path: string): string | undefined {
  const at = pathTemplate.indexOf("{locale}");
  if (at === -1) return undefined;
  const prefix = pathTemplate.slice(0, at);
  const suffix = pathTemplate.slice(at + "{locale}".length);
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) return undefined;
  const locale = path.slice(prefix.length, path.length - suffix.length);
  return locale.includes("/") || !looksLikeLocale(locale) ? undefined : locale;
}

type AdapterFileLike = { path: string; content: string };

export const chromeLocales: Adapter = {
  name: "chrome-locales",
  layout: "per-locale",
  writeStrategy: "regenerate",
  detect,
  detectCandidates,
  read,
  write,
};
