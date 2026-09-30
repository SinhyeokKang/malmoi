"use server";


import { parseGithubPrUrl } from "@/lib/projects/pr-url";

import { logCaught } from "@/lib/failure";
import { inviteMembers, InvitationsInput, toMessages, type InvitationsResult } from "@/lib/invitation-email/create";
import { reissueInvitation } from "@/lib/invitation-email/issue";
import { readInvitationEmailConfigFromEnv, sendInvitationEmails } from "@/lib/invitation-email/send";

import { IngestBudgetError } from "@/lib/onboarding/budget";

import { randomBytes, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { adapterFor, isAdapterName } from "@/lib/adapters";
import type { AdapterError } from "@/lib/adapters/types";
import { maskedEmailLabels } from "@/lib/auth/invite-label";
import type { AccessError } from "@/lib/auth/message";
import { changeMemberRole, MemberChangeInput, revokePendingInvitation, RevokeInput, type MemberChangeResult, type RevokeResult } from "@/lib/auth/members";
import type { Role } from "@/lib/auth/permission";
import { getProjectAccess } from "@/lib/auth/query";
import { readSession } from "@/lib/auth/read-session";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { runTokenFor } from "@/lib/events/payload";
import { finishRun, recordRun } from "@/lib/events/record";
import { optionalEnv, requireEnv } from "@/lib/env";
import { openRepoReader, probeRepo } from "@/lib/github";
import { APP_ACCOUNT_PROVIDER } from "@/lib/github-connect/account-link";
import { installWithStateUrl } from "@/lib/github-connect/installation-url";
import { logFailure } from "@/lib/github-connect/log";
import { callbackUrl, requestOrigin } from "@/lib/github-connect/origin";
import { STATE_TTL_MINUTES, signState, stateCookieName } from "@/lib/github-connect/state";
import {
  authorizeUrl,
  listInstallationRepos,
  listUserInstallations,
} from "@/lib/github-connect/user";
import { signSampleConfirmation, verifySampleConfirmation } from "@/lib/onboarding/sample-confirmation";
import { planConfirmedFormat, templatePaths } from "@/lib/onboarding/confirm";
import {
  ingestTargets,
  probeTargets,
  SAMPLE_ROWS,
  summarizeCandidates,
  type CandidateSummary,
  type SampleRow,
} from "@/lib/onboarding/detect";
import { redrawIfArchived, settleRevalidate } from "@/lib/revalidate-after-commit";
import { prepareSync } from "@/lib/import/prepare";
import { checkRepoAccess, type OnboardFailure } from "@/lib/onboarding-run/access";
import { addSources, AddSurfacesInput, type AddSurfacesResult } from "@/lib/onboarding-run/add";
import { listLinkedBranches, listNewRepoBranches, type BranchesResult, type ProjectBranchesResult } from "@/lib/onboarding-run/branches";
import { candidateOutputPaths, DetectInput, detectFormats, RepoInput, type DetectResult } from "@/lib/onboarding-run/detect";
import { importRepository, RepositoryImportInput } from "@/lib/onboarding-run/import";
import { listRepositories, type ConnectableRepo, type ConnectableReposResult } from "@/lib/onboarding-run/repos";
import { rotateToken, type RotateTokenResult } from "@/lib/onboarding-run/rotate-token";
import { createProjectFromRepo, CreateProjectInput, type CreatedSurface, type CreateProjectResult } from "@/lib/onboarding-run/create";
import { loadOpenPrUrl } from "@/lib/projects/open-pr";
import { runArchive, runUnarchive, type ArchiveResult } from "@/lib/projects/archive";
import type { RepositoryImportError, RepositoryImportOutcome } from "@/lib/import/result";
import type { OpenImportPr } from "@/lib/import/confirm";
import { readFiles, snapshotError } from "@/lib/import/read";
import { readSurfaceSnapshot } from "@/lib/import/surface";
import { FirstIngestRefused, ingestFirstSnapshot } from "@/lib/onboarding/ingest";
import type { OnboardError } from "@/lib/onboarding/message";
import { finishImportRun, markImportStarted } from "@/lib/projects/import-status-store";
import { planSurfaceReadiness, planProjectReadiness } from "@/lib/onboarding/readiness";
import { isLocaleShaped, isPathSafeLocale } from "@/lib/locale-code";
import { isValidBranchName } from "@/lib/pull/branch-name";

/**
 * 멤버와 초대 (ARCHITECTURE §6.02). **둘 다 OWNER 전용**이라 permission이 `member:manage`다.
 *
 * ⚠️ 화면은 6단계다 — 지금 호출자는 테스트와 번역 화면의 임시 초대 폼뿐이다. 그래도 판정을
 * 여기 두는 이유는 **`planMemberChange`에 호출부가 없으면 그 보호가 실재하지 않기 때문**이다
 * (이 리포의 반복 실패 유형 — POSTMORTEM 2026-09-03). 그 호출부는 이제 공유 코어 `lib/auth/members.ts`다.
 */

/**
 * 다중 초대 메일 (docs/features/invitation-email design §3·§4). **요청 전체가 통과하거나 전체가 막힌다.** 본체는 공유 코어
 * `inviteMembers`다(MCP `invite_members`와 같다).
 *
 * ⚠️ **링크를 돌려주는 단건 발급은 없다** (2026-09-23) — 원문은 메일로만 나간다. 메일 장애 동안 초대는 지연되고,
 *   발급 뒤 메일이 안 나간 초대는 Pending의 Resend로 복구한다.
 *
 * 순서가 계약이다: 입력 → 인가 → 메일 설정(없으면 **쓰기 전에** 막는다) → 잠금 안 발급 → commit 뒤 발송 한 번.
 * ⚠️ **응답에 토큰·URL이 없다** — 원문은 서버 메모리와 메일에만 있다.
 */
export type { InvitationsResult };

export async function createInvitations(raw: { slug: string; recipients: { email: string; role: string }[] }): Promise<InvitationsResult> {
  const parsed = InvitationsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };

  const { result, issued } = await inviteMembers(getPrisma(), { userId: session.userId }, parsed.data);
  // ⚠️ 발송 결과와 무관하게 다시 그린다 — 초대는 이미 생겼고 Pending에 보여야 Resend로 복구할 수 있다.
  if (issued) settleRevalidate("invite", () => revalidatePath(`/projects/${parsed.data.slug}/members`));
  return result;
}

const ResendInput = z.object({ slug: z.string().min(1), invitationId: z.string().min(1) });

export type ResendResult =
  | { ok: true; label: string }
  | { ok: false; error: "rate-limited"; retryAt: string; limit: "address" }
  | { ok: false; error: "rate-limited"; retryAt: string; limit: "project" | "user"; used: number }
  | { ok: false; error: "email-rejected" | "email-unknown"; label: string; retryAt: string }
  | { ok: false; error: string };

/**
 * Pending의 Resend — **서버에 저장된 주소·역할로** 새 초대와 메일을 만든다. 클라이언트는 id만 보낸다.
 * 옛 링크를 닫는 조건부 갱신이 새 초대의 선행조건이다(`reissueInvitation`).
 */
export async function resendInvitation(raw: { slug: string; invitationId: string }): Promise<ResendResult> {
  const parsed = ResendInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const input = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;

  const prisma = getPrisma();
  const access = await getProjectAccess(prisma, { userId, slug: input.slug, permission: "member:manage" });
  if (access.status !== "ok") return { ok: false, error: access.status };

  const config = readInvitationEmailConfigFromEnv();
  if (config.status !== "ready") return { ok: false, error: "email-unavailable" };

  let issued: Awaited<ReturnType<typeof reissueInvitation>>;
  try {
    issued = await reissueInvitation(prisma, { projectId: access.projectId, userId, invitationId: input.invitationId });
  } catch (error) {
    logCaught("invite", "reissue", error);
    return { ok: false, error: "unavailable" };
  }
  if (issued.status === "unreadable") return { ok: false, error: "unavailable" };
  if (issued.status === "invalid-rows") return { ok: false, error: "already-member" };
  if (issued.status === "rate-limited") {
    // 재발급은 한 주소라 막힌 행을 가리킬 필요가 없다 — 화면은 누른 행의 라벨로 말한다.
    const retryAt = issued.retryAt.toISOString();
    return issued.limit === "address" ? { ok: false, error: "rate-limited", retryAt, limit: "address" } : { ok: false, error: "rate-limited", retryAt, limit: issued.limit, used: issued.used };
  }
  if (issued.status !== "issued") return { ok: false, error: issued.status };

  const outcome = await sendInvitationEmails(config, issued.project, toMessages([issued.invitation]));
  revalidatePath(`/projects/${input.slug}/members`);
  // 한 주소를 가리는 자리라 충돌 판정이 필요 없다 — 단건 발급의 라벨과 같다.
  const label = maskedEmailLabels([issued.invitation.email])[0] ?? "";
  if (outcome === "accepted") return { ok: true, label };
  return { ok: false, error: outcome === "rejected" ? "email-rejected" : "email-unknown", label, retryAt: issued.retryAt.toISOString() };
}



/**
 * 대기 중인 초대를 무효화한다 (6b-2 — ARCHITECTURE §6.02). 본체는 공유 코어 `revokePendingInvitation`이다(MCP `revoke_invitation`과 같다).
 *
 * ⚠️ **행을 지우지 않는다.** `prisma/schema.prisma`의 `acceptedAt` 주석이 그것을 금지한다 — 지우면
 * 그 링크의 재사용 시도가 `already-accepted`가 아니라 `not-found`가 되어 만료·오배송과 뭉개진다.
 * 무효화의 기존 관용구는 **만료 시각을 당기는 것**이고(`createInvitations`의 토큰 회전이 같은 쓰기다)
 * `loadPendingInvitations`의 `expiresAt > now()` 술어가 그대로 맞는다.
 *
 * ⚠️ **`where`에 `projectId`와 `acceptedAt: null`이 함께 있다.** 앞은 테넌트 경계다 — id를 알아도
 * 남의 프로젝트 초대를 건드릴 수 없어야 한다(RLS가 없다). 뒤는 "이미 멤버가 된 사람의 초대를 되돌린
 * 것처럼 보이지 않게" 한다. 둘 중 하나만 있어도 `count`가 0이 되어 `not-found`로 나간다 — 존재
 * 여부를 문구로 가르지 않는 것은 `getProjectAccess`와 같은 규칙이다.
 */
export async function revokeInvitation(raw: { slug: string; invitationId: string }): Promise<RevokeResult> {
  const parsed = RevokeInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const input = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };

  const result = await revokePendingInvitation(getPrisma(), { userId: session.userId }, input);
  if (!result.ok) return result;

  settleRevalidate("revoke-invitation", () => revalidatePath(`/projects/${input.slug}/members`));
  return { ok: true };
}

export type { MemberChangeResult, RevokeResult };

/**
 * 제거(`nextRole: null`)와 역할 변경 — 본체는 공유 코어 `changeMemberRole`이다(MCP `change_member`와 같다). 마지막 OWNER 보호·
 * 잠금 순서가 거기 있다.
 */
export async function changeMember(raw: {
  slug: string;
  targetUserId: string;
  nextRole: Role | null;
}): Promise<MemberChangeResult> {
  const parsed = MemberChangeInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const input = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const result = await changeMemberRole(getPrisma(), { userId: session.userId }, input);
  if (!result.ok) return result;

  settleRevalidate("member-change", () => revalidatePath(`/projects/${input.slug}/members`));
  return { ok: true };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 온보딩 (SaaS 5단계 — ARCHITECTURE §3.1). **두 GitHub 자격증명이 만나는 유일한 자리다**:
 * 리포 읽기는 App installation 토큰(`openRepoReader`·`probeRepo`), "이 사람이 그 설치를 볼 수
 * 있는가"는 사용자 토큰(`listUserInstallations`·`listInstallationRepos`).
 * `lib/onboarding/`은 둘 다 모르고 스냅샷·blob을 **값으로** 받는다
 * (`credential-separation.test.ts`가 상시로 센다).
 *
 * ⚠️ **인가가 GitHub 조회보다 먼저다** — 거부될 요청이 남의 레이트 리밋을 태우지 않는다.
 *
 * 모달의 Action은 `readSession`으로 세션 거부를 값으로 돌려준다. redirect하면 모달의 입력이
 * 사라진다(예외 J). 페이지·연결 이동의 `requireUser`와 구별한다.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SlugOnlyInput = z.object({ slug: z.string().min(1) });
const SampleInput = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  ref: z.string().min(1),
  adapter: z.string().min(1),
  pathTemplate: z.string().min(1),
  locale: z.string().min(1),
  confirmation: z.string().max(65_536).optional(),
});
const ManualFormatInput = SampleInput.omit({ locale: true, confirmation: true }).extend({ baseLocale: z.string().min(1) });


export type StartUserConnectResult = { ok: false; error: OnboardFailure };

/**
 * 사용자 축의 착지 갈래 **둘** (6b-4). ⚠️ **`StateDest`를 그대로 받지 않는다** — 클라이언트가
 * `{kind:"settings", slug}`를 통째로 보낼 수 있으면 남의 설정 화면으로 착지를 정할 수 있고, 그러면
 * 이 자리에 open redirect 판정이 생긴다. 갈래 **이름만** 받고 payload는 서버가 만든다.
 */
const UserConnectDest = z.enum(["new", "account"]);
export type UserConnectDest = z.infer<typeof UserConnectDest>;
/**
 * `/projects/new`로 돌아올 때 되돌려 줄 목록 상태 (2026-09-13). **`new` 갈래에만 쓰인다** —
 * `/account`에는 대응물이 없다. 상한·형식은 `parseDest`가 서명을 풀 때 한 번 더 좁힌다.
 */
const ConnectBack = z.object({ q: z.string().max(200).optional() });
/**
 * 왕복이 GitHub의 어느 화면으로 가는가 (install-and-connect). `install`은 설치 URL에 state를 실어 설치와
 * 인가를 **한 왕복**으로 합친다. 쿠키·서명 dest는 둘이 같다 — 그래서 새 export가 아니라 인자다
 * (`entry-points.test.ts`의 목록과 쿠키 규약이 한 자리에 남는다).
 */
const ConnectVia = z.enum(["authorize", "install"]);
export type ConnectVia = z.infer<typeof ConnectVia>;

/**
 * GitHub 계정 연결의 **나가는 쪽 — 사용자 수준** (ARCHITECTURE §6.4). 인가는 `requireUser`뿐이다:
 * `Account` 행은 사용자 소유이므로 프로젝트 권한을 요구할 근거가 없다.
 *
 * ⚠️ **설정 화면의 `startGithubConnect`와 다른 것은 인가와 `dest` 둘뿐이다.** 쿠키 이름·`secure`·
 * origin 판정은 `requestOrigin`·`callbackUrl`·`stateCookieName`이 한 곳에서 든다 — 그 규칙을
 * 여기서 다시 구현하지 않는다 (malmoi#7이 그 판정이 갈려서 났다).
 *
 * ⚠️ **착지가 인자로 갈린다** (6b-4). 전에는 무인자라 `/projects/new` 하나였는데, `/account`가
 * 생기면서 같은 Action이 두 착지를 낸다 — 계정 화면에서 연결을 누른 사람이 생성 화면에 떨어지면
 * "내가 뭘 만들려던 게 아닌데"가 된다.
 *
 * 성공하면 GitHub으로 `redirect`하므로 **반환하지 않는다.**
 */
export async function startGithubConnectForUser(
  raw: UserConnectDest,
  rawBack: { q?: string } = {},
  rawVia: ConnectVia = "authorize",
): Promise<StartUserConnectResult> {
  // 입력이 인가보다 먼저다 — 모르는 갈래가 서명 payload에 실리면 착지가 `landingPath`의 사각지대가 된다.
  const parsed = UserConnectDest.safeParse(raw);
  const via = ConnectVia.safeParse(rawVia);
  if (!parsed.success || !via.success) return { ok: false, error: "invalid input" };
  const dest = parsed.data;
  // 목록 상태는 착지를 못 정한다 — 이상하면 그 값만 버리고 연결은 계속한다.
  const back = ConnectBack.safeParse(rawBack);

  const { userId } = await requireUser();

  const head = await headers();
  const origin = requestOrigin({
    host: head.get("host"),
    forwardedProto: head.get("x-forwarded-proto"),
  });
  // Host를 못 믿으면 authorize URL을 만들지 않는다 — 추측한 origin으로 사용자를 보내지 않는다.
  if (origin === null) return { ok: false, error: "unavailable" };
  const nonce = randomBytes(32).toString("base64url");
  /**
   * ⚠️ **쿠키보다 먼저 목적지를 정한다** — 슬러그가 없어 갈 곳이 없는데 쿠키를 심으면 다음 왕복이 옛 nonce와
   * 대조된다. 화면은 슬러그가 없으면 이 버튼을 애초에 안 세운다(`new-project-modal.tsx`) — 여기는 방어선이다.
   */
  const target = via.data === "install"
    ? installWithStateUrl(optionalEnv("GITHUB_APP_SLUG"), nonce)
    : authorizeUrl(nonce, callbackUrl(origin.origin));
  if (target === null) return { ok: false, error: "unavailable" };

  const cookieStore = await cookies();
  cookieStore.set(
    stateCookieName(origin.secure),
    signState({
      userId,
      // 착지가 서명 안에 있다 — 쿼리로 실으면 공격자가 그것을 정한다 (ARCHITECTURE §6.4).
      dest: dest === "new" ? { kind: "new", ...(back.success ? back.data : {}) } : { kind: "account" },
      nonce,
      expiresAt: new Date(Date.now() + STATE_TTL_MINUTES * 60 * 1000),
      secret: requireEnv("APP_SIGNING_SECRET"),
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_MINUTES * 60,
      // `__Host-` 접두와 짝이어야 한다 — 접두만 붙이고 Secure를 빼면 브라우저가 쿠키를 버린다.
      secure: origin.secure,
    },
  );

  // `redirect`는 던지므로 이 아래는 실행되지 않는다.
  redirect(target);
}

export type DisconnectResult = { ok: true } | { ok: false; error: "unavailable" };

/**
 * GitHub 계정 연결 **해제 — 사용자 수준** (2026-09-07 리뷰 🟡9. 설정 화면에서 여기로 옮겼다).
 *
 * ⚠️ **인가가 `project:settings`면 도달할 수 없는 사람이 생긴다.** 연결은 5단계에서 사용자 수준으로
 * 열렸으므로(`startGithubConnectForUser`) **프로젝트를 하나도 안 만든 사용자**가 연결만 하고 남을 수
 * 있고, 그 사람에게는 설정 화면이 없다 — `taken-by-other`가 영구 잠금이 된다(ARCHITECTURE §6.2.1는 자동 병합을
 * 금지하므로 다른 로그인 계정으로 옮길 길도 없다). `Account` 행은 **사용자 소유**라 프로젝트 권한을
 * 요구할 근거가 애초에 없었다.
 *
 * ⚠️ **자기 행만 지운다.** 남의 연결을 끊는 수단이 아니고, 로그인용 `provider: "github"` 행도
 * 건드리지 않는다 — 의미가 다른 인가다. `Project`와 번역 데이터도 그대로다(건강성은 App 토큰으로
 * 계산되므로 해제 뒤에도 보인다).
 */
export async function disconnectGithub(): Promise<DisconnectResult> {
  const { userId } = await requireUser();

  const prisma = getPrisma();
  try {
    // ⚠️ **`userId`로 좁혀 지운다** (2026-09-09, sec-audit 발견 15). 전에는 `(userId, provider)`로
    // **읽고** PK(`provider_providerAccountId`)로 **지웠다** — `where`에 `userId`가 없어, 두 문장
    // 사이에 그 `providerAccountId`의 소유자가 바뀌면 **남의 연결을 지운다**(탈취가 아니라 삭제다).
    // POSTMORTEM 2026-09-06이 넓힌 규칙 "사용자에 속한 행은 `userId`로 좁힌다"의 유일한 위반이었다.
    //
    // `deleteMany`라 조회가 필요 없다 — 없는 행은 `count: 0`이고 P2025를 안 던진다. 연결이 이미
    // 없는 것은 실패가 아니다: 원하는 상태가 이미 이뤄져 있다.
    await prisma.account.deleteMany({ where: { userId, provider: APP_ACCOUNT_PROVIDER } });
  } catch (error) {
    // 처리하지 않으면 digest만 있는 일반 오류가 된다 — 거부는 값으로 흘러야 한다 (ARCHITECTURE §6.3).
    logFailure("disconnect", error);
    return { ok: false, error: "unavailable" };
  }

  /**
   * ⚠️ **루트 레이아웃을 무효화한다.** 이 연결을 보이는 화면이 **둘이고 접두가 갈린다**: `/account`
   * (주 화면, 6b-4)와 각 프로젝트의 설정 화면이다. 전에는 둘 다 `/projects` 아래여서 그 접두로
   * 충분했는데, 계정 카드가 사용자 축으로 옮겨가면서 **그 접두가 주 화면을 놓쳤다** — 놓치면
   * [Disconnect]를 누른 사용자가 `@handle`과 그 버튼을 그대로 보고, 다시 눌러도 행이 이미 없어
   * 조용히 `{ok:true}`가 온다("버튼이 안 눌린다"로 보이지만 해제는 됐다).
   *
   * 여기서는 slug를 모르므로 경로를 좁힐 수단도 없다. 해제는 드문 조작이라 넓은 무효화의 대가가
   * 사실상 0이고, 어느 화면이 이 상태를 보이든 맞는다.
   */
  revalidatePath("/", "layout");
  return { ok: true };
}




export type { ConnectableRepo, ConnectableReposResult };

/**
 * 내 설치가 덮는 리포 목록 (화면 ②). 본체는 공유 코어 `listRepositories`다(MCP `list_repositories`와 같다) — 빈 상태 둘·설치 요청
 * 대기·상한 안내가 거기 있다.
 */
export async function listConnectableRepos(): Promise<ConnectableReposResult> {
  const { userId } = await requireUser();
  return listRepositories(getPrisma(), { userId });
}

export type { DetectResult };

/**
 * 탐지 (화면 ③) — **2패스다** (ARCHITECTURE §3.1). `FileProbe`가 동기라 경로만으로 1차 후보를 얻고,
 * 내려받을 파일을 고른 뒤(`probeTargets`, blob ≤37 — ts-dict 씨앗이 2026-09-14에 16을 더했다), 내용을 들고 다시 돈다.
 *
 * ⚠️ **1패스 결과를 사용자에게 보이지 않는다.** probe 없는 1순위는 검색 인덱스 같은 무관한 JSON
 * 묶음일 수 있다(bugshot-web 실측) — 중간값이지 화면에 쓰는 값이 아니다.
 */
export async function detectRepoFormats(raw: {
  owner: string;
  repo: string;
  /** ①에서 고른 브랜치. 미지정이면 그 리포의 default branch다. */
  ref?: string;
}): Promise<DetectResult> {
  const parsed = DetectInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  // 모달 입력을 보존한다 — 세션 거부는 redirect가 아니라 값이다 (예외 J).
  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;

  return detectFormats(getPrisma(), { userId }, parsed.data);
}


export type { BranchesResult, ProjectBranchesResult };

/**
 * ①의 브랜치 목록 (DESIGN §6.7).
 *
 * ⚠️ **인가는 `checkRepoAccess`를 그대로 지난다.** 그 함수가 ARCHITECTURE §6의 3중 검증이고, 존재
 * 오라클을 막는 **순서**(사용자 토큰으로 먼저 보고 없으면 `repo-not-installed` 한 갈래로 접는다)가
 * 거기 있다 — 여기서 갈래를 나누면 sec-audit 발견 5가 그대로 돌아온다.
 *
 * `defaultBranch`는 같은 호출이 이미 들고 있다 — **GitHub을 한 번 더 부르지 않는다.**
 */
export async function listRepoBranches(raw: { owner: string; repo: string }): Promise<BranchesResult> {
  const parsed = RepoInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };

  // 모달 입력을 보존한다 — 세션 거부는 redirect가 아니라 값이다 (예외 J).
  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;
  return listNewRepoBranches(getPrisma(), { userId }, parsed.data);
}
/**
 * **연결된 프로젝트 설정의 브랜치 목록** (malmoi#123). `listRepoBranches`는 온보딩 ①이라 리포 쓰기 권한을 요구하는데
 * (토큰을 받을 사람이다 — sec-audit-3 1a), 설정의 Base branch 목록은 **읽기**다: 저장(`updateRepositorySettings`)도
 * 쓰기 권한을 요구하지 않고 기존 프로젝트에는 소급하지 않는다. 그래서 `requirePush: false`로 부른다(Sync와 같은 예외).
 *
 * ⚠️ **클라이언트가 보낸 owner/repo·플래그로 가르지 않는다** — 그러면 ①이 같은 플래그로 쓰기 확인을 건너뛸 수 있다.
 * 프로젝트 slug로 인가(`project:settings`)하고 리포는 **저장된 행**에서 읽으며, 확인한 리포 id를 고정된
 * `Project.repositoryId`와 대조한다.
 */
export async function listProjectBranches(raw: { slug: string }): Promise<ProjectBranchesResult> {
  const parsed = SlugOnlyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  return listLinkedBranches(getPrisma(), { userId: session.userId }, parsed.data);
}

export type SampleResult =
  | { ok: true; rows: SampleRow[]; total: number }
  | { ok: false; error: OnboardFailure };

/**
 * 재검증은 탐지·수동 확정에서 끝내고 확인값에 서명한다. 그 단계에는 내용이 필요하다.
 * 여기서는 확인값과 현재 인가·head를 대조한 뒤에만 blob을 읽는다 — templatePaths는 방어가 아니다.
 */
export async function loadCandidateSample(raw: {
  owner: string; repo: string; ref: string; adapter: string; pathTemplate: string; locale: string;
  confirmation?: string;
}): Promise<SampleResult> {
  const parsed = SampleInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const input = parsed.data;
  if (!isValidBranchName(input.ref) || !isPathSafeLocale(input.locale) || !isLocaleShaped(input.locale)) return { ok: false, error: "invalid input" };
  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;
  const access = await checkRepoAccess(getPrisma(), userId, input.owner, input.repo, true);
  if (access.status !== "ok") return { ok: false, error: access.error };
  const reader = await openRepoReader(access.repoOwner, access.repoName, access.installationId, access.repositoryId);
  const snapshot = await reader.snapshot(input.ref);
  if (snapshot.status !== "ok") return { ok: false, error: snapshotError(snapshot) };

  const verified = verifySampleConfirmation(input.confirmation ?? "", {
    userId, repositoryId: access.repositoryId, installationId: access.installationId,
    ref: input.ref, headSha: snapshot.headSha,
  }, requireEnv("APP_SIGNING_SECRET"), new Date());
  // 확인값을 못 믿으면 입력이 아니라 확인값이 낡은 것이다 — 만료·키 회전·낡은 스냅샷 전부 재탐지로 풀린다.
  if (verified === null) return { ok: false, error: "sample-expired" };
  if (!isAdapterName(verified.adapter) || verified.adapter !== input.adapter ||
      verified.pathTemplate !== input.pathTemplate || !verified.locales.includes(input.locale)) {
    return { ok: false, error: "manual-no-match" };
  }
  const format = { ...verified, adapter: verified.adapter };
  const adapter = adapterFor(format);
  const paths = snapshot.files.map((file) => file.path);
  const targets = adapter.layout === "per-locale"
    ? [format.pathTemplate.replaceAll("{locale}", input.locale)].filter((path) => paths.includes(path))
    : ingestTargets(format, adapter.layout, paths);
  if (targets.length === 0) return { ok: false, error: "manual-no-match" };
  try {
    const files = await readFiles(reader, snapshot, targets);
    if (files.length !== targets.length) return { ok: false, error: "unavailable" };
    const read = adapter.read(format, files);
    const locale = read.locales.find((item) => item.locale === input.locale);
    /**
     * 0행인 정상 로케일과 **못 읽은 파일**을 구별한다 — `sampleRows`는 둘을 같은 값으로 접으므로
     * 여기서는 `read`를 직접 본다.
     *
     * ⚠️ **`errors.length`로 판정하지 않는다.** 그건 **엔트리 층 오류**(903키 중 하나가 문자열이
     * 아니다)까지 포함해서, 하나만 이상해도 나머지 902개가 화면에서 사라진다 — 남의 리포를 우리
     * 파서 규칙으로 탈락시키지 않는다는 규칙의 정반대다 (ARCHITECTURE §4). 파일을 못 읽으면
     * 어댑터가 **그 로케일을 아예 안 낸다**: 그것이 "못 읽었다"의 신호다.
     */
    if (locale === undefined) return { ok: false, error: "unavailable" };
    return { ok: true, rows: locale.entries.slice(0, SAMPLE_ROWS).map((entry) => ({ key: entry.key, value: entry.message })), total: locale.entries.length };
  } catch (error) {
    if (error instanceof IngestBudgetError) return { ok: false, error: "resource-limit" };
    logFailure("onboard-sample", error);
    return { ok: false, error: "unavailable" };
  }
}

/** 수동 입력은 처음부터 신뢰하지 않는다 — 내용 재탐지가 성공해야 확인값을 발급한다. */
export async function confirmManualFormat(raw: {
  owner: string; repo: string; ref: string; adapter: string; pathTemplate: string; baseLocale: string;
}): Promise<{ ok: true; candidate: CandidateSummary } | { ok: false; error: OnboardFailure }> {
  const parsed = ManualFormatInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const input = parsed.data;
  if (!isValidBranchName(input.ref) || !isPathSafeLocale(input.baseLocale) || !isLocaleShaped(input.baseLocale) || !isAdapterName(input.adapter)) {
    return { ok: false, error: "invalid input" };
  }
  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;
  const access = await checkRepoAccess(getPrisma(), userId, input.owner, input.repo, true);
  if (access.status !== "ok") return { ok: false, error: access.error };
  const reader = await openRepoReader(access.repoOwner, access.repoName, access.installationId, access.repositoryId);
  const snapshot = await reader.snapshot(input.ref);
  if (snapshot.status !== "ok") return { ok: false, error: snapshotError(snapshot) };
  const paths = snapshot.files.map((file) => file.path);
  const targets = templatePaths(input.adapter, input.pathTemplate, paths);
  try {
    const files = await readFiles(reader, snapshot, targets);
    if (files.length !== targets.length) return { ok: false, error: "unavailable" };
    const confirmed = planConfirmedFormat(input, files);
    // 언어가 하나인 경로는 "파일이 없다"와 할 일이 달라 사유를 가른다 (malmoi#99).
    if (confirmed.status !== "ok") return { ok: false, error: confirmed.reason === "single-locale" ? "single-locale" : "manual-no-match" };
    const summary = summarizeCandidates([confirmed.format], new Map(files.map((file) => [file.path, file.content])))[0];
    if (summary === undefined) return { ok: false, error: "manual-no-match" };
    // 수동 기준 언어는 sampleOrder의 초기 셋 밖일 수 있다. 다운로드는 이미 끝났으므로 추가 blob은 없다.
    if (!summary.samples.some((sample) => sample.locale === input.baseLocale)) {
      const format = { ...confirmed.format, locales: [input.baseLocale] };
      const adapter = adapterFor(format);
      const selectedPaths = new Set(ingestTargets(format, adapter.layout, paths));
      const read = adapter.read(format, files.filter((file) => selectedPaths.has(file.path)));
      const locale = read.locales.find((item) => item.locale === input.baseLocale);
      // 위와 같은 규칙 — 엔트리 층 오류는 후보를 떨어뜨리지 않는다 (ARCHITECTURE §4).
      if (locale === undefined) return { ok: false, error: "unavailable" };
      summary.samples.push({ locale: input.baseLocale, total: locale.entries.length,
        rows: locale.entries.slice(0, SAMPLE_ROWS).map((entry) => ({ key: entry.key, value: entry.message })),
      });
    }
    return { ok: true, candidate: { ...summary, outputPaths: candidateOutputPaths(confirmed.format, paths), baseLocale: confirmed.baseLocale,
      confirmation: signSampleConfirmation({
        userId, repositoryId: access.repositoryId, installationId: access.installationId,
        ref: input.ref, headSha: snapshot.headSha, format: confirmed.format,
      }, requireEnv("APP_SIGNING_SECRET"), new Date()),
    } };
  } catch (error) {
    if (error instanceof IngestBudgetError) return { ok: false, error: "resource-limit" };
    logFailure("onboard-confirm-sample", error);
    return { ok: false, error: "unavailable" };
  }
}

export type { CreatedSurface, CreateProjectResult };

/** 모든 표면의 읽기·파싱을 끝낸 뒤 생성과 첫 적재를 같은 트랜잭션에 저장한다 — 본체는 공유 코어 `createProjectFromRepo`다(MCP `create_project`와 같다). */
export async function createProject(raw: {
  owner: string;
  repo: string;
  manual?: boolean;
  surfaces: { adapter: string; pathTemplate: string; baseLocale: string }[];
  slug: string;
  name: string;
  baseBranch: string;
}): Promise<CreateProjectResult> {
  const parsed = CreateProjectInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const input = parsed.data;

  // 모달 입력을 보존한다 — 세션 거부는 redirect가 아니라 값이다 (예외 J).
  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;

  const result = await createProjectFromRepo(getPrisma(), { userId }, input, { origin: await appOrigin() });
  if (!result.ok) return result;
  settleRevalidate("create-project", () => revalidatePath("/projects"));
  // ⚠️ **`/projects/new`도 지운다.** 모달 뒤에 목록이 있으므로 그 라우트도 같은 목록을 그리는데,
  // 위가 **접두가 아니라 경로 하나**라 여기를 안 덮는다 (POSTMORTEM 2026-09-09).
  settleRevalidate("create-project", () => revalidatePath("/projects/new"));
  return result;
}

export type FirstIngestResultView =
  | { ok: true; count: number; failed: number; unmanaged: number; errors: AdapterError[] }
  | { ok: false; error: OnboardError | AccessError | "invalid input" };

/**
 * 첫 적재 (화면 ⑤⑥) — **`awaiting_first_sync`에서만 돈다** (PRODUCT §7.5). 설정 화면의 [다시 시도]가
 * 같은 Action이고, `retryFirstIngest`는 따로 없다.
 *
 * ⚠️ **`ready`에서 돌리면 strict push라 번역자 편집을 버튼 하나로 덮는다.** 그래서 `not-awaiting`이다.
 *
 * ⚠️ **포맷의 `locales`는 컬럼에 없다** — 첫 적재가 `Locale` 행을 만들기 때문이다. 그래서 저장된
 * 템플릿으로 파일을 다시 읽어 `planConfirmedFormat`을 지난다: 확정과 같은 경로이고, 그 사이에
 * 파일이 옮겨졌으면 여기서 잡힌다.
 */
export async function runFirstIngest(raw: { slug: string; surfaceSlug?: string }): Promise<FirstIngestResultView> {
  const parsed = SlugOnlyInput.extend({ surfaceSlug: z.string().min(1).max(40).optional() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { slug, surfaceSlug } = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;

  const prisma = getPrisma();
  const access = await getProjectAccess(prisma, { userId, slug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const { projectId } = access;

  // ⚠️ **인가가 준 projectId로 좁힌다** — 클라이언트가 보낸 slug는 판정 입력일 뿐이다.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      repoOwner: true,
      repoName: true,
      baseBranch: true,
      installationId: true,
      repositoryId: true,
      archivedAt: true,
      defaultSurface: true,
    },
  });
  if (project === null) return { ok: false, error: "not-found" };
  /**
   * ⚠️ **인가가 이것을 안 막는다** — 이 Action은 `project:settings` 뒤에 있고 그 권한만 보관 중에도
   * 통과한다(PRODUCT §7.9 — 전부 막으면 보관이 편도가 된다). 번역을 바꾸는 쓰기는 자기가 한 번 더
   * 봐야 하고, 형제 `addSurfaces`·`runRepositoryImport`가 같은 형이다.
   *
   * ⚠️ **`apply.ts`의 트랜잭션 가드가 이미 막고 있었지만 너무 늦었다** — 거기까지 가면 스냅샷을
   * 이미 내려받은 뒤이고, 그 예외가 아래에서 `ingest-failed`로 접혀 **"적재 실패"로 오진**된다.
   */
  if (project.archivedAt !== null) return { ok: false, error: "archived" };

  const surface = surfaceSlug === undefined ? project.defaultSurface : await prisma.translationSurface.findFirst({ where: { projectId, slug: surfaceSlug } });
  if (!surface || surface.archivedAt !== null) return { ok: false, error: "not-found" };
  if (planSurfaceReadiness({ installationId: project.installationId, surface }) !== "awaiting_first_sync") return { ok: false, error: "not-awaiting" };
  const { installationId } = project;
  const { adapterName, pathTemplate, baseLocale } = surface;
  // `awaiting_first_sync`는 `installationId`가 있다는 뜻이지만 컴파일러는 그것을 모른다.
  // 포맷 셋이 비어 있는 것은 온보딩 밖에서 만들어진 행이라 여기서 적재할 근거가 없다.
  if (installationId === null || adapterName === null || pathTemplate === null || baseLocale === null) {
    logFailure("onboard-ingest", new Error(`project has no stored format: ${slug}`));
    return { ok: false, error: "ingest-failed" };
  }
  if (!isAdapterName(adapterName)) {
    logFailure("onboard-ingest", new Error(`unknown adapter name stored: ${adapterName}`));
    return { ok: false, error: "ingest-failed" };
  }

  /**
   * **여기서부터가 "돌고 있다"** (PRODUCT §7.8) — 인가·준비 확인을 지났고 다음 줄이
   * 리포를 읽는다. 그 앞에서 세우면 거부된 호출까지 목록에 진행 중으로 뜬다.
   *
   * ⚠️ **끝내는 것은 시작한 쪽이다.** 조기 반환이 여섯이라 하나라도 빠지면 그 프로젝트가 영영
   * "적재 중"으로 남는다 — 화면에 그것을 지울 버튼이 없다.
   */
  const startedAt = new Date();
  const token = randomUUID();
  const scope = { projectId, surfaceId: surface.id };
  await markImportStarted(prisma, scope, startedAt, token);
  const failRun = (code: "import-failed" | "partial-import" = "import-failed") =>
    finishImportRun(prisma, { ...scope, token, code });

  /**
   * 실행 사건 — 시작에 열고 **모든 반환·예외 경로**가 닫는다 (T5b-0). 조기 반환이 여섯이라 하나라도
   * 빠지면 그 실행이 영영 `Running…`으로 남고, 화면에 그것을 닫을 수단이 없다.
   *
   * ⚠️ **기록 실패가 적재를 되돌리지 않는다** — 관측 기반이라 실행은 이미 일어났다.
   */
  const runToken = runTokenFor({ kind: "import", token });
  const surfaceSlugs = [surface.slug];
  await prisma
    .$transaction(async tx => {
      await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
      await recordRun(tx, {
        projectId, subtype: "import.first", actor: { kind: "USER", userId },
        surfaceIds: [surface.id], occurredAt: startedAt, runToken,
        payload: { kind: "IMPORT", source: "first", surfaceSlugs, keys: null, pendingEdits: null, surfaces: [], errorCode: null, refusal: null, deferReason: null, changedValues: null },
      });
    })
    .catch((error: unknown) => logFailure("onboard-ingest-event", error));
  const closeRun = async (
    result: "imported" | "partial" | "failed",
    outcome: { keys: number | null; errorCode: string | null },
  ) => {
    try {
      const closed = await prisma.$transaction(tx => finishRun(tx, {
        projectId, runToken, result,
        payload: {
          kind: "IMPORT", source: "first", surfaceSlugs, keys: outcome.keys, pendingEdits: null,
          surfaces: [{ surfaceSlug: surface.slug, status: result === "failed" ? "failed" : result === "partial" ? "partial" : "imported", count: outcome.keys, reason: outcome.errorCode }],
          errorCode: outcome.errorCode, refusal: null, deferReason: null, changedValues: null,
        },
      }));
      // ⚠️ **0행 갱신은 조용하다** (POSTMORTEM 2026-09-14) — 다른 실행이 이 행을 먼저 닫았다는 뜻이고,
      // 그러면 이력의 결과가 이 실행의 결과가 아니다. 적재는 그대로 두고 사실만 남긴다.
      if (!closed) logFailure("onboard-ingest-event", new Error(`run event already closed: ${runToken}`));
    } catch (error) {
      logFailure("onboard-ingest-event", error);
    }
  };

  try {
    const reader = await openRepoReader(project.repoOwner, project.repoName, installationId, project.repositoryId);
    const snapshot = await reader.snapshot(project.baseBranch);
    if (snapshot.status !== "ok") {
      await failRun();
      await closeRun("failed", { keys: null, errorCode: snapshotError(snapshot) });
      return { ok: false, error: snapshotError(snapshot) };
    }

    let prepared: Awaited<ReturnType<typeof readSurfaceSnapshot>>;
    try {
      prepared = await readSurfaceSnapshot(reader, snapshot, { adapter: adapterName, pathTemplate, baseLocale });
    } catch (error) {
      if (!(error instanceof IngestBudgetError)) throw error;
      await failRun();
      await closeRun("failed", { keys: null, errorCode: "resource-limit" });
      return { ok: false, error: "resource-limit" };
    }
    if (prepared.status !== "ok") {
      logFailure("onboard-ingest", new Error(`stored format no longer holds: ${prepared.reason}`));
      await failRun();
      await closeRun("failed", { keys: null, errorCode: "ingest-failed" });
      return { ok: false, error: "ingest-failed" };
    }
    const { paths, targets, blobs } = prepared;

    const result = await ingestFirstSnapshot(prisma, {
      projectId,
      userId,
      surfaceId: surface.id,
      surfaceSlug: surface.slug,
      startedAt, token,
      projectSlug: slug,
      format: prepared.format,
      baseLocale: prepared.baseLocale,
      headSha: snapshot.headSha,
      // ⚠️ **base head 커밋의 시각이다.** `new Date()`면 CI 첫 push가 `stale-commit` 409다 (ARCHITECTURE §3.1).
      headCommittedAt: snapshot.headCommittedAt,
      paths,
      // 내려받기를 **시도한** 목록이다 — `blobs`에 없는 것을 실패로 센다 (불변식 9).
      targets,
      blobs,
    });

    /**
     * ⚠️ **서브트리다 — `/settings` 하나가 아니다** (2026-09-11 `/doc-check`). 이 Action이 세우는
     * `lastCommitSha`가 `planProjectReadiness`를 `ready`로 넘기는데, 그 판정을 읽는 화면이 **넷**이다:
     * 설정 · Home · 번역 · 목록. 설정만 지우면 **적재를 막 끝낸 사용자가 Home·번역에서 캐시된
     * `ProjectNotReady`("아직 준비 안 됐다")를 본다** — 그리고 [다시 시도]는 `not-awaiting`이라
     * 되돌릴 수도 없다.
     *
     * 경로를 나열하지 않는 이유는 POSTMORTEM 2026-09-09과 같다 — 다음에 생기는 화면이 조용히 빠진다.
     * `saveTranslationKey`가 이미 이 형이다.
     */
    /**
     * ⚠️ **키가 0이면 `applyPush`를 타지 않았다** — 그쪽 트랜잭션이 결과를 확정하므로, 안 탄 갈래만
     * 여기서 정리한다. 그때 `failed`는 최소 1이라(`ingest.ts`) 이 경우가 곧 부분 실패다.
     */
    if (result.count === 0) await failRun("partial-import");

    await closeRun(result.failed > 0 || result.count === 0 ? "partial" : "imported", { keys: result.count, errorCode: null });
    return { ok: true, count: result.count, failed: result.failed, unmanaged: result.unmanaged, errors: [...result.errors] };
  } catch (error) {
    // 스냅샷을 받는 동안 권한·보관이 바뀌었다 — 적재 실패가 아니라 거부다.
    if (error instanceof FirstIngestRefused) {
      await failRun();
      await closeRun("failed", { keys: null, errorCode: error.code });
      return { ok: false, error: error.code };
    }
    // 던지지 않는다 — 직렬화 경계라 클라이언트가 받을 수 있는 모양으로 바꾼다. 행은 그대로 남고
    // 설정 화면의 [다시 시도]가 같은 Action을 부른다.
    logFailure("onboard-ingest", error);
    await failRun();
    await closeRun("failed", { keys: null, errorCode: "ingest-failed" });
    return { ok: false, error: "ingest-failed" };
  } finally {
    // 조기 실패도 목록의 상태를 바꾼다 — 성공 때만 지우면 실패 사유 대신 캐시된 대기가 남는다.
    revalidatePath(`/projects/${slug}`, "layout");
    revalidatePath("/projects");
    revalidatePath("/projects/new");
  }
}

/**
 * ⚠️ **`approval`은 불투명 지문 하나다** — 클라이언트는 `prepareRepositorySync`가 준 값을 되돌려 줄 뿐이고, 서버가 잠금 뒤
 * 재계산해 대조한다(`lib/import/run.ts`). boolean 동의(`discard: true`)를 받지 않는다 — 그 뒤의 모든 편집을 버리는 포괄 권한이 된다.
 */

export async function runRepositoryImport(raw: { slug: string; approval: string | null }): Promise<RepositoryImportOutcome> {
  const parsed = RepositoryImportInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { slug } = parsed.data;
  const session = await readSession();
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  // 본체는 공유 코어 `importRepository`다(MCP `sync_repository`와 같다).
  let attempted = false;
  try {
    const result = await importRepository(getPrisma(), { userId: session.userId }, parsed.data);
    attempted = result.attempted;
    return result.outcome;
  } finally {
    // 인가 전 거부는 아무것도 안 바꿨다 — 트리를 싣지 않는다(`RepositoryImportError` 주석의 "try 앞 거부").
    if (attempted) {
      settleRevalidate("repository-import", () => revalidatePath(`/projects/${slug}`, "layout"));
      settleRevalidate("repository-import", () => revalidatePath("/projects"));
      settleRevalidate("repository-import", () => revalidatePath("/projects/new"));
    }
  }
}

/**
 * 수동 Sync 확인 Dialog가 열릴 때 **폐기 승인 지문을 발급한다** (sync-edit-protection — ARCHITECTURE §5.5.2의 폐기 승인). 본체는 공유
 * 코어 `prepareSync`다 — 원문 비노출·`undefined` 실패 계약이 거기 있다.
 */
export async function prepareRepositorySync(raw: { slug: string }): Promise<{ approval: string; unsent: number } | undefined> {
  const parsed = SlugOnlyInput.safeParse(raw);
  if (!parsed.success) return undefined;
  const session = await readSession();
  if (session.status !== "ok") return undefined;
  return prepareSync(getPrisma(), { userId: session.userId }, parsed.data);
}

export async function checkOpenPullRequest(raw: { slug: string }): Promise<OpenImportPr> {
  const parsed = SlugOnlyInput.safeParse(raw);
  if (!parsed.success) return undefined;
  const session = await readSession();
  if (session.status !== "ok") return undefined;
  const prisma = getPrisma();
  const access = await getProjectAccess(prisma, { userId: session.userId, slug: parsed.data.slug, permission: "project:settings" });
  if (access.status !== "ok") return undefined;
  try {
    const project = await prisma.project.findUnique({ where: { id: access.projectId } });
    if (project === null) return undefined;
    const rawUrl = await loadOpenPrUrl(parsed.data.slug, project);
    return parseGithubPrUrl(rawUrl, project);
  } catch (error) {
    logFailure("repository-import-pr", error);
    return undefined;
  }
}

export type { RotateTokenResult };

/**
 * push 토큰 재발급 (설정 화면). **원문은 이 반환값에만 있다** — 잃으면 다시 재발급이다. 본체는 공유 코어 `rotateToken`이다.
 *
 * ⚠️ **회전하면 옛 토큰이 즉시 무효다.** 대상 리포의 `PUSH_TOKEN` secret을 바꾸기 전까지 그 리포의
 * CI는 401이고, 화면이 버튼 **위에** 그 사실을 상시 캡션으로 둔다 (DESIGN §6.6).
 */
export async function rotatePushToken(raw: { slug: string }): Promise<RotateTokenResult> {
  const parsed = SlugOnlyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { slug } = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;

  const result = await rotateToken(getPrisma(), { userId }, parsed.data);
  if (!result.ok) return redrawIfArchived(slug, result.error, result);

  settleRevalidate("rotate-token", () => revalidatePath(`/projects/${slug}/settings`));
  return result;
}

export type { ArchiveResult };

/**
 * 프로젝트 보관 (7단계 — ARCHITECTURE §5.6.4). 본체는 공유 코어 `runArchive`다(MCP `archive_project`와 같다).
 *
 * ⚠️ **`revalidatePath("/", "layout")`이다.** 보관은 목록·사이드바·Home·번역·설정을 다 바꾼다 —
 * 경로를 나열하면 다음에 생기는 화면이 조용히 빠진다 (POSTMORTEM 2026-09-09, `disconnectGithub` 선례).
 */
export async function archiveProject(slug: unknown): Promise<ArchiveResult> {
  const parsed = SlugOnlyInput.safeParse({ slug });
  if (!parsed.success) return { ok: false, error: "invalid input" };

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };

  const result = await runArchive(getPrisma(), { userId: session.userId }, parsed.data);
  if (!result.ok) return result;
  settleRevalidate("archive", () => revalidatePath("/", "layout"));
  return result;
}

/** 되돌리기 — 본체는 공유 코어 `runUnarchive`다. **확인을 묻지 않는다** — 잃는 것이 없다. */
export async function unarchiveProject(slug: unknown): Promise<ArchiveResult> {
  const parsed = SlugOnlyInput.safeParse({ slug });
  if (!parsed.success) return { ok: false, error: "invalid input" };

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };

  const result = await runUnarchive(getPrisma(), { userId: session.userId }, parsed.data);
  if (!result.ok) return result;
  settleRevalidate("unarchive", () => revalidatePath("/", "layout"));
  return result;
}








export type { AddSurfacesResult };

/** 생성 워크플로의 `api-url`용 — `requestOrigin`이 허용 목록과 대조한 값만. 모르면 `null`(= 프로덕션 기본값). */
async function appOrigin(): Promise<string | null> {
  const head = await headers();
  return requestOrigin({ host: head.get("host"), forwardedProto: head.get("x-forwarded-proto") })?.origin ?? null;
}

export async function addSurfaces(raw: { slug: string; picks: { adapter: string; pathTemplate: string; baseLocale: string }[] }): Promise<AddSurfacesResult> {
  const parsed = AddSurfacesInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const input = parsed.data;
  const session = await readSession();
  if (session.status !== "ok") return { ok: false, error: session.status === "none" ? "unauthorized" : "unavailable" };
  const result = await addSources(getPrisma(), { userId: session.userId }, input, { origin: await appOrigin() });
  if (!result.ok) return result;
  // The transaction has committed. Cache failures must not claim that nothing was added.
  try {
    revalidatePath(`/projects/${input.slug}`, "layout");
    revalidatePath("/projects");
  } catch (error) {
    logFailure("onboard-add-surfaces-cache", error);
  }
  return result;
}
