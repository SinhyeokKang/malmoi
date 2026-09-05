import Link from "next/link";

import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";

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
  // `requireProjectAccess`가 거부 사유를 `?e=`로 넘긴다. 주소창 값이라 `isAccessError`로 거른다 — 모르는 값은 무시.
  const { e } = await searchParams;
  const notice = isAccessError(e) ? <p className="text-destructive text-sm">{accessErrorMessage(e)}</p> : null;

  const memberships = await getPrisma().projectMember.findMany({
    where: { userId },
    select: { role: true, project: { select: { slug: true, name: true } } },
    orderBy: { project: { name: "asc" } },
  });

  if (memberships.length === 0) {
    return (
      <main className="mx-auto max-w-2xl space-y-2 p-8">
        {notice}
        <p className="text-sm">어느 프로젝트의 멤버도 아니에요.</p>
        <p className="text-muted-foreground text-xs">
          초대 링크를 받으면 그 링크를 열어 수락해 주세요.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8">
      {notice}
      <h1 className="text-sm font-medium">내 프로젝트</h1>
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
              <span className="text-muted-foreground ml-auto text-xs">
                {m.role === "OWNER" ? "소유자" : "편집자"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
