import { Lock } from "lucide-react";

import { m } from "@/lib/i18n";
import type { Role } from "@/lib/auth/permission";

/**
 * 읽기전용 역할 — **점선 테두리 + 자물쇠** (DESIGN §6.65 · 캔버스 `1a`·`1b`).
 *
 * ⚠️ **감추지 않고 끈 모양으로 그린다.** 전에는 EDITOR 시야에서 셀렉트 자리가 맨 글자였고 오른쪽 끝이
 * 통째로 비었다 — 같은 화면을 보는 OWNER와 말을 맞출 수 없었다. **두 표의 오른쪽 끝이 같은 축**이어야
 * 한다는 것이 요지다.
 *
 * ⚠️ **잠긴 까닭이 둘이라 문장이 둘이다** (핸드오프 결정 3). 대기 초대는 발급 시점에 굳은 것이고
 * (`ProjectInvitation.role`은 `changeMember`가 못 건드린다) EDITOR 시야는 권한이 없는 것이다 —
 * 한 문장으로 접으면 **"Revoke하고 다시 초대"라는 복구 경로**가 사라진다.
 *
 * ⚠️ **`aria-label`을 쓰지 않는다 — `sr-only` 텍스트다** (2026-09-19 리뷰 🔴1). 이 칩은 role이 없는
 * `<span>`이고, ARIA 1.2는 **`generic`에 이름을 붙이는 것을 금지**한다(naming prohibited). Chromium은
 * 그 노드를 unignore해 이름을 실어 주므로 **CDP 실측이 통과 신호를 준다** — 그것은 Chrome이 관대하다는
 * 사실이지 계약이 아니고, 규격을 따르는 AT에서는 사유가 통째로 사라진다. 보이는 낱말을 숨기고
 * 문장 전체를 `sr-only`로 읽히면 규격 안에서 같은 결과가 난다(문장이 `{role}, …`로 시작한다).
 *
 * ⚠️ **대상(`who`)을 안 든다 — 이 화면의 다른 컨트롤과 반대다.** 행마다 같은 문장이지만 칩은
 * **포커스를 못 받는 비대화형 요소**라 탭 순서에 안 들어오고, 낭독은 언제나 그 행의 이름 바로 뒤다.
 * 누구의 역할인지는 앞서 읽힌 이름이 이미 말한다 (캔버스가 정한 문장에 대상이 없는 이유다).
 *
 * ⚠️ **높이가 `h-9`(36)이고 캔버스의 32가 아니다** (2026-09-19 사용자 판정 — 프리미티브가 이긴다).
 * 같은 자리에 서는 `SelectTrigger`가 `h-9`라 갈리면 행마다 오른쪽 군의 높이가 튄다. 폭 132는 캔버스다.
 *
 * ⚠️ **자물쇠가 12다 — 캔버스의 13이 아니다.** §6.8이 아이콘 크기를 넷(16·14·12·20)으로 고정하고,
 * 13을 쓰면 임의값이 리포 최초로 생긴다. 색 `#d4d4d4`는 캔버스 값 그대로인데 **칩 배경 위에서 대비가
 * 낮다** — 그래서 자물쇠는 **보조 신호이고 사유를 지는 것은 위 `sr-only` 문장**이다(§6.65).
 */
export function RoleChip({ role, reason }: { role: Role; reason: "pending" | "editor" }) {
  const label = m.projects.role[role];
  return (
    <span
      data-role-chip
      className="border-border bg-foreground/[0.02] text-muted-foreground inline-flex h-9 w-[132px] shrink-0 items-center gap-1.5 rounded-md border border-dashed px-2.5 text-sm"
    >
      <span aria-hidden>{label}</span>
      <Lock aria-hidden className="ml-auto size-3 text-neutral-300" />
      <span className="sr-only">{m.members.roleLocked[reason](label)}</span>
    </span>
  );
}
