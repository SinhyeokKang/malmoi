import { Archive } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { canPerform, type Role } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 보관된 프로젝트 화면 (7단계 — sync-runs design §4). **정책과 문구를 한 곳이 든다** —
 * 같은 갈래를 만나는 화면이 다섯이고(Home·번역·로케일·멤버·이력), 사본이 다섯이면 그중 하나가 낡는다.
 * `project-not-ready.tsx`와 같은 형이다.
 *
 * ⚠️ **`redirect()`를 쓰지 않는다** — `ProjectNotReady`와 다른 점이다. 보관은 되돌릴 수 있는
 * 상태이고 OWNER가 갈 곳은 **설정 안의 카드 하나**라, 튕기면 자기가 왜 거기 왔는지 모른다.
 * 여기서 **무슨 일이 있었는지 말하고** 링크를 준다.
 *
 * ⚠️ **EDITOR에게 설정 링크를 주지 않는다** — 그 화면은 `project:settings` 뒤라 눌러도 못 들어간다.
 * 누구에게 말해야 하는지를 대신 말한다 (`errors.access.archived`).
 */
export function ProjectArchived({ slug, role }: { slug: string; role: Role }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-6">
      <EmptyState
        icon={Archive}
        title={m.archive.empty.title}
        description={m.errors.access.archived}
        action={
          canPerform(role, "project:settings") ? (
            <ButtonLink href={routes.settings(slug)} variant="primary">
              {m.archive.empty.action}
            </ButtonLink>
          ) : undefined
        }
      />
    </main>
  );
}
