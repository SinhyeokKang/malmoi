import { decodeUser, decodeInvitation, readable } from "@/lib/credentials/records";
import { validatePiiReadKeys } from "@/lib/credentials/storage";
import { m } from "@/lib/i18n";
import type { PrismaClient } from "@/generated/prisma/client";

import { planProjectAccess, type ProjectAccess } from "./access";
import { maskedEmailLabels } from "./invite-label";
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
    // ⚠️ **`archivedAt`이 여기 있어야 한다** — 판정이 `planProjectAccess` 한 자리이므로 그 입력을
    // 이 조회가 든다. 호출부가 따로 읽으면 진입점마다 왕복이 하나씩 늘고 조건이 갈린다.
    select: { id: true, archivedAt: true },
  });
  // ⚠️ 프로젝트가 없는 것과 멤버가 아닌 것을 **같은 not-found로 접는다** (PRODUCT §7.7) —
  // 둘을 404/403으로 가르면 남의 프로젝트 존재 여부가 샌다. 여기서 일찍 반환하는 이유는
  // 그 판정이 아니라 **헛된 왕복을 만들지 않으려는 것**이다.
  if (project === null) return { status: "not-found" };

  // ⚠️ **projectId로 좁힌다.** userId만으로 조회하면 남의 프로젝트 멤버십이 걸려 나오고,
  // 그 role로 이 프로젝트의 권한을 판정하게 된다 (CLAUDE.md 테넌트 규칙).
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: input.userId } },
    select: { projectId: true, role: true },
  });

  return planProjectAccess({ member, permission: input.permission, archivedAt: project.archivedAt });
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
  /**
   * ⚠️ **원문이 아니라 마스킹 라벨이다** (2026-09-09, sec-audit 발견 4). 이 값이 `"use client"`
   * 컴포넌트 props로 넘어가 **RSC 페이로드에 실리므로**, 클라이언트에서 가리는 것은 화장품이다 —
   * 관측자는 그 프로젝트의 EDITOR 이상이고 view-source로 읽는다. 안 읽는 것이 안 새는 것이다.
   */
  emailLabel: string | null;
  role: Role;
  joinedAt: Date;
};

/** 가입 순서. 목록이 렌더마다 흔들리면 사용자가 행을 근육 기억으로 못 찾는다 (`loadMemberships`와 같은 이유). */
export async function loadMembers(prisma: PrismaClient, projectId: string): Promise<MemberView[]> {
  const storedRows = await prisma.projectMember.findMany({
    where: { projectId },
    // ⚠️ `email`을 **읽되 돌려주지 않는다** — 가리려면 원문이 필요하고, 나가면 안 되는 것은 반환값이다.
    select: { userId: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true, emailLookup: true } } },
    orderBy: { createdAt: "asc" },
  });
  /**
   * ⚠️ **키 부재(장애)를 먼저 거른다.** 이 검사가 없으면 아래의 행 단위 폴백이 그것을 삼켜
   * "전원 정보 없음"으로 보인다 — 그건 정상 화면과 바이트 단위로 구별되지 않는다.
   */
  validatePiiReadKeys();
  /**
   * ⚠️ **행 하나가 못 열려도 목록은 산다.** 전환 중에는 부분 변환이 정상이고(backfill이 행 단위
   * CAS다), 키 회전 뒤 옛 세대도 남는다. 던지면 멤버 아홉이 멀쩡한데 화면이 통째로 500이다.
   */
  const rows = storedRows.map((r) => ({ ...r, user: r.user === null ? null : readable(() => decodeUser(r.user!)) }));
  // 라벨은 **목록 전체를 보고** 만든다 — 행마다 따로 만들면 같은 도메인의 두 주소가 같은 라벨이 된다.
  const labels = maskedEmailLabels(rows.map((r) => r.user?.email ?? ""));
  return rows.map((r, i) => ({
    userId: r.userId,
    // 못 읽은 행은 이름도 못 읽는다 — 옛 값을 그럴듯하게 보여줄 자리가 없다.
    name: r.user?.name ?? null,
    emailLabel: storedRows[i]?.user !== null && r.user === null
      ? m.common.unreadable
      : r.user?.email ? (labels[i] ?? null) : null,
    role: r.role,
    joinedAt: r.createdAt,
  }));
}

export type PendingInvitation = {
  id: string;
  /** ⚠️ **마스킹 라벨이다** — `MemberView.emailLabel`과 같은 이유이고, 여기가 더 민감하다(발견 4). */
  emailLabel: string;
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
  const storedRows = await prisma.projectInvitation.findMany({
    where: { projectId, acceptedAt: null, expiresAt: { gt: now } },
    select: {
      id: true,
      email: true,
      emailLookup: true,
      projectId: true,
      role: true,
      expiresAt: true,
      invitedByUser: { select: { id: true, name: true } },
    },
    /**
     * ⚠️ **정렬 키가 DB에 없다** — 이메일이 암호문이라 `orderBy: { email }`이 봉투 바이트를 정렬한다.
     * `id`는 조회를 결정적으로 만드는 용도뿐이고 **표시 순서는 복호화 뒤 메모리에서** 정한다
     * (이메일 오름차순 — `createdAt`을 쓰면 같은 이메일의 회전 이력이 순서를 흔든다).
     * 대기 초대는 프로젝트당 소수라 전량 로드가 성립한다; 페이지네이션이 붙으면 이 전제가 깨진다.
     */
    orderBy: { id: "asc" },
  });
  validatePiiReadKeys();
  /**
   * ⚠️ **못 읽은 초대는 맨 뒤다.** 정렬 키가 그 이메일인데 그것이 없으므로, 앞에 끼우면 읽을 수 있는
   * 행들의 순서가 손상 하나에 흔들린다. 그 안에서는 `id`로 갈라 결정적이다.
   */
  const rows = storedRows
    .map((r) => ({ ...r, decoded: readable(() => decodeInvitation(r)), invitedByUser: r.invitedByUser === null ? null : readable(() => decodeUser(r.invitedByUser!)) }))
    .sort((a, b) => {
      if ((a.decoded === null) !== (b.decoded === null)) return a.decoded === null ? 1 : -1;
      const ae = a.decoded?.email ?? "", be = b.decoded?.email ?? "";
      return ae < be ? -1 : ae > be ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  const labels = maskedEmailLabels(rows.map((r) => r.decoded?.email ?? ""));
  return rows.map((r, i) => ({
    id: r.id,
    emailLabel: r.decoded === null ? m.common.unreadable : (labels[i] ?? ""),
    role: r.role,
    expiresAt: r.expiresAt,
    invitedByName: r.invitedByUser?.name ?? null,
  }));
}
