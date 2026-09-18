import { redirect } from "next/navigation";

import { ProjectArchived } from "@/components/project-archived";
import { InviteDialog } from "@/components/members/invite-dialog";
import { MemberList } from "@/components/members/member-list";
import { PendingInvitations } from "@/components/members/pending-invitations";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { canPerform } from "@/lib/auth/permission";
import { loadMembers, loadPendingInvitations } from "@/lib/auth/query";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 멤버 관리 (6b-2 — DESIGN §6.65 · user-stories §5).
 *
 * ⚠️ **게이트가 `translation:write`다, `member:manage`가 아니다.** EDITOR도 목록을 본다 — "누가 이
 * 프로젝트에 있나"는 번역자에게도 필요한 정보이고, user-stories §5가 그렇게 결정했다. 컨트롤만
 * 역할로 갈리고 **판정은 Action이 `member:manage`로** 한다. 이것이 별도 라우트를 만든 실제 이유다:
 * `/settings`는 `project:settings` 뒤라 EDITOR가 아예 못 들어온다 (PRODUCT §3).
 *
 * ⚠️ **최상단에서 던진다.** 조건부 렌더는 차단이 아니다 — App Router가 레이아웃과 페이지를 병렬로
 * 렌더해 페이지가 이미 실행되고 RSC 페이로드에 데이터가 실린다 (POSTMORTEM 2026-08-31, 실측 1.3MB).
 *
 * ⚠️ **`?e=` 슬롯이 없다.** 옛 기능 문서가 "global Alert 슬롯이 와이어에 있어야 한다"고 요구했지만
 * **그 쿼리를 보내는 자리를 설계가 만들지 않았다** — `requireProjectAccess`의 거부는 `/projects?e=`로
 * 가고, `changeMember`·`revokeInvitation`의 실패는 **행 옆 인라인**이다(어느 행이 거부됐는지가
 * 정보이므로 상단으로 올리면 그것을 잃는다). 읽는 쪽만 두면 도달 불가 코드이고, 그것을 두지 않는
 * 것이 이 리포의 규칙이다 (2026-09-08 code-review 🟡1). 생산자가 생기면 **둘을 같은 커밋에** 넣는다 —
 * `components/__tests__/members-screen.test.ts`가 그 짝을 강제한다.
 */
export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { projectId, role, userId, archived } = await requireProjectAccess({ slug, permission: "translation:write" });
  if (archived) return <ProjectArchived slug={slug} role={role} />;

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
      {/*
        ⚠️ **머리와 본문이 형제다** — 머리는 고정, 본문만 스크롤한다 (`content-panel.tsx`).
        여백·폭 등급·머리 아래 선은 **프리미티브가 든다**(기본 등급이 `limited` = `max-w-4xl`) —
        화면이 다시 정하면 그 값이 두 번 적용된다.
      */}
      <PanelHeader>
        {/* ⚠️ **breadcrumb이 없다** (8-4 spec Q5) — 프로젝트 하위 화면 다섯에서 함께 지웠다.
            위로 가는 길은 사이드바가 든다(프로젝트 구역 여섯이 항상 보인다). */}
        {/* 초대 버튼이 제목 행 우측이다 — 머리에 붙어 있으므로 본문과 함께 스크롤하지 않는다. */}
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
          <h1 id="members-heading" tabIndex={-1} className="text-lg font-medium outline-none">{m.common.nav.members}</h1>
          {canPerform(role, "member:manage") && <InviteDialog slug={slug} />}
        </div>
      </PanelHeader>

      <PanelBody className="space-y-6">
        <MemberList slug={slug} members={members} role={role} viewerId={userId} now={now} headingId="members-heading" />

        <section className="space-y-3">
          <h2 id="pending-heading" tabIndex={-1} className="text-sm font-medium outline-none">{m.members.pending.title}</h2>
          <PendingInvitations slug={slug} invitations={pending} role={role} now={now} headingId="pending-heading" />
        </section>
      </PanelBody>
    </>
  );
}
