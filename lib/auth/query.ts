import type { PrismaClient } from "@/generated/prisma/client";

import { planProjectAccess, type ProjectAccess } from "./access";
import type { Permission, Role } from "./permission";

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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 멤버 화면의 조회 둘 (6b-2 — translation-ui design §3.9).
 *
 * ⚠️ **둘 다 `projectId`로만 좁힌다** — 인가는 호출부(`requireProjectAccess`)가 이미 지났고, 여기
 * 넘어오는 `projectId`는 그 판정의 산출물이다. `slug`로 다시 찾지 않는 이유는 그렇게 하면 인가된
 * 프로젝트와 조회하는 프로젝트가 갈릴 수 있기 때문이다.
 *
 * ⚠️ **`prisma`를 주입받고 `server-only`를 붙이지 않는다** — 위 `getProjectAccess`와 같은 이유다
 * (테스트가 메모리 DB로 직접 부른다).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type MemberView = {
  userId: string;
  /** Google 계정엔 핸들이 없다 — 이름이 비면 화면이 마스킹한 이메일로 대신한다. */
  name: string | null;
  email: string | null;
  role: Role;
  joinedAt: Date;
};

/** 가입 순서. 목록이 렌더마다 흔들리면 사용자가 행을 근육 기억으로 못 찾는다 (`loadMemberships`와 같은 이유). */
export async function loadMembers(prisma: PrismaClient, projectId: string): Promise<MemberView[]> {
  const rows = await prisma.projectMember.findMany({
    where: { projectId },
    select: { userId: true, role: true, createdAt: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    userId: r.userId,
    name: r.user?.name ?? null,
    email: r.user?.email ?? null,
    role: r.role,
    joinedAt: r.createdAt,
  }));
}

export type PendingInvitation = {
  id: string;
  email: string;
  role: Role;
  expiresAt: Date;
  invitedByName: string | null;
};

/**
 * 아직 쓸 수 있는 초대만. **술어가 둘이다** — `acceptedAt IS NULL AND expiresAt > now()`.
 *
 * ⚠️ **수락된 행을 지우지 않는 설계**(`prisma/schema.prisma`의 `acceptedAt` 주석)라 그 행이 여기
 * 남아 있다. 한쪽 조건만 보면 이미 멤버가 된 사람의 초대가 "대기 중"으로 보이고, OWNER가 없는
 * 링크를 기다린다.
 *
 * @param now 호출부가 넘긴다 — 판정 시각을 함수 안에서 읽으면 테스트가 그 경계를 못 만든다.
 */
export async function loadPendingInvitations(
  prisma: PrismaClient,
  projectId: string,
  now: Date,
): Promise<PendingInvitation[]> {
  const rows = await prisma.projectInvitation.findMany({
    where: { projectId, acceptedAt: null, expiresAt: { gt: now } },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      invitedByUser: { select: { name: true } },
    },
    // 이메일 오름차순 — `createdAt`을 쓰면 같은 이메일의 회전 이력이 순서를 흔든다.
    orderBy: { email: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    expiresAt: r.expiresAt,
    invitedByName: r.invitedByUser?.name ?? null,
  }));
}
