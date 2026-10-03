import type { Adapter, DetectedFormat, ReadLocale } from "@/lib/adapters/types";

/**
 * Publish가 리포 파일에서 **실제로 바꾼 번역 엔트리 수** — `SyncRun.changedValues` (project-card-tabs design §2.3, 정의 (b)). 잎 모듈이다.
 *
 * ⚠️ **관측값이다 — 판정에 쓰지 않는다.** 커밋 판정은 지금처럼 파일 blob SHA다. 이 수로 무엇을 보내거나 건너뛸지 고르는 순간 병합이다
 * (IMPORT 사건 `changedValues`와 같은 규칙).
 *
 * ⚠️ **미리보기의 `same`(`lib/publish/diff.ts`)과 공유하지 않는다** — 그쪽은 "실린 편집"을 견주고, 실행은 활성 키 전체의 DB 스냅샷을
 * 렌더한다. CI 보류 중 리포에서 바뀐 값을 DB 값이 되돌리는 셀은 미전달 편집이 아니라서 그쪽에 안 잡힌다.
 *
 * 세는 것: 수정 + 추가. **삭제는 세지 않는다** — DB에만 있는 키·`orphaned` 키가 파일에서 빠지는 것은 사람의 편집이 아니다.
 * **메시지만 견준다** — description·placeholders·키 순서·들여쓰기만 바뀐 파일은 0이 정상 관측값이다.
 */
export function countChangedValues(before: readonly ReadLocale[], after: readonly ReadLocale[]): number {
  // 키가 로케일 파일의 키라 프로토타입을 끊는다 (CLAUDE.md 코드 컨벤션).
  const old: Record<string, Record<string, string>> = Object.create(null);
  for (const locale of before) {
    const entries: Record<string, string> = Object.hasOwn(old, locale.locale) ? old[locale.locale]! : Object.create(null);
    for (const entry of locale.entries) entries[entry.key] = entry.message;
    old[locale.locale] = entries;
  }
  let count = 0;
  for (const locale of after) {
    const entries = Object.hasOwn(old, locale.locale) ? old[locale.locale]! : undefined;
    for (const entry of locale.entries) {
      if (entries === undefined || !Object.hasOwn(entries, entry.key) || entries[entry.key] !== entry.message) count += 1;
    }
  }
  return count;
}

/**
 * 파일 하나 — base 원문(`before`, 트리에 없던 새 파일이면 `undefined`)과 새 원문을 **그 파일만** 읽어 견준다. 여러 파일을 한 번에 읽으면
 * 같은 로케일이 합쳐져 다른 파일의 같은 키와 섞인다(`readSlotFiles`와 같은 이유).
 */
export function countFileChangedValues(
  adapter: Pick<Adapter, "read">,
  format: DetectedFormat,
  path: string,
  before: string | undefined,
  after: string,
): number {
  const read = (content: string) => adapter.read(format, [{ path, content }]).locales;
  return countChangedValues(before === undefined ? [] : read(before), read(after));
}
