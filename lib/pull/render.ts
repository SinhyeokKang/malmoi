import { adapterFor } from "@/lib/adapters";
import type { Adapter, DetectedFormat } from "@/lib/adapters";
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
  description?: string | null;
  orphaned: boolean;
  /** 로케일 코드 → 셀. 없는 로케일은 미번역이다. */
  cells: Record<string, { value: string } | undefined>;
};

/**
 * 로케일 하나분 행으로 접는다. **셀 부재(`null`)와 빈 문자열을 구별해야** base 폴백이 성립한다
 * — 행이 없으면 `sourceText`로 떨어지지만, 값을 지운 것은 미번역으로 남아야 한다 (MVP §3.2).
 */
export function rowsForLocale(keys: readonly RenderKey[], locale: string): PullRow[] {
  return keys.map((k) => ({
    key: k.key,
    sourceText: k.sourceText,
    ...(k.description ? { description: k.description } : {}),
    orphaned: k.orphaned,
    value: k.cells[locale]?.value ?? null,
  }));
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

  if (layout === "per-locale") {
    return paths.map((p) => {
      // per-locale은 경로가 로케일을 결정하므로 `locale`이 반드시 있다. 폴백을 두지 않는다 —
      // 조용히 다른 로케일로 떨어지면 `i18n/ko.json`에 en 번역이 쓰인다.
      const { locale } = p;
      if (locale === undefined) {
        throw new Error(`per-locale 경로에 locale이 없다: ${p.path} (resolveLocalePaths 버그)`);
      }
      const content = adapter.write(format, {
        locale,
        isBase: locale === baseLocale,
        entries: buildWriteEntries(rowsForLocale(keys, locale), { isBase: locale === baseLocale }),
      });
      return { path: p.path, content };
    });
  }

  return paths.map((p) => {
    const original = current.get(p.path);
    // 원본이 없으면 치환할 대상이 없다. 파일을 새로 만들지 않는다 — 수술적 치환의 전제다.
    if (original === undefined) return { path: p.path, content: null };

    let content = original;
    for (const locale of format.locales) {
      const isBase = locale === baseLocale;
      const next = adapter.write(
        // 직전 결과를 원본으로 넘긴다 — 그래야 로케일 치환이 누적된다.
        { ...format, currentFiles: [{ path: p.path, content }] },
        {
          locale,
          isBase,
          entries: buildWriteEntries(rowsForLocale(keys, locale), { isBase }),
        },
      );
      // `null`은 원본이 없을 때뿐이고 위에서 걸렀다. 방어적으로 직전 내용을 유지한다.
      if (next !== null) content = next;
    }
    return { path: p.path, content };
  });
}
