import { m, pick } from "@/lib/i18n";

/**
 * 업로드 거부 → 문구 (account-settings 태스크 4b).
 *
 * ⚠️ **문구가 `lib/upload/image.ts`가 아니라 사전에 있다.** 능력 쪽은 `UploadReject`의 **갈래
 * 이름만** 정의한다 — 문구를 그 모듈에 두면 `no-korean-ui.test.ts`가 한글만 세므로 green인 채
 * 사전을 통째로 우회한다.
 *
 * ⚠️ **인자가 `string`이다 — union이 아니다.** 단언을 걸면 "모르는 값에 폴백한다"가 검사에서
 * 지워지고, 그 폴백이 실제로 도는지 아무도 안 묻게 된다 (POSTMORTEM 2026-09-08).
 */
const UPLOAD = m.errors.upload;

export function uploadRejectMessage(reason: string): string {
  return pick(UPLOAD, reason, UPLOAD.fallback);
}
