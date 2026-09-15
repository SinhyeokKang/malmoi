import { ProjectList } from "@/components/projects/project-list";
import { ContentPanel } from "@/components/shell/content-panel";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { loadProjectList } from "@/lib/keys/query";
import { firstQueryValues, type Raw } from "@/lib/search-params";

import { NewProjectModal } from "../new-project-modal";

/**
 * 직접 진입·새로고침·OAuth 복귀에는 유지할 배경이 없으므로 목록도 함께 만든다.
 * 클라이언트 네비게이션은 @modal/(.)new가 맡고, 이 경로는 검색을 복원할 딥링크로 남긴다.
 */
export const maxDuration = 60;

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<Raw<"e" | "q">>;
}) {
  const { userId } = await requireUser();
  const { e, q } = firstQueryValues(await searchParams);
  const view = await loadProjectList(getPrisma(), userId);

  return (
    <ContentPanel>
      <ProjectList all={view.rows} q={q} />
      <NewProjectModal initialError={e} backQuery={{ q }} closeMode="list" />
    </ContentPanel>
  );
}
