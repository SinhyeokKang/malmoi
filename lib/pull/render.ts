import { fail } from "@/lib/failure";
import { adapterFor } from "@/lib/adapters";
import type { Adapter, AdapterError, DetectedFormat, LocaleEntry, WriteInput } from "@/lib/adapters";
import { buildWriteEntries, type LocalFile, type LocalePath, type PullRow, type RenderError } from "./plan";

/**
 * DB 상태 → 파일 내용. **순수 함수다** — 어댑터의 `write`도 I/O가 없으므로 이 층 전체가
 * 테스트로 검증된다. GitHub에서 받아온 원본은 인자로 들어온다.
 *
 * ⚠️ `server-only`를 붙이지 않는다 — 테스트가 직접 import한다.
 */

/** 한 키의 전 로케일 값. `lib/keys/view.ts`의 `KeyRow`와 같은 모양이라 조회를 재사용할 수 있다. */
export type RenderKey = {
  /** `StringKey.id`. 보류 좌표(키 이름)와 캡처 편집(키 id)을 잇는다 — 없으면 그 키의 셀은 셀 좌표로 보류되지 않는다. */
  id?: string;
  key: string;
  sourceText: string;
  /** **키 단위** description (`StringKey.description`). base 파일에서 온 소스 메타데이터다. */
  description?: string | null;
  /** base 파일에서의 키 위치 (`StringKey.sortIndex`). 없으면 순서를 모르는 키다. */
  sortIndex?: number | null;
  orphaned: boolean;
  /**
   * 로케일 코드 → 셀. 없는 로케일은 미번역이다.
   *
   * `description`·`placeholders`는 **그 로케일 파일이 실제로 갖고 있던** 값이다 — 위의 키 단위
   * `description`과 다른 것이고, 섞으면 base 값을 비-base에 복제하게 되어 병합이 된다.
   */
  cells: Record<string, { value: string; description?: string; placeholders?: unknown } | undefined>;
};

/**
 * 로케일 하나분 행으로 접는다. **셀 부재(`null`)와 빈 문자열을 구별해야** base 폴백이 성립한다
 * — 행이 없으면 `sourceText`로 떨어지지만, 값을 지운 것은 미번역으로 남아야 한다.
 */
export function rowsForLocale(
  keys: readonly RenderKey[],
  locale: string,
  opts: { isBase?: boolean } = {},
): PullRow[] {
  return keys.map((k) => {
    // ⚠️ **로케일 코드는 리포가 정한 키다** — `isPathSafeLocale`이 `constructor`·`toString`을
    // 통과시키므로 평범한 인덱싱은 `Object.prototype`의 값을 셀로 집는다 (CLAUDE.md 코드 컨벤션 ·
    // 대입 쪽 짝은 `lib/keys/query.ts`의 `Object.create(null)`이다). **여기는 파일로 나가는 경로라 더 위험하다.**
    const cell = Object.hasOwn(k.cells, locale) ? k.cells[locale] : undefined;
    // **base만 키 단위 description으로 폴백한다.** `Translation.description`이 전부 null인
    // 마이그레이션 직후에도 base 파일이 description을 잃지 않게 하는 장치다 —
    // `value ?? sourceText`(아래 `buildWriteEntries`)와 같은 축이고, 그 값은 애초에 base
    // 파일에서 온 것이라 원본 복원이다. **비-base에 쓰면 원본에 없던 값을 만드는 것이라 병합이다.**
    const description = cell?.description ?? (opts.isBase ? (k.description ?? undefined) : undefined);
    return {
      key: k.key,
      sourceText: k.sourceText,
      ...(description ? { description } : {}),
      // ⚠️ `undefined` 검사다 — `?? undefined`로 null을 걷어내되 **0을 falsy로 흘리지 않는다.**
      ...(k.sortIndex === null || k.sortIndex === undefined ? {} : { sortIndex: k.sortIndex }),
      // placeholders는 base 폴백이 없다 — `StringKey`에 담을 곳이 없다.
      ...(cell?.placeholders === undefined ? {} : { placeholders: cell.placeholders }),
      orphaned: k.orphaned,
      value: cell?.value ?? null,
    };
  });
}

/**
 * 쓸 파일들의 내용을 만든다.
 *
 * **`multi-locale`은 파일 × 로케일 이중 루프다.** `ts-dict.write`는 `currentFiles[0]`만 보고
 * `input.locale`로 로케일 객체 하나를 고르므로, 파일 하나를 완성하려면 로케일마다 한 번씩 부르며
 * **직전 결과를 다음 호출의 원본으로 넘겨야** 한다. 파일 축만 돌면 나머지 로케일이 조용히 원본으로
 * 남고, PR diff에 ko만 바뀐 채로 나간다.
 *
 * @param current 경로 → 원본 내용. 수술적 치환 어댑터만 쓴다 (재생성은 빈 맵이어도 된다).
 */
/** 수술적 어댑터가 원본 없이 파일을 안 낼 때의 보고. 값을 잃은 것은 아니지만 **빠졌다는 사실**은 알려야 한다. */
const missingOriginal = (path: string, locale?: string): RenderError => ({ path, code: "original-file-missing", ...(locale === undefined ? {} : { locale }) });
/** 오류에 그 write 호출의 로케일을 붙인다 — 어댑터 오류는 파일 좌표만 들고, 로케일은 렌더만 안다. */
const tagged = (errors: readonly AdapterError[], locale: string): RenderError[] => errors.map((e) => ({ ...e, locale }));

/**
 * **pull 시점 base 파일의 키 집합은 원본 base 파일이 정한다** (launch-audit B3.4 · ARCHITECTURE §0 불변식 2·§1.1). CI 적재가 보류된 동안(미전달 편집 —
 * sync-edit-protection) 코드가 base를 바꾸면 DB 키 집합이 리포보다 뒤처진다. DB 키로 base를 쓰면 코드가 더한 키가 PR에서 **지워지고**(재생성), 코드가
 * 지운 키가 **되살아난다**(재생성·삽입하는 수술적). 규칙은 키마다 출처가 하나다 — 값을 견줘 고르지 않는다:
 * - 원본에도 DB(활성 키)에도 있다 → DB 엔트리
 * - 원본에만 있다 → 원본 엔트리 그대로(재생성은 다시 쓰고, 수술적은 건드리지 않는다). orphaned DB 키도 여기다 — DB가 활성으로 보지 않는다
 * - DB에만 있다 → 쓰지 않는다. 그 셀의 편집은 보류된다(`lib/pull/undeliverable.ts` `keySlot` — 미리보기와 같은 판정)
 *
 * 재생성은 **원본 순서**(`order`)로 조립한다 — 코드가 순서를 바꿨어도 따른다. 같은 DB·같은 원본 → 같은 바이트(불변식 4)는 그대로다.
 * ⚠️ **재생성의 원본을 못 읽으면 쓰지 않고 막는다** — 키 집합을 알 수 없는데 DB로 덮으면 코드 소유 키를 지운다. 수술적은 writer가 같은 원본을 못 읽어
 * `write-parse-failed`를 스스로 낸다. multi-locale(ts-dict)은 삽입하지 않아 이 규칙이 필요 없다.
 */
function baseOwnedByOriginal(
  adapter: Adapter,
  format: DetectedFormat,
  path: string,
  original: string,
  locale: string,
  fromDb: readonly LocaleEntry[],
): { entries: LocaleEntry[] } | { error: RenderError } {
  const read = adapter.read(format, [{ path, content: original }]);
  const own = read.locales.find((l) => l.locale === locale);
  if (own === undefined) {
    if (adapter.writeStrategy === "surgical") return { entries: [...fromDb] };
    const cause = read.errors[0];
    return { error: { path, code: "write-parse-failed", locale, ...(cause === undefined ? {} : { detail: cause.detail ?? cause.code }) } };
  }
  const originalKeys = new Set(own.entries.map((e) => e.key));
  if (adapter.writeStrategy === "surgical") return { entries: fromDb.filter((e) => originalKeys.has(e.key)) };
  const byKey = new Map(fromDb.map((e) => [e.key, e]));
  return {
    entries: own.entries.map((o, i) => {
      const order = o.order ?? i;
      const db = byKey.get(o.key);
      if (db !== undefined) return { ...db, order };
      // 원본 엔트리 그대로 — base의 빈 값도 파일에 남아야 한다(L4.10의 `writeEmpty`와 같은 이유).
      return { ...o, order, ...(o.message === "" ? { writeEmpty: true as const } : {}) };
    }),
  };
}

export function renderLocaleFiles(
  format: DetectedFormat,
  layout: Adapter["layout"],
  paths: readonly LocalePath[],
  keys: readonly RenderKey[],
  baseLocale: string,
  current: ReadonlyMap<string, string>,
): LocalFile[] {
  const adapter = adapterFor(format);
  // **`writeWithErrors`가 있으면 그쪽을 쓴다.** `write`만 부르면 json-catalog가 접두 충돌로 버린
  // 키가 프로덕션에서 아무 데도 보고되지 않는다 — survey만 그걸 보고 있었다 (ARCHITECTURE §1.35
  // "어느 키에서 잃었는지 알려주는 것이 최소 조건").
  const write = (f: DetectedFormat, input: WriteInput): { content: string | null; errors: AdapterError[] } =>
    adapter.writeWithErrors !== undefined
      ? adapter.writeWithErrors(f, input)
      : { content: adapter.write(f, input), errors: [] };

  if (layout === "per-locale") {
    return paths.map((p) => {
      // per-locale은 경로가 로케일을 결정하므로 `locale`이 반드시 있다. 폴백을 두지 않는다 —
      // 조용히 다른 로케일로 떨어지면 `i18n/ko.json`에 en 번역이 쓰인다.
      const { locale } = p;
      if (locale === undefined) {
        fail(`per-locale path carries no locale: ${p.path} (resolveLocalePaths bug)`);
      }
      // ⚠️ **원본이 없을 때의 처리가 두 방식의 계약 차이다.**
      //   - 수술적 — 파일을 **안 만든다**. 치환할 대상이 없다 (§1.4)
      //   - 재생성 — **계속 만든다**. 원본은 표현(들여쓰기)만 주고, 없으면 기본값이다
      // 이 줄이 뒤섞이면 새 로케일이 PR에서 조용히 빠지거나, 수술적 어댑터가 없던 파일을 만든다.
      const original = current.get(p.path);
      if (original === undefined && adapter.writeStrategy === "surgical") {
        // ⚠️ **안 내는 것도 보고한다.** `null`만 돌려주면 `planPullChanges`가 건너뛰고 warnings에도
        // 안 실려 그 로케일이 흔적 없이 PR에서 빠진다 — ts-dict의 로케일 객체 부재는 에러로
        // 내는데 파일 부재만 예외였다 (2026-09-04 audit #7).
        return { path: p.path, locale, content: null, errors: [missingOriginal(p.path, locale)] };
      }
      const writeFormat =
        original === undefined ? format : { ...format, currentFiles: [{ path: p.path, content: original }] };
      const isBase = locale === baseLocale;
      // ⚠️ `rowsForLocale`에도 `isBase`를 넘긴다 — 여기서 빠지면 base description 폴백(위 주석)이
      // 단위 테스트에서만 켜지고 프로덕션에서는 절대 켜지지 않는다 (2026-09-04 audit #2).
      const fromDb = buildWriteEntries(rowsForLocale(keys, locale, { isBase }), { isBase });
      const owned = isBase && original !== undefined ? baseOwnedByOriginal(adapter, writeFormat, p.path, original, locale, fromDb) : { entries: fromDb };
      if ("error" in owned) return { path: p.path, locale, content: null, errors: [owned.error] };
      const { entries } = owned;
      const { content, errors } = write(writeFormat, { locale, entries });
      return { path: p.path, locale, content, ...(errors.length === 0 ? {} : { errors: tagged(errors, locale) }) };
    });
  }

  return paths.map((p) => {
    const original = current.get(p.path);
    // 원본이 없으면 치환할 대상이 없다 — **수술적 치환의 전제다.** per-locale 갈래와 같은 축(`writeStrategy`)으로 가른다(audit #55):
    // `layout`만 보고 막으면 재생성 multi-locale 어댑터가 새 파일을 조용히 빠뜨린다.
    if (original === undefined && adapter.writeStrategy === "surgical") return { path: p.path, content: null, errors: [missingOriginal(p.path)] };

    let content = original;
    const errors: RenderError[] = [];
    for (const locale of format.locales) {
      const isBase = locale === baseLocale;
      const next = write(
        // 직전 결과를 원본으로 넘긴다 — 그래야 로케일 치환이 누적된다. 원본 없는 재생성의 첫 호출만 `currentFiles`가 없다.
        content === undefined ? format : { ...format, currentFiles: [{ path: p.path, content }] },
        {
          locale,
          entries: buildWriteEntries(rowsForLocale(keys, locale, { isBase }), { isBase }),
        },
      );
      errors.push(...tagged(next.errors, locale));
      // 수술적 `null`은 원본이 없을 때뿐이고 위에서 걸렀다. 방어적으로 직전 내용을 유지한다.
      if (next.content !== null) content = next.content;
    }
    return { path: p.path, content: content ?? null, ...(errors.length === 0 ? {} : { errors }) };
  });
}
