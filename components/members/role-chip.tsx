import { Lock } from "lucide-react";

import { m } from "@/lib/i18n";
import type { Role } from "@/lib/auth/permission";

/**
 * 읽기전용 역할 — **점선 테두리 + 자물쇠** (DESIGN §6.65).
 *
 * ⚠️ **감추지 않고 끈 모양으로 그린다.** 전에는 EDITOR 시야에서 셀렉트 자리가 맨 글자였고 오른쪽 끝이
 * 통째로 비었다 — 같은 화면을 보는 OWNER와 말을 맞출 수 없었다. 형이 "바꿀 수 있었는데 잠겨 있다"를
 * 말하므로 사유를 따로 띄우지 않아도 된다.
 *
 * ⚠️ **역할 낱말을 `aria-hidden`으로 덮지 않는다.** sr-only 문장만 남기면 *"Role for Jane — only owners
 * can change this"*가 읽히고 **그 역할이 무엇인지는 안 읽힌다.** 보이는 글자는 그대로 두고 사유를 덧붙인다.
 *
 * ⚠️ **높이가 `h-9`(36)이고 시안의 32가 아니다.** 같은 자리에 서는 `SelectTrigger`가 `h-9`라 둘이
 * 갈리면 행마다 오른쪽 군의 높이가 튄다 — 4px 때문에 임의 치수(`h-8`)를 새로 만들지 않는다.
 * 폭도 내용에 맡긴다(시안 132는 `w-32`=128과 `w-36`=144 사이라 스케일에 없다).
 */
export function RoleChip({ role, who }: { role: Role; who: string }) {
  return (
    <span
      data-role-chip
      className="border-border text-muted-foreground inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-dashed px-3 text-sm"
    >
      <Lock aria-hidden className="size-3" />
      {m.projects.role[role]}
      <span className="sr-only"> {m.members.roleLocked(who)}</span>
    </span>
  );
}
