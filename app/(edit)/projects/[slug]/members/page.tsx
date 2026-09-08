import { redirect } from "next/navigation";

import { InviteDialog } from "@/components/members/invite-dialog";
import { MemberList } from "@/components/members/member-list";
import { PendingInvitations } from "@/components/members/pending-invitations";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { canPerform } from "@/lib/auth/permission";
import { loadMembers, loadPendingInvitations } from "@/lib/auth/query";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 멤버 관리 (6b-2 — design §3.9 · user-stories §5).
 *
 * ⚠️ **게이트가 `translation:write`다, `member:manage`가 아니다.** EDITOR도 목록을 본다 — "누가 이
 * 프로젝트에 있나"는 번역자에게도 필요한 정보이고, user-stories §5가 그렇게 결정했다. 컨트롤만
 * 역할로 갈리고 **판정은 Action이 `member:manage`로** 한다. 이것이 별도 라우트를 만든 실제 이유다:
 * `/settings`는 `project:settings` 뒤라 EDITOR가 아예 못 들어온다 (spec §2.3).
 *
 * ⚠️ **최상단에서 던진다.** 조건부 렌더는 차단이 아니다 — App Router가 레이아웃과 페이지를 병렬로
 * 렌더해 페이지가 이미 실행되고 RSC 페이로드에 데이터가 실린다 (POSTMORTEM 2026-08-31, 실측 1.3MB).
 */
export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const { slug } = await params;
  const { projectId, role, userId } = await requireProjectAccess({ slug, permission: "translation:write" });

  /**
   * ⚠️ **`?e=`를 판정 함수로 거른다 — 캐스팅하지 않는다.** 주소창 값이라 union이 아니고,
   * `as AccessError`로 넘기면 프로토타입 키(`?e=constructor`)가 사전에서 **함수**를 찾아내 JSX
   * 자식이 된다 — 화면이 통째로 죽는다 (POSTMORTEM 2026-09-08). 모르는 값은 무시한다.
   */
  const { e } = await searchParams;
  const notice = isAccessError(e) ? accessErrorMessage(e) : null;

  const prisma = getPrisma();
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
  // 인가는 지났는데 행이 없다 — 그 사이에 지워진 경우다. 문구가 존재 여부를 말하지 않는 곳으로 보낸다.
  if (project === null) redirect(`${routes.projects()}?e=not-found`);

  /**
   * ⚠️ **기준 시각을 서버에서 한 번 만들어 내려보낸다.** 두 표가 각자 `new Date()`를 부르면 상대
   * 시각의 기준이 갈리고, 클라이언트에서 부르면 hydration 불일치가 된다.
   */
  const now = new Date();
  const [members, pending] = await Promise.all([
    loadMembers(prisma, projectId),
    loadPendingInvitations(prisma, projectId, now),
  ]);

  return (
    <>
      {/* 페이지 수준 거부는 global Alert다 — top bar 아래 전폭 (DESIGN §6.4). */}
      {notice !== null && (
        <div className="px-6 pt-6">
          <Alert variant="danger">{notice}</Alert>
        </div>
      )}
      <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-6">
        {/* breadcrumb은 셸이 안 든다 — 레이아웃이 페이지 props를 못 받는다 (CLAUDE.md). */}
        <div className="space-y-3">
          <Breadcrumb
            items={[{ label: project.name, href: routes.translations(slug) }, { label: m.members.title }]}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-base font-medium">{m.members.title}</h1>
            {canPerform(role, "member:manage") && <InviteDialog slug={slug} />}
          </div>
        </div>

        <MemberList slug={slug} members={members} role={role} viewerId={userId} now={now} />

        <section className="space-y-3">
          <h2 className="text-sm font-medium">{m.members.pending.title}</h2>
          <PendingInvitations slug={slug} invitations={pending} role={role} now={now} />
        </section>
      </main>
    </>
  );
}
