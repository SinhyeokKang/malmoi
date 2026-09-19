import { Lock } from "lucide-react";

import { m } from "@/lib/i18n";
import type { Role } from "@/lib/auth/permission";

/**
 * 읽기전용 역할 — **점선 테두리 + 자물쇠** (DESIGN §6.65 · 캔버스 `1a`·`1b`).
 *
 * ⚠️ **감추지 않고 끈 모양으로 그린다.** 전에는 EDITOR 시야에서 셀렉트 자리가 맨 글자였고 오른쪽 끝이
 * 통째로 비었다 — 같은 화면을 보는 OWNER와 말을 맞출 수 없었다. 형이 "바꿀 수 있었는데 잠겨 있다"를
 * 말하므로 사유를 따로 띄우지 않아도 된다. **두 표의 오른쪽 끝이 같은 축**이어야 한다는 것이 요지다.
 *
 * ⚠️ **잠긴 까닭이 둘이라 접근 이름이 둘이다** (핸드오프 결정 3). 대기 초대는 발급 시점에 굳은 것이고
 * (`ProjectInvitation.role`은 `changeMember`가 못 건드린다) EDITOR 시야는 권한이 없는 것이다 —
 * 한 문장으로 접으면 **"Revoke하고 다시 초대"라는 복구 경로**가 사라진다.
 *
 * ⚠️ **자물쇠가 `aria-hidden`이고 칩이 `aria-label`을 든다.** 보이는 역할 낱말은 그 라벨 안에 그대로
 * 들어 있으므로(`{role}, …`) 낭독에서 사라지지 않는다 — WCAG 2.5.3의 Label in Name도 그래서 지켜진다.
 *
 * ⚠️ **높이가 `h-9`(36)이고 캔버스의 32가 아니다** (2026-09-19 사용자 판정 — 프리미티브가 이긴다).
 * 같은 자리에 서는 `SelectTrigger`가 `h-9`라 갈리면 행마다 오른쪽 군의 높이가 튄다. 폭 132는 캔버스다.
 */
export function RoleChip({ role, reason }: { role: Role; reason: "pending" | "editor" }) {
  const label = m.projects.role[role];
  return (
    <span
      data-role-chip
      aria-label={m.members.roleLocked[reason](label)}
      className="border-border bg-foreground/[0.02] text-muted-foreground inline-flex h-9 w-[132px] shrink-0 items-center gap-1.5 rounded-md border border-dashed px-2.5 text-sm"
    >
      {label}
      <Lock aria-hidden className="ml-auto size-[13px] text-neutral-300" />
    </span>
  );
}
