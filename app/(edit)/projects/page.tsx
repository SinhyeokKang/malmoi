import { FolderGit2, Plus } from "lucide-react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { loadMemberships } from "@/lib/keys/query";
import { planProjectReadiness, readinessLabel } from "@/lib/onboarding/readiness";
import { routes } from "@/lib/routes";

/**
 * 내 프로젝트 목록. **로그인 후 착지점**이고, 인가 거부의 redirect 목적지다.
 *
 * ⚠️ **`requireProjectAccess`를 지나지 않는다 — 지날 대상이 없다.** 이 화면은 특정 프로젝트가
 * 아니라 "내 멤버십"을 보여주므로 인가 단위가 사용자다. 그래서 `requireUser`가 쓰인다.
 */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { userId } = await requireUser();
  /**
   * `requireProjectAccess`가 거부 사유를 `?e=`로 넘긴다. 주소창 값이라 판정 함수로 거른다 — 모르는 값은 무시.
   *
   * ⚠️ **GitHub 연결 실패도 여기로 온다.** state가 무효면 돌아갈 slug를 믿을 수 없어 callback이
   * 이 화면으로 보낸다 (design §3.5). `isAccessError` 하나만 보면 그 사유가 **통째로 무음**이고,
   * 사용자에게는 버튼이 안 눌린 것으로 보인다 (POSTMORTEM 2026-09-06). 두 union은 `unavailable`
   * 하나만 겹치고 뜻이 같으므로 먼저 보는 쪽이 이겨도 문제가 없다.
   */
  const { e } = await searchParams;
  const message = isAccessError(e)
    ? accessErrorMessage(e)
    : isConnectError(e)
      ? connectErrorMessage(e)
      : null;

  /**
   * ⚠️ **GitHub 계정 섹션이 2026-09-09에 `/account`로 갔다** (6b-4 — SAAS §7.7). 그것이 여기 있었던
   * 이유는 "프로젝트를 하나도 안 만든 사용자에게 도달 가능한 자리가 여기뿐"이어서였고(2026-09-07
   * 리뷰 🟡9), 사용자 축 라우트가 생기면서 그 이유가 사라졌다. **옮긴 것이지 복제가 아니다** —
   * 두 자리에 두면 하나가 낡는다 (6b-2가 초대 폼을 지운 근거와 같다).
   */
  const memberships = await loadMemberships(getPrisma(), userId);

  return (
    <>
      {/* 페이지 수준 거부는 **global Alert**다 — top bar 아래 전폭 (DESIGN §6.4). */}
      {message !== null && (
        <div className="px-6 pt-6">
          <Alert variant="danger">{message}</Alert>
        </div>
      )}
      <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-6">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-base font-medium">{m.projects.title}</h1>
          <ButtonLink variant="primary" href={routes.newProject()}>
            <Plus aria-hidden />
            {m.common.nav.newProject}
          </ButtonLink>
        </div>

        {memberships.length === 0 ? (
          <EmptyState
            icon={FolderGit2}
            title={m.projects.empty.title}
            description={m.projects.empty.description}
            action={
              <ButtonLink variant="primary" href={routes.newProject()}>
            <Plus aria-hidden />
            {m.common.nav.newProject}
          </ButtonLink>
            }
          />
        ) : (
          <ul className="divide-border border-border divide-y rounded-lg border">
            {memberships.map((membership) => {
              const status = readinessLabel(planProjectReadiness(membership));
              return (
                <li key={membership.slug}>
                  <Link
                    href={routes.project(membership.slug)}
                    className="hover:bg-muted/40 focus-visible:ring-ring flex items-baseline gap-2 px-4 py-3 focus-visible:ring-[3px] focus-visible:outline-none"
                  >
                    <span className="text-sm font-medium">{membership.name}</span>
                    {/* slug는 주소라 mono다 — `text-xs`를 겹치지 않는다 (DESIGN §4.1·§4.2) */}
                    <span className="text-mono text-muted-foreground">{membership.slug}</span>
                    <span className="ml-auto flex items-baseline gap-2">
                      {/* 상태는 오류가 아니라 진행 중이다 — raw 색을 늘리지 않는다 (DESIGN §6.2) */}
                      {status !== null && <Badge>{status}</Badge>}
                      <span className="text-muted-foreground text-xs">{m.projects.role[membership.role]}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
