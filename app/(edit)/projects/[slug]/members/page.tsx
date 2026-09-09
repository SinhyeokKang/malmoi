import { redirect } from "next/navigation";

import { InviteDialog } from "@/components/members/invite-dialog";
import { MemberList } from "@/components/members/member-list";
import { PendingInvitations } from "@/components/members/pending-invitations";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { maskedInviteLabels } from "@/lib/auth/invite-label";
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
 *
 * ⚠️ **`?e=` 슬롯이 없다.** design §3.9가 "global Alert 슬롯이 와이어에 있어야 한다"고 요구했지만
 * **그 쿼리를 보내는 자리를 설계가 만들지 않았다** — `requireProjectAccess`의 거부는 `/projects?e=`로
 * 가고, `changeMember`·`revokeInvitation`의 실패는 **행 옆 인라인**이다(어느 행이 거부됐는지가
 * 정보이므로 상단으로 올리면 그것을 잃는다). 읽는 쪽만 두면 도달 불가 코드이고, 그것을 두지 않는
 * 것이 이 리포의 규칙이다 (2026-09-08 code-review 🟡1). 생산자가 생기면 **둘을 같은 커밋에** 넣는다 —
 * `components/__tests__/members-screen.test.ts`가 그 짝을 강제한다.
 */
export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { projectId, role, userId } = await requireProjectAccess({ slug, permission: "translation:write" });

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
          <PendingInvitations
            slug={slug}
            invitations={pending}
            labels={maskedInviteLabels(pending.map((i) => i.email))}
            role={role}
            now={now}
          />
      </section>
    </main>
  );
}
