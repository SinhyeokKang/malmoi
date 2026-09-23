import { accessErrorMessage, type AccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";

/**
 * `updateRepositorySettings`의 거부 갈래 → 문구 (6b-3 — DESIGN §6.6).
 * `lib/auth/message.ts`·`lib/github-connect/message.ts`와 같은 형이다.
 *
 * ⚠️ **`noop`은 이 union에 없다.** 그것은 거부가 아니라 "쓸 것이 없다"이고 화면은 성공으로 보인다 —
 * 갈래에 넣으면 "현재 값을 다시 저장했다"가 오류 Alert로 나온다.
 *
 * ⚠️ **잎이다** — 설정 화면(클라이언트)이 값으로 읽는다. `@/lib/i18n`만 물고, 판정 함수
 * (`isValidBranchName`·`planBaseLocaleChange`)는 각자 자기 잎 모듈에 있다.
 */
export type RepositorySettingsError = "invalid-branch" | "unknown-locale" | "orphaned-locale";

/** 갈래 누락은 `satisfies`가 컴파일 타임에 잡는다 — 옛 `never` 검사와 같은 힘이다. */
const DICT = m.errors.repositorySettings satisfies Record<RepositorySettingsError, string>;

export function isRepositorySettingsError(value: string | undefined): value is RepositorySettingsError {
  return value !== undefined && Object.hasOwn(DICT, value);
}

export function repositorySettingsErrorMessage(error: RepositorySettingsError): string {
  return DICT[error];
}

/**
 * Settings 화면의 접근 거부 → 문구 (QA D1, 2026-09-24). `archived`만 갈린다 — 공용 문구(`errors.access.archived`)는
 * "설정에서 복원하라"를 말하는데 보는 사람이 이미 그 설정에 있다. 다른 행과 같은 `archivedReason` 한 문장을 쓴다.
 */
export function settingsAccessMessage(error: AccessError): string {
  return error === "archived" ? m.settings.archivedReason : accessErrorMessage(error);
}
