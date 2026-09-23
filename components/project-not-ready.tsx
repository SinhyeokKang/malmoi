import { Languages } from "lucide-react";
import { redirect } from "next/navigation";

import { PanelBody } from "@/components/shell/content-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { canPerform, type Role } from "@/lib/auth/permission";
import { m } from "@/lib/i18n";
import type { ProjectReadiness } from "@/lib/onboarding/readiness";
import { routes } from "@/lib/routes";

/**
 * 첫 적재 전 프로젝트 화면 (PRODUCT §7.5). **정책과 문구를 한 곳이 든다** — Home과 번역 화면이
 * 같은 갈래를 만나고, 6b-6이 Home을 착지점으로 만들면서 그 사본이 둘이 됐다.
 *
 * **OWNER는 끝낼 수 있는 자리로 보낸다** — 연결 전(`setup`)은 설정 화면(리포 연결), 첫 적재 전
 * (`awaiting_first_sync`)은 Sources(표면별 사유와 [Run first import] — audit #6: 전엔 이것도 설정 화면이었고
 * 거기엔 재시도가 없었다). EDITOR는 둘 다 들어가도 할 일이 없으므로 한 줄로 무엇을 기다리는지 말한다.
 *
 * ⚠️ **`redirect()`가 렌더 중에 던지는 것이 안전한 이유**: 호출부가 이 컴포넌트 **하나만** 반환하고
 * 그 시점에 프로젝트 데이터는 아직 페이로드에 없다. 인가 차단과는 다른 축이다 — 그쪽은 최상단
 * `requireProjectAccess`가 이미 지났다 (ARCHITECTURE §6.1).
 */
export function ProjectNotReady({ slug, role, readiness }: { slug: string; role: Role; readiness: Exclude<ProjectReadiness, "ready"> }) {
  if (canPerform(role, "project:settings")) redirect(readiness === "setup" ? routes.settings(slug) : routes.sources(slug));
  return (
    /*
      ⚠️ **`PanelHeader`가 없다 — 이 갈래엔 제목이 없다.** 본문만 있으므로 `PanelBody` 하나이고,
      여백과 폭 등급은 **프리미티브가 든다** — 여기서 다시 주면 두 번 적용된다.
    */
    <PanelBody className="flex flex-col">
      {/*
        ⚠️ **세로 중앙은 `flex-1`이 든다** (DESIGN §6.4 — 번역 화면 빈 상태 넷과 같은 형). 위에 붙여
        두면 1080 화면에서 문구가 한 줄로 떠 있고 그 아래가 통째로 빈다. `EmptyState`가 수직 중앙을
        안 하므로(표 안에서도 쓰인다) 이 자리가 그것을 잡는 유일한 곳이다.
      */}
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={Languages}
          title={m.translations.empty.notReady}
          description={m.errors.onboarding["not-ready"]}
        />
      </div>
    </PanelBody>
  );
}
