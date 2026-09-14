import { Languages } from "lucide-react";
import { redirect } from "next/navigation";

import { PanelBody } from "@/components/shell/content-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { canPerform, type Role } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 첫 적재 전 프로젝트 화면 (design §3.7). **정책과 문구를 한 곳이 든다** — Home과 번역 화면이
 * 같은 갈래를 만나고, 6b-6이 Home을 착지점으로 만들면서 그 사본이 둘이 됐다.
 *
 * **OWNER는 설정 화면으로 보낸다** — 거기에 [다시 시도]와 워크플로 YAML이 있어 스스로 끝낼 수 있다.
 * EDITOR는 그 화면에 들어갈 수 없으므로 보낼 곳이 없고, 한 줄로 무엇을 기다리는지 말한다.
 *
 * ⚠️ **`redirect()`가 렌더 중에 던지는 것이 안전한 이유**: 호출부가 이 컴포넌트 **하나만** 반환하고
 * 그 시점에 프로젝트 데이터는 아직 페이로드에 없다. 인가 차단과는 다른 축이다 — 그쪽은 최상단
 * `requireProjectAccess`가 이미 지났다 (ARCHITECTURE §6.1).
 */
export function ProjectNotReady({ slug, role }: { slug: string; role: Role }) {
  if (canPerform(role, "project:settings")) redirect(routes.settings(slug));
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
          icon={Languages}
          title={m.translations.empty.notReady}
          description={m.errors.onboarding["not-ready"]}
        />
      </div>
    </PanelBody>
  );
}
