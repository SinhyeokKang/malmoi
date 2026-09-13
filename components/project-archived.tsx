import { Archive } from "lucide-react";

import { PanelBody } from "@/components/shell/content-panel";
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
    /*
      ⚠️ **`PanelHeader`가 없다 — 이 갈래엔 제목이 없다.** 본문만 있으므로 `PanelBody` 하나이고,
      `max-w-4xl`은 안쪽 래퍼가 든다(스크롤 컨테이너를 좁히면 스크롤바가 콘텐츠 옆에 생긴다).
    */
    <PanelBody className="flex flex-col">
      {/*
        ⚠️ **세로 중앙은 `flex-1`이 든다** (DESIGN §6.4 — 번역 화면 빈 상태 넷과 같은 형). 위에 붙여
        두면 1080 화면에서 문구가 한 줄로 떠 있고 그 아래가 통째로 빈다. `EmptyState`가 수직 중앙을
        안 하므로(표 안에서도 쓰인다) 이 자리가 그것을 잡는 유일한 곳이다.
      */}
      <div className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-6 py-6">
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
      </div>
    </PanelBody>
  );
}
