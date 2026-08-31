/**
 * DB 상태 → 크롬 확장 `_locales/<locale>/messages.json` 문자열.
 *
 * **불변식: 같은 입력 → 언제나 바이트 단위로 같은 출력.** 이게 깨지면 pull의 blob SHA 비교가
 * 매번 "변경됨"을 뱉어, 야간 cron이 매일 무의미한 커밋을 얹고 PR diff가 노이즈로 덮인다.
 * 조용히 망가지고 며칠 뒤에 발견되는 종류의 실패다 (ARCHITECTURE §1).
 *
 * 순수 함수다 — DB·파일·시간을 읽지 않는다. 호출부가 이미 프로젝트·로케일로 좁힌 행을 넘긴다.
 */

/** 한 로케일 관점에서 본 키 하나. `translation`은 그 로케일의 값이고 미번역이면 비어 있다. */
export type ExportKey = {
  key: string;
  sourceText: string;
  description?: string | null;
  orphaned: boolean;
  translation?: string | null;
};

export type ExportOptions = {
  /** 기준 로케일이면 `message`가 `sourceText`, 아니면 `translation`이다. */
  isBase: boolean;
};

/** messages.json의 항목 하나. `description`은 base 로케일에서만, 값이 있을 때만 붙는다. */
type Entry = { message: string; description?: string };

/**
 * @returns 결정적으로 생성된 JSON 문자열. **낼 항목이 하나도 없으면 `null`** — 호출부는 그
 *   로케일의 파일을 트리에서 아예 뺀다. 빈 `{}`를 내면 크롬이 "이 로케일 지원함"으로 읽어
 *   사용자에게 빈 UI를 보이는데, 파일이 없으면 의도대로 폴백한다.
 */
export function exportLocale(
  keys: readonly ExportKey[],
  options: ExportOptions,
): string | null {
  const entries = new Map<string, Entry>();

  for (const item of keys) {
    // orphaned는 코드에서 사라진 키다. DB엔 남기고 export에서만 뺀다 — 되돌릴 수 있어야 한다.
    if (item.orphaned) continue;

    const message = options.isBase ? item.sourceText : item.translation;
    // 미번역 키를 빈 문자열로 내보내면 크롬이 그 값을 그대로 렌더한다. 항목을 빼면 폴백한다.
    // 빈 문자열도 미번역으로 취급한다 — 편집 UI에서 지운 값이 그렇게 들어온다.
    if (message === undefined || message === null || message === "") continue;

    const entry: Entry = { message };
    // description은 원문에 대한 메타데이터라 base에만 넣는다. 번역 파일마다 같은 텍스트를
    // 복제하면 바이트만 늘고 읽는 쪽이 없다(번역자는 편집 UI를 본다).
    if (options.isBase && item.description) entry.description = item.description;

    entries.set(item.key, entry);
  }

  if (entries.size === 0) return null;

  // 정렬한 순서로 객체를 **재조립**한다. JSON.stringify는 삽입 순서를 따르므로, DB에서 온
  // 순서를 믿으면 출력이 비결정적이 된다(Postgres는 ORDER BY 없는 쿼리의 순서를 보장하지 않는다).
  //
  // `<` 비교 = UTF-16 코드 유닛 순서다. 크롬이 메시지 이름에 허용하는 문자(`[A-Za-z0-9_@]`)
  // 범위에서는 코드포인트 순서와 같고, 무엇보다 **환경에 의존하지 않는다** — localeCompare는
  // Node ICU 버전·로케일에 따라 결과가 달라져 불변식이 실행 환경에 묶인다.
  const sorted: Record<string, Entry> = {};
  for (const [name, entry] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    sorted[name] = entry;
  }

  // JSON.stringify는 끝에 개행을 붙이지 않는다. 2개가 되면 SHA가 달라지므로 정확히 1개.
  return `${JSON.stringify(sorted, null, 2)}\n`;
}
