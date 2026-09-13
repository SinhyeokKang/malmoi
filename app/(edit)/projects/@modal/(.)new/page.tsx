import { requireUser } from "@/lib/auth/session";
import { firstQueryValues, type Raw } from "@/lib/search-params";

import { NewProjectModal } from "../../new-project-modal";

// 인터셉트에서 호출하는 첫 적재 Action도 기존 페이지와 같은 실행 예산을 받아야 한다.
export const maxDuration = 60;

export default async function InterceptedNewProjectPage({ searchParams }: {
  searchParams: Promise<Raw<"e" | "q">>;
}) {
  await requireUser();
  const { e, q } = firstQueryValues(await searchParams);
  // children 슬롯의 기존 목록을 유지한다 — 여기서 배경을 다시 조회하면 인터셉트의 이점이 사라진다.
  return <NewProjectModal initialError={e} backQuery={{ q }} closeMode="back" />;
}
