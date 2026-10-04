import { FileQuestionMark } from "lucide-react";

import { PanelBody } from "@/components/shell/content-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { getMessages } from "@/lib/i18n/server";
import { routes } from "@/lib/routes";

/**
 * 표면을 잃은 갈래의 경계 (audit #16) — `requireSurfaceAccess`가 없는·보관된 표면에 `notFound()`를 던진다. **표면 문장은
 * 이 경계와 옛 `/translations`(기본 표면을 잃은 갈래 — 같은 파일을 다시 내보낸다)만 든다** — 프로젝트 세그먼트의 not-found에
 * 두면 그 아래 모든 `notFound()`(Sources 조회 실패 등)가 표면 이야기를 한다.
 */
export default async function NotFound() {
  const m = await getMessages();
  /* 세로 중앙은 `flex-1`이 든다 — `ProjectArchived`와 같은 형(malmoi#162). `ContentPanel`은 `[slug]/layout`이 이미 든다. */
  return <PanelBody className="flex flex-col"><div className="flex flex-1 items-center justify-center">
    <EmptyState icon={FileQuestionMark} title={m.surfaces.missingTitle} description={m.surfaces.missingDescription}
      action={<ButtonLink href={routes.projects()}>{m.surfaces.projects}</ButtonLink>} />
  </div></PanelBody>;
}
