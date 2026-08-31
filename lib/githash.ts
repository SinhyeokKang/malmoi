import { createHash } from "node:crypto";

/**
 * git이 blob에 매기는 SHA-1을 로컬에서 계산한다 — `sha1("blob <바이트수>\0" + 내용)`.
 *
 * **목적은 GitHub API 호출을 건너뛰는 것이다.** pull 흐름은 base 트리의 blob SHA와 이 값을
 * 비교해, 전부 같으면 API를 한 번도 더 부르지 않는다. 야간 cron이 매일 도는데 변경 없는 날이
 * 대부분이라 그게 기본 경로다 (ARCHITECTURE §2·§3).
 *
 * 따라서 이 함수는 git과 **바이트 단위로 같은 값**을 내야 한다. 한 비트라도 다르면 변경 감지가
 * 항상 "변경됨"을 뱉고, 무의미한 커밋이 매일 쌓여 PR diff가 노이즈로 덮인다.
 *
 * 길이는 **UTF-8 바이트 수**다. `content.length`(UTF-16 코드 유닛 수)를 쓰면 ASCII에서만
 * 맞고 한글·프랑스어·이모지에서 즉시 틀린다 — 번역 파일이 정확히 그 내용이라 실패가 보장된다.
 */
export function blobSha(content: string): string {
  const body = Buffer.from(content, "utf8");
  const header = Buffer.from(`blob ${body.byteLength}\0`, "utf8");
  return createHash("sha1").update(header).update(body).digest("hex");
}
