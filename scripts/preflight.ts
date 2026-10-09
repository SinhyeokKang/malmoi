import { preflight } from "../lib/deployment/preflight";
import { probeUploadDir } from "../lib/upload/file-store";

/**
 * **self-hosted 기동 진입** (self-hosting design §2) — `pnpm preflight`. 순수 판정에 실제 env와 업로드 디렉터리 probe를 물리고, 실패면
 * web을 띄우지 않게 exit 1이다. 영구 설정 결함을 "Try again later"류 일시 장애 문구로 보이게 하지 않는다.
 *
 * ⚠️ **이름과 사유 코드만 찍는다** — 값은 비밀이거나(키·DB URL) 경로다. 판정이 이미 값을 싣지 않는다.
 * ⚠️ **tsx로 돈다** — 판정이 `@/` 별칭으로 메일 발신자 정규식을 문다(`lib/invitation-email/config.ts`).
 */
const result = preflight(process.env, probeUploadDir);
if (result.ok) {
  console.log("preflight: ok");
} else {
  for (const { name, reason } of result.problems) console.error(`preflight: ${name} ${reason}`);
  process.exit(1);
}
