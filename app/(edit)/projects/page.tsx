import Link from "next/link";

import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { APP_ACCOUNT_PROVIDER } from "@/lib/github-connect/account-link";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { planProjectReadiness, readinessLabel } from "@/lib/onboarding/readiness";
import { DisconnectGithubButton } from "@/components/github-account";

/**
 * 내 프로젝트 목록. **로그인 후 착지점**이고, 인가 거부의 redirect 목적지다.
 *
 * ⚠️ **`requireProjectAccess`를 지나지 않는다 — 지날 대상이 없다.** 이 화면은 특정 프로젝트가
 * 아니라 "내 멤버십"을 보여주므로 인가 단위가 사용자다. 그래서 `requireUser`가 쓰인다.
 *
 * 조회는 **`userId`로 좁힌다** — 그 컬럼에 단독 인덱스를 두지 않은 이유는 SAAS §8 7단계의 고정
 * 제한(사용자당 프로젝트 3 · 프로젝트당 멤버 10)이 이 테이블을 수십 행으로 묶기 때문이다
 * (ARCHITECTURE §5.1).
 */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { userId } = await requireUser();
  // `requireProjectAccess`가 거부 사유를 `?e=`로 넘긴다. 주소창 값이라 판정 함수로 거른다 — 모르는 값은 무시.
  //
  // ⚠️ **GitHub 연결 실패도 여기로 온다.** state가 무효면 돌아갈 slug를 믿을 수 없어 callback이
  // 이 화면으로 보낸다 (design §3.5). `isAccessError` 하나만 보면 그 사유가 **통째로 무음**이고,
  // 사용자에게는 버튼이 안 눌린 것으로 보인다 (POSTMORTEM 2026-09-06). 두 union은 `unavailable`
  // 하나만 겹치고 뜻이 같으므로 먼저 보는 쪽이 이겨도 문제가 없다.
  const { e } = await searchParams;
  const message = isAccessError(e)
    ? accessErrorMessage(e)
    : isConnectError(e)
      ? connectErrorMessage(e)
      : null;
  const notice = message === null ? null : <p className="text-destructive text-sm">{message}</p>;

  const prisma = getPrisma();
  /**
   * ⚠️ **GitHub 계정 섹션이 여기 있는 이유** (2026-09-07 리뷰 🟡9): 연결은 사용자 수준으로 열려 있어
   * **프로젝트를 하나도 안 만든 사용자**가 연결만 하고 남을 수 있는데, 그 사람에게는 설정 화면이
   * 없어 해제에 도달할 길이 없었다 — `taken-by-other`가 영구 잠금이 된다 (SAAS §5.5).
   *
   * **핸들을 위해 GitHub을 부르지 않는다.** 이 화면은 로그인 후 착지점이라 매 렌더에 왕복을 붙일
   * 자리가 아니고, `@login`이 필요하면 설정 화면이 보인다. 여기서는 **행의 존재만** 읽는다.
   *
   * 조회는 `userId`로 좁힌다 — `Account`는 프로젝트가 아니라 사용자에 속한 테이블이다
   * (POSTMORTEM 2026-09-06이 넓힌 규칙).
   */
  const [memberships, connection] = await Promise.all([
    loadMemberships(prisma, userId),
    prisma.account.findFirst({
      where: { userId, provider: APP_ACCOUNT_PROVIDER },
      select: { providerAccountId: true },
    }),
  ]);

  const account =
    connection === null ? null : (
      <section className="border-border space-y-2 rounded-md border p-4">
        <h2 className="text-sm font-medium">GitHub 계정</h2>
        <div className="flex items-center gap-3">
          <p className="text-muted-foreground text-xs">연결돼 있어요.</p>
          <DisconnectGithubButton />
        </div>
      </section>
    );

  if (memberships.length === 0) {
    return (
      <main className="mx-auto max-w-2xl space-y-2 p-8">
        {notice}
        <p className="text-sm">아직 프로젝트가 없어요.</p>
        <p className="text-muted-foreground text-xs">
          리포를 붙여 만들거나, 초대 링크를 받으면 그 링크를 열어 수락해 주세요.
        </p>
        {/* 빈 상태에도 primary 버튼을 둔다 — 여기가 유일한 다음 행동이다 */}
        <p className="pt-2">
          <NewProjectLink />
        </p>
        {account !== null && <div className="pt-4">{account}</div>}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8">
      {notice}
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-sm font-medium">내 프로젝트</h1>
        <NewProjectLink />
      </div>
      <ul className="divide-border border-border divide-y rounded-md border">
        {memberships.map((m) => (
          <li key={m.project.slug}>
            <Link
              href={`/projects/${m.project.slug}/translations`}
              className="hover:bg-accent flex items-baseline gap-2 px-3 py-2"
            >
              <span className="text-sm">{m.project.name}</span>
              {/* slug는 주소라 mono다 (docs/DESIGN.md §4.1) — 역할 이름은 산문 쪽이다 */}
              {/* text-xs를 겹치지 않는다 — 정적 문자열은 twMerge를 안 지나 text-xs가 이긴다 (DESIGN §4.2) */}
              <span className="text-mono text-muted-foreground">{m.project.slug}</span>
              {/* 상태는 오류가 아니라 진행 중이므로 raw 색을 늘리지 않는다 (DESIGN §6.2) */}
              <span className="text-muted-foreground ml-auto text-xs">
                {[readinessLabel(planProjectReadiness(m.project)), m.role === "OWNER" ? "소유자" : "편집자"]
                  .filter((part) => part !== null)
                  .join(" · ")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {account}
    </main>
  );
}

function loadMemberships(prisma: ReturnType<typeof getPrisma>, userId: string) {
  return prisma.projectMember.findMany({
    where: { userId },
    // 상태 텍스트의 재료 둘 — `planProjectReadiness`가 컬럼을 만들지 않고 이것으로 판정한다 (design §3.7).
    select: {
      role: true,
      project: { select: { slug: true, name: true, installationId: true, lastCommitSha: true } },
    },
    orderBy: { project: { name: "asc" } },
  });
}

/** DESIGN §6.4 primary 버튼. 링크지만 주 행동이라 버튼 모양이다. */
function NewProjectLink() {
  return (
    <Link
      href="/projects/new"
      className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-block rounded-md px-4 py-2 text-sm font-medium focus-visible:ring-[3px] focus-visible:outline-none"
    >
      새 프로젝트
    </Link>
  );
}
