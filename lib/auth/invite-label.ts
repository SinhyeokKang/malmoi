import { maskEmail } from "./email";

/**
 * 대기 초대 표의 표시 라벨 — **목록 전체를 보고** 충돌하는 행만 구별한다 (malmoi#18).
 *
 * ⚠️ **왜 `maskEmail`을 고치지 않는가.** 그 함수의 소비자가 셋이고(초대 화면·셀 메타·멤버 표)
 * 지역 사본을 두면 같은 주소가 화면마다 다르게 보인다 (CLAUDE.md). 그리고 대기 초대만의 성질이
 * 문제의 뿌리다: **그 표에서 마스킹한 주소가 유일한 식별자다.** 멤버 표는 이름이 있어 첫 글자만
 * 남겨도 행이 갈리지만, 대기 초대는 주소뿐이라 `qa-invite-…@example.com`과
 * `qa-signed-out@example.com`이 둘 다 `q***@example.com`이 되어 **같은 행**이 된다. [Revoke]는
 * 되돌릴 수 없어(복구는 새 링크 재발급) 엉뚱한 사람의 링크를 무효화한다.
 *
 * ⚠️ **충돌이 없으면 출력이 `maskEmail`과 글자 하나까지 같다.** 흔한 경우가 가장 조용해야 한다
 * (DESIGN §6.1) — 항상 세 글자를 보이는 쪽으로 고치면 충돌하지 않는 다수의 주소가 필요 이상으로
 * 노출된다. 노출은 **갈라야 할 때 최소한만** 늘린다.
 */
export function maskedInviteLabels(emails: readonly string[]): string[] {
  return emails.map((email, index) => label(email, emails, index));
}

function label(email: string, all: readonly string[], index: number): string {
  const at = email.indexOf("@");
  // `maskEmail`과 같은 폴백 — 주소 모양이 아니면 가릴 로컬 파트가 없다.
  if (at <= 0) return maskEmail(email);
  const local = email.slice(0, at);
  const domain = email.slice(at);

  // 같은 도메인의 **다른 행**들만 경쟁자다. 도메인이 다르면 첫 글자가 같아도 행이 갈린다.
  const rivals = all.filter((other, i) => i !== index && other.slice(other.indexOf("@")) === domain);
  if (rivals.length === 0) return maskEmail(email);

  const rivalLocals = rivals.map((other) => other.slice(0, other.indexOf("@")));
  for (let keep = 1; keep < local.length; keep += 1) {
    const head = local.slice(0, keep);
    // 그 길이로 나만 남으면 거기서 멈춘다 — 필요한 만큼만 보인다.
    if (!rivalLocals.some((rival) => rival.slice(0, keep) === head)) return `${head}***${domain}`;
  }
  // ⚠️ **한쪽이 다른 쪽의 접두이면 늘려도 안 갈린다** (`a@x` vs `ab@x`). 로컬 파트를 전부 보인다 —
  // 마스킹을 포기하는 것이 **엉뚱한 링크를 무효화하는 것보다 낫다**. 이 분기가 없으면 조용한 중복이 남는다.
  return email;
}
