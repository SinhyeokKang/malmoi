import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { maskEmail } from "@/lib/auth/email";
import { hashInviteToken } from "@/lib/auth/invitation";
import type { Role } from "@/lib/auth/permission";
import { findUserByEmail } from "@/lib/credentials/access";
import { decodeInvitation, encodeInvitationEmail, readable } from "@/lib/credentials/records";
import { lookupEmail } from "@/lib/credentials/storage";
import { recordEvent } from "@/lib/events/record";

import { PROJECT_WINDOW_MS } from "./limits";
import { planInvitationIssue, type IssuePlan, type IssueTarget } from "./plan";

/**
 * 초대 발급·재발급의 DB 쪽 (design §3). **메일을 보내지 않는다** — 발송은 commit 뒤 호출부가 한다.
 *
 * ⚠️ **판정 입력을 전부 `Project` 잠금 안에서 읽는다.** 밖에서 세면 동시 요청이 마지막 한도 자리와
 * 같은 주소의 60초를 둘 다 통과한다 — 기존 `createInvitation`·`changeMember`와 같은 잠금이다.
 *
 * DB 오류는 던진다(트랜잭션 전체 롤백). 교착으로 죽은 요청도 같은 갈래라 새 초대·사건이 남지 않고,
 * 호출부는 발송하지 않는다.
 */

/** 초대 유효 기간 — 단건 `createInvitation`과 같은 값이다. */
const INVITE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type IssueRecipient = { email: string; role: Role };
export type IssuedInvitation = { email: string; token: string };
type Refusal = Exclude<IssuePlan, { status: "ok" }>;

export type IssueOutcome = { status: "issued"; invitations: IssuedInvitation[]; retryAt: Date } | Refusal;
export type ReissueOutcome =
  | { status: "issued"; invitation: IssuedInvitation; retryAt: Date }
  | { status: "not-found" }
  | { status: "unreadable" }
  | Refusal;

type Tx = Prisma.TransactionClient;

async function lockProject(tx: Tx, projectId: string): Promise<void> {
  await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
}

/** 잠금 안에서 판정 입력을 읽는다. 최근 1시간 발급은 수락·철회·만료를 가리지 않는다 — 철회로 우회되지 않게. */
async function readLimits(tx: Tx, projectId: string, emails: readonly string[], now: Date) {
  const memberCount = await tx.projectMember.count({ where: { projectId } });
  const recent = await tx.projectInvitation.findMany({
    where: { projectId, createdAt: { gt: new Date(now.getTime() - PROJECT_WINDOW_MS) } },
    select: { emailLookup: true, createdAt: true },
  });
  const targets: IssueTarget[] = [];
  for (const email of emails) {
    const lookup = lookupEmail(email, projectId);
    let lastIssuedAt: Date | null = null;
    for (const row of recent) {
      if (row.emailLookup === lookup && (lastIssuedAt === null || row.createdAt > lastIssuedAt)) lastIssuedAt = row.createdAt;
    }
    const user = await findUserByEmail(tx, email);
    const member =
      user === null
        ? null
        : await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: user.id } }, select: { userId: true } });
    targets.push({ alreadyMember: member !== null, lastIssuedAt });
  }
  return { memberCount, recentIssues: recent.map((r) => r.createdAt), targets };
}

/** 회전(미수락 행 만료) → 새 행 → 사건. 원문 토큰은 반환값에만 있다. */
async function writeInvitation(tx: Tx, input: { projectId: string; userId: string; recipient: IssueRecipient; now: Date }) {
  const { projectId, userId, recipient, now } = input;
  await tx.projectInvitation.updateMany({
    where: { projectId, emailLookup: lookupEmail(recipient.email, projectId), acceptedAt: null },
    data: { expiresAt: now },
  });
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  await tx.projectInvitation.create({
    data: {
      id,
      projectId,
      ...encodeInvitationEmail(id, projectId, recipient.email),
      role: recipient.role,
      tokenHash: hashInviteToken(token),
      expiresAt: new Date(now.getTime() + INVITE_DAYS * DAY_MS),
      acceptedAt: null,
      invitedBy: userId,
      // 판정 시각이다 — 한도 조회가 이 값을 센다.
      createdAt: now,
    },
  });
  await recordEvent(tx, {
    projectId,
    subtype: "member.invited",
    actor: { kind: "USER", userId },
    scope: "project-wide",
    payload: { kind: "MEMBER", targetLabel: maskEmail(recipient.email), role: { before: null, after: recipient.role } },
  });
  return { email: recipient.email, token };
}

/**
 * 방금 발급한 뒤 같은 대상을 다시 받을 수 있는 시각 — 메일이 실패했을 때 "언제 다시"의 답이다.
 * 같은 판정 함수에 발급 후 상태를 넣어 구한다(두 번째 규칙을 만들지 않는다).
 */
function retryAfterIssue(limits: Awaited<ReturnType<typeof readLimits>>, count: number, now: Date): Date {
  const plan = planInvitationIssue({
    now,
    memberCount: 0,
    targets: limits.targets.map(() => ({ alreadyMember: false, lastIssuedAt: now })),
    recentIssues: [...limits.recentIssues, ...Array.from({ length: count }, () => now)],
  });
  return plan.status === "rate-limited" ? plan.retryAt : now;
}

export async function issueInvitations(
  prisma: PrismaClient,
  input: { projectId: string; userId: string; recipients: readonly IssueRecipient[] },
): Promise<IssueOutcome> {
  const { projectId, userId, recipients } = input;
  return prisma.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    const now = new Date();
    const limits = await readLimits(tx, projectId, recipients.map((r) => r.email), now);
    const plan = planInvitationIssue({ now, ...limits });
    if (plan.status !== "ok") return plan;

    const invitations: IssuedInvitation[] = [];
    for (const recipient of recipients) invitations.push(await writeInvitation(tx, { projectId, userId, recipient, now }));
    return { status: "issued" as const, invitations, retryAt: retryAfterIssue(limits, recipients.length, now) };
  });
}

export async function reissueInvitation(
  prisma: PrismaClient,
  input: { projectId: string; userId: string; invitationId: string },
): Promise<ReissueOutcome> {
  const { projectId, userId, invitationId } = input;
  return prisma.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    const now = new Date();
    // ⚠️ `projectId`로 좁힌다 — id를 알아도 남의 프로젝트 초대를 되살릴 수 없다.
    const row = await tx.projectInvitation.findFirst({
      where: { id: invitationId, projectId },
      select: { id: true, projectId: true, email: true, role: true, expiresAt: true, acceptedAt: true },
    });
    if (row === null || row.acceptedAt !== null || row.expiresAt <= now) return { status: "not-found" as const };

    const decoded = readable(() => decodeInvitation(row));
    if (decoded === null) return { status: "unreadable" as const };
    const recipient: IssueRecipient = { email: decoded.email, role: row.role };

    const limits = await readLimits(tx, projectId, [recipient.email], now);
    const plan = planInvitationIssue({ now, ...limits });
    if (plan.status !== "ok") return plan;

    /**
     * ⚠️ **대상 행의 조건부 회전 count=1이 선행조건이다.** 수락은 `Project` 잠금에 참여하지 않으므로
     * 위의 재조회만으로는 경합이 닫히지 않는다 — 수락 CAS와 같은 조건(`acceptedAt: null` · 조회한
     * `expiresAt`과 동등 · 쓰기 시점에 미만료)으로 옛 링크를 닫고, 0건이면 아무것도 만들지 않는다.
     */
    const closed = await tx.projectInvitation.updateMany({
      where: { id: row.id, projectId, acceptedAt: null, expiresAt: { equals: row.expiresAt, gt: now } },
      data: { expiresAt: now },
    });
    if (closed.count !== 1) return { status: "not-found" as const };

    const invitation = await writeInvitation(tx, { projectId, userId, recipient, now });
    return { status: "issued" as const, invitation, retryAt: retryAfterIssue(limits, 1, now) };
  });
}
