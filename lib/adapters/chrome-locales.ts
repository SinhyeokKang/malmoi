import {
  compareKeys,
  hasStrongLocale,
  looksLikeLocale,
  rankCandidates,
  serialize,
  usableEntries,
  verifySamples,
} from "./shared";
import type { Adapter, AdapterError, DetectedFormat, FileProbe, LocaleEntry, ReadLocale, ReadResult } from "./types";

/**
 * 크롬 확장 표준 포맷 — `<root>/_locales/<locale>/messages.json`.
 *
 * 리프가 `{ message, description? }` 객체다. **`description`을 갖는 유일한 어댑터**라
 * 번역자 컨텍스트를 파일에서 그대로 얻는다.
 */

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

function write(_format: DetectedFormat, input: { locale: string; isBase: boolean; entries: readonly LocaleEntry[] }): string | null {
  const usable = usableEntries(input.entries);
  if (usable.length === 0) return null;

  // 정렬한 순서로 재조립한다 — JSON.stringify는 삽입 순서를 따르고, DB에서 온 순서를 믿을 수 없다.
  const out: Record<string, { message: string; description?: string }> = {};
  for (const e of usable) {
    // description은 원문 메타데이터라 base에만 넣는다 — 번역 파일마다 복제하면 읽는 쪽이 없다.
    out[e.key] = input.isBase && e.description ? { message: e.message, description: e.description } : { message: e.message };
  }
  return serialize(out);
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
