import { z } from "zod";

/**
 * 번역값 저장 판정. **MVP의 유일한 사용자 mutation이다** (MVP §3.2) — 키·로케일 CRUD는 없다.
 *
 * 순수 함수라 테스트가 자기완결하고, DB 접근은 Server Action이 맡는다.
 */

/**
 * Server Action은 **공개 엔드포인트다** — 클라이언트가 직접 호출할 수 있으므로
 * 입력을 검증한다. 값 상한이 있는 이유도 그것이다.
 */
export const SaveInput = z.object({
  /**
   * ⚠️ **어느 프로젝트인가를 클라이언트가 보낸다 — 그리고 서버는 그것을 믿지 않는다.**
   * 이 값은 "무엇을 열려고 하는가"일 뿐이고, 실제 대상은 `getProjectAccess`가 멤버십 행에서
   * 꺼낸 `projectId`다 (SAAS §5.2·§7.7). 환경변수 기본값으로 떨어지지 않는 것이 요지다.
   */
  slug: z.string().min(1),
  keyId: z.string().min(1),
  localeCode: z.string().min(1),
  // 빈 값을 허용한다 — 지우기가 정당한 조작이다. 상한은 임의 크기 페이로드를 막는다.
  value: z.string().max(10_000),
});

export type SaveInputType = z.infer<typeof SaveInput>;

export type SavePlan = { action: "noop" } | { action: "upsert"; value: string };

/**
 * @param current DB의 현재 값. 행이 없으면 `null`.
 * @param next 사용자가 입력한 값.
 *
 * **`delete`를 만들지 않는다.** 행이 사라지면 export에서 그 키가 빠지고, pull이 리포 파일에서
 * 키를 지운다 — 코드가 참조하는 키가 사라져 런타임에 깨진다. 빈 문자열은 "번역 없음"을
 * 표현하면서 키를 남긴다.
 */
export function planSave(current: string | null, next: string): SavePlan {
  // 공백만 입력은 미번역 의도다. 단 값 안의 앞뒤 공백은 보존한다 —
  // 번역에 의미 있는 공백이 있을 수 있어 trim을 값에 적용하지 않는다.
  const value = next.trim() === "" ? "" : next;

  // 행이 없는데 빈 값이면 저장할 것이 없다.
  if (current === null && value === "") return { action: "noop" };
  if (current === value) return { action: "noop" };
  return { action: "upsert", value };
}
