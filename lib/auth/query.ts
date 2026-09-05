import type { PrismaClient } from "@/generated/prisma/client";

import { planProjectAccess, type ProjectAccess } from "./access";
import type { Permission } from "./permission";

/**
 * 인가 조회 껍데기. **판정은 하지 않는다** — `planProjectAccess`가 한다 (design §3).
 *
 * `server-only`를 붙이지 않는다: 테스트가 이 모듈을 직접 import해 메모리 DB로 두 조회를 검사한다
 * (`lib/env.ts`와 같은 예외 — 그 패키지는 `react-server` 조건 밖에서 던져 vitest를 죽인다).
 * 세션을 읽는 쪽(`lib/auth/session.ts`)이 `server-only`를 든다.
 *
 * **prisma를 주입받는다** — `triggerPull(prisma, slug)`·`loadKeys(prisma, projectId)`와 같은 형태다.
 */
export async function getProjectAccess(
  prisma: PrismaClient,
  input: { userId: string; slug: string; permission: Permission },
): Promise<ProjectAccess> {
  const project = await prisma.project.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  // ⚠️ 프로젝트가 없는 것과 멤버가 아닌 것을 **같은 not-found로 접는다** (SAAS §7.7) —
  // 둘을 404/403으로 가르면 남의 프로젝트 존재 여부가 샌다. 여기서 일찍 반환하는 이유는
  // 그 판정이 아니라 **헛된 왕복을 만들지 않으려는 것**이다.
  if (project === null) return { status: "not-found" };

  // ⚠️ **projectId로 좁힌다.** userId만으로 조회하면 남의 프로젝트 멤버십이 걸려 나오고,
  // 그 role로 이 프로젝트의 권한을 판정하게 된다 (CLAUDE.md 테넌트 규칙).
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: input.userId } },
    select: { projectId: true, role: true },
  });

  return planProjectAccess({ member, permission: input.permission });
}
