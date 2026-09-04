import { adapterFor } from "@/lib/adapters";
import type { Adapter, AdapterError, DetectedFormat, WriteInput } from "@/lib/adapters";
import { buildWriteEntries, type LocalFile, type LocalePath, type PullRow } from "./plan";

/**
 * DB 상태 → 파일 내용. **순수 함수다** — 어댑터의 `write`도 I/O가 없으므로 이 층 전체가
 * 테스트로 검증된다. GitHub에서 받아온 원본은 인자로 들어온다.
 *
 * ⚠️ `server-only`를 붙이지 않는다 — 테스트가 직접 import한다.
 */

/** 한 키의 전 로케일 값. `lib/keys/view.ts`의 `KeyRow`와 같은 모양이라 조회를 재사용할 수 있다. */
export type RenderKey = {
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
 * — 행이 없으면 `sourceText`로 떨어지지만, 값을 지운 것은 미번역으로 남아야 한다 (MVP §3.2).
 */
export function rowsForLocale(
  keys: readonly RenderKey[],
  locale: string,
  opts: { isBase?: boolean } = {},
): PullRow[] {
  return keys.map((k) => {
    const cell = k.cells[locale];
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
        throw new Error(`per-locale 경로에 locale이 없다: ${p.path} (resolveLocalePaths 버그)`);
      }
      // ⚠️ **원본이 없을 때의 처리가 두 방식의 계약 차이다.**
      //   - 수술적 — 파일을 **안 만든다**. 치환할 대상이 없다 (§1.4)
      //   - 재생성 — **계속 만든다**. 원본은 표현(들여쓰기)만 주고, 없으면 기본값이다
      // 이 줄이 뒤섞이면 새 로케일이 PR에서 조용히 빠지거나, 수술적 어댑터가 없던 파일을 만든다.
      const original = current.get(p.path);
      if (original === undefined && adapter.writeStrategy === "surgical") {
        return { path: p.path, content: null };
      }
      const writeFormat =
        original === undefined ? format : { ...format, currentFiles: [{ path: p.path, content: original }] };
      const isBase = locale === baseLocale;
      // ⚠️ `rowsForLocale`에도 `isBase`를 넘긴다 — 여기서 빠지면 base description 폴백(위 주석)이
      // 단위 테스트에서만 켜지고 프로덕션에서는 절대 켜지지 않는다 (2026-09-04 audit #2).
      const { content, errors } = write(writeFormat, {
        locale,
        isBase,
        entries: buildWriteEntries(rowsForLocale(keys, locale, { isBase }), { isBase }),
      });
      return { path: p.path, content, ...(errors.length === 0 ? {} : { errors }) };
    });
  }

  return paths.map((p) => {
    const original = current.get(p.path);
    // 원본이 없으면 치환할 대상이 없다. 파일을 새로 만들지 않는다 — 수술적 치환의 전제다.
    if (original === undefined) return { path: p.path, content: null };

    let content = original;
    const errors: AdapterError[] = [];
    for (const locale of format.locales) {
      const isBase = locale === baseLocale;
      const next = write(
        // 직전 결과를 원본으로 넘긴다 — 그래야 로케일 치환이 누적된다.
        { ...format, currentFiles: [{ path: p.path, content }] },
        {
          locale,
          isBase,
          entries: buildWriteEntries(rowsForLocale(keys, locale, { isBase }), { isBase }),
        },
      );
      errors.push(...next.errors);
      // `null`은 원본이 없을 때뿐이고 위에서 걸렀다. 방어적으로 직전 내용을 유지한다.
      if (next.content !== null) content = next.content;
    }
    return { path: p.path, content, ...(errors.length === 0 ? {} : { errors }) };
  });
}
