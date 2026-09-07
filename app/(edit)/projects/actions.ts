"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { adapterFor, detectCandidatesAcross, isAdapterName } from "@/lib/adapters";
import { compareKeys } from "@/lib/adapters/shared";
import { codeDictCandidatePaths } from "@/lib/adapters/code-dict";
import type { AdapterFile, AdapterName } from "@/lib/adapters/types";
import { normalizeEmail } from "@/lib/auth/email";
import { hashInviteToken } from "@/lib/auth/invitation";
import type { AccessError } from "@/lib/auth/message";
import { planMemberChange } from "@/lib/auth/membership";
import type { Role } from "@/lib/auth/permission";
import { getProjectAccess } from "@/lib/auth/query";
import { readSession } from "@/lib/auth/read-session";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { openRepoReader, probeRepo, type RepoReader, type RepoSnapshot } from "@/lib/github";
import { APP_ACCOUNT_PROVIDER } from "@/lib/github-connect/account-link";
import { planRepoConnect, type RepoConnect } from "@/lib/github-connect/connect-plan";
import { httpStatus } from "@/lib/github-connect/health";
import { logFailure } from "@/lib/github-connect/log";
import type { ConnectError } from "@/lib/github-connect/message";
import { callbackUrl, requestOrigin } from "@/lib/github-connect/origin";
import { STATE_TTL_MINUTES, signState, stateCookieName } from "@/lib/github-connect/state";
import { ensureUserToken } from "@/lib/github-connect/token-store";
import { authorizeUrl, listInstallationRepos, listUserInstallations } from "@/lib/github-connect/user";
import { planConfirmedFormat, templatePaths } from "@/lib/onboarding/confirm";
import { PROJECT_LIMIT, planProjectCreate } from "@/lib/onboarding/create-plan";
import {
  ingestTargets,
  makeProbe,
  probeTargets,
  summarizeCandidates,
  type CandidateSummary,
} from "@/lib/onboarding/detect";
import { ingestFirstSnapshot } from "@/lib/onboarding/ingest";
import type { OnboardError } from "@/lib/onboarding/message";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { planSlug } from "@/lib/onboarding/slug";
import { generatePushToken, hashPushToken } from "@/lib/push/token";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * 멤버와 초대 (SAAS.md §5.6). **둘 다 OWNER 전용**이라 permission이 `member:manage`다.
 *
 * ⚠️ 화면은 6단계다 — 지금 호출자는 테스트와 번역 화면의 임시 초대 폼뿐이다. 그래도 판정을
 * 여기 두는 이유는 **`planMemberChange`에 호출부가 없으면 그 보호가 실재하지 않기 때문**이다
 * (이 리포의 반복 실패 유형 — POSTMORTEM 2026-09-03).
 */

/** 초대 유효 기간. 링크가 사람 손으로 전달되므로 하루는 짧고 한 달은 길다. */
const INVITE_DAYS = 7;

/**
 * ⚠️ **Server Action은 공개 엔드포인트다** — 타입 시그니처는 클라이언트를 구속하지 않는다 (`lib/keys/save.ts`의
 * `SaveInput`과 같은 이유). `role`은 DB enum에 그대로 들어가므로 조작된 값은 Prisma가 던져 digest 오류가 된다 —
 * 거부는 값으로 흘러야 한다 (ARCHITECTURE §6.3, code-review 2026-09-06 🟡13).
 */
const RoleSchema = z.enum(["OWNER", "EDITOR"]);
const InvitationInput = z.object({ slug: z.string().min(1), email: z.string().min(1), role: RoleSchema });
const MemberChangeInput = z.object({
  slug: z.string().min(1),
  targetUserId: z.string().min(1),
  nextRole: RoleSchema.nullable(),
});

export type InviteResult =
  | { ok: true; token: string }
  | { ok: false; error: string };

export async function createInvitation(raw: {
  slug: string;
  email: string;
  role: Role;
}): Promise<InviteResult> {
  // 입력 검증이 인가보다 먼저다 — slug가 없으면 무엇을 인가할지 정할 수 없다.
  const parsed = InvitationInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const input = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;

  const prisma = getPrisma();
  const access = await getProjectAccess(prisma, {
    userId,
    slug: input.slug,
    permission: "member:manage",
  });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const { projectId } = access;

  // 저장·대조가 같은 정규화를 지나야 수락 시 대소문자로 갈리지 않는다.
  const email = normalizeEmail(input.email);
  if (email === "") return { ok: false, error: "invalid input" };

  // 이미 멤버인 사람에게 초대를 보내면 수락해도 바뀌는 것이 없다 — 거부해서 OWNER가
  // "보냈는데 왜 안 되지"를 겪지 않게 한다.
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing !== null) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: existing.id } },
      select: { userId: true },
    });
    if (member !== null) return { ok: false, error: "already-member" };
  }

  // 원문은 여기서 한 번 돌려주고 **저장하지 않는다** (SAAS §5.6).
  const token = randomBytes(32).toString("base64url");
  const now = new Date();

  /**
   * ⚠️ **회전과 생성이 한 트랜잭션이고, 프로젝트 행을 먼저 잠근다** (Codex 감사 2026-09-06 #4). 갈라 두면
   * 두 OWNER가 같은 이메일을 동시에 초대할 때 각자 회전을 끝내고 각자 만들어 **유효 링크가 둘** 남는다 —
   * role이 다르면 둘 다 수락된다. `changeMember`와 같은 잠금이다. 잠금 없이 트랜잭션만 걸면 "기존 행이 없는
   * 동시 발급"은 막지 못한다 — 두 요청 모두 회전할 행이 없어 충돌이 안 난다.
   */
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;

    // ⚠️ **미수락 행을 먼저 만료시킨다 = 토큰 회전.** `(projectId, email)`이 unique가 아니라
    // index인 이유가 이것이다 — 수락·만료된 행이 이메일을 점유하면 재초대가 막힌다 (design §5).
    await tx.projectInvitation.updateMany({
      where: { projectId, email, acceptedAt: null },
      data: { expiresAt: now },
    });

    await tx.projectInvitation.create({
      data: {
        projectId,
        email,
        role: input.role,
        tokenHash: hashInviteToken(token),
        expiresAt: new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000),
        acceptedAt: null,
        invitedBy: userId,
      },
    });
  });

  revalidatePath(`/projects/${input.slug}/translations`);
  return { ok: true, token };
}

export type MemberChangeResult = { ok: true } | { ok: false; error: string };

/** 트랜잭션 안에서 던져 쓰기를 되돌리는 신호. 밖에서 잡아 `last-owner`로 바꾼다 — 사용자에게 예외를 보내지 않는다. */
class LastOwnerRollback extends Error {
  constructor() {
    super("last owner would be removed");
    this.name = "LastOwnerRollback";
  }
}

/**
 * 제거(`nextRole: null`)와 역할 변경이 **같은 판정을 지난다** — 강등을 따로 두면 "제거는 막고
 * 강등은 통과"가 되는데 결과는 같다(OWNER 없는 프로젝트).
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
  const { userId } = session;

  const prisma = getPrisma();
  const access = await getProjectAccess(prisma, {
    userId,
    slug: input.slug,
    permission: "member:manage",
  });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const { projectId } = access;

  /**
   * ⚠️ **판정·쓰기·재집계가 한 트랜잭션이고, 프로젝트 행을 먼저 잠근다.** OWNER 둘이 **동시에 각자를**
   * 제거·강등하면 둘 다 OWNER 2명인 목록을 읽어 통과하고 서로 다른 행을 쓰므로 count도 각각 1이다 —
   * 결과는 OWNER 0명이고 아무도 되살릴 수 없다 (Codex 감사 2026-09-06 #2). FK Restrict는 멤버 행 **변경**을
   * 막지 않는다. `SELECT … FOR UPDATE`가 같은 프로젝트의 멤버 변경을 직렬화하고, 쓰기 뒤 OWNER를 다시 세는
   * 것은 잠금이 새는 경우(다른 경로의 쓰기)의 그물이다 — 0이면 던져 롤백한다.
   */
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;

    // 인가된 projectId로 좁힌다 — 안 좁히면 남의 프로젝트 멤버가 목록에 섞여 판정이 흔들린다.
    const members = await tx.projectMember.findMany({
      where: { projectId },
      select: { userId: true, role: true },
    });

    const plan = planMemberChange({ members, targetUserId: input.targetUserId, nextRole: input.nextRole });
    if (plan !== "ok") return plan;

    // ⚠️ **조건부 쓰기의 count를 읽는다.** `delete`/`update`는 행이 사라졌을 때 P2025로 던지는데,
    // 그건 다른 경로가 같은 멤버를 먼저 지운 경우 실제로 일어난다 — Server Action에서 처리되지 않은
    // throw는 사용자에게 digest만 있는 일반 오류가 되고, `planMemberChange`가 만들어 둔 사유가
    // 무시된다. `acceptInvitation`의 단일 사용과 같은 형태다.
    const where = { projectId, userId: input.targetUserId };
    const written =
      input.nextRole === null
        ? await tx.projectMember.deleteMany({ where })
        : await tx.projectMember.updateMany({ where, data: { role: input.nextRole } });

    // 판정과 쓰기 사이에 사라졌다 — 다른 요청이 먼저 처리한 것이고, 결과는 그쪽이 옳다.
    if (written.count === 0) return "not-member" as const;

    const owners = await tx.projectMember.count({ where: { projectId, role: "OWNER" } });
    if (owners === 0) throw new LastOwnerRollback();
    return "ok" as const;
  }).catch((error: unknown) => {
    if (error instanceof LastOwnerRollback) return "last-owner" as const;
    throw error;
  });

  if (outcome !== "ok") return { ok: false, error: outcome };

  revalidatePath(`/projects/${input.slug}/translations`);
  return { ok: true };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 온보딩 (SaaS 5단계 — design §3.6·§3.11). **두 GitHub 자격증명이 만나는 유일한 자리다**:
 * 리포 읽기는 App installation 토큰(`openRepoReader`·`probeRepo`), "이 사람이 그 설치를 볼 수
 * 있는가"는 사용자 토큰(`listUserInstallations`·`listInstallationRepos`).
 * `lib/onboarding/`은 둘 다 모르고 스냅샷·blob을 **값으로** 받는다
 * (`credential-separation.test.ts`가 상시로 센다).
 *
 * ⚠️ **인가가 GitHub 조회보다 먼저다** — 거부될 요청이 남의 레이트 리밋을 태우지 않는다.
 *
 * ⚠️ **프로젝트가 없는 넷은 `requireUser`다** (design §3.6 — `Account` 행은 사용자 소유이고,
 * 생성 경로에는 인가할 프로젝트가 없다). 세션이 끊기면 로그인 화면으로 보낸다: 중간 상태를
 * 저장하지 않으므로(§3.4) "처음부터"가 정확한 안내이고, blur 저장처럼 잃을 입력이 없다.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** 온보딩의 실패는 두 union에서 온다 — `/projects/new`가 `isOnboardError`·`isConnectError` 둘로 읽는다 (§3.6). */
type OnboardFailure = OnboardError | ConnectError | "invalid input";

const RepoInput = z.object({ owner: z.string().min(1), repo: z.string().min(1) });
const SlugOnlyInput = z.object({ slug: z.string().min(1) });
const CreateProjectInput = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  adapter: z.string().min(1),
  pathTemplate: z.string().min(1),
  baseLocale: z.string().min(1),
  slug: z.string().min(1),
  // ⚠️ 상한이 있는 이유는 **저장되는 유일한 자유 입력**이기 때문이다 — slug는 `planSlug`가 40자로
  // 막지만 이름은 목록·헤더에 그대로 렌더된다 (code-review 2026-09-07 🟡5).
  // ⚠️ **트림이 검사보다 먼저다** — 순서가 반대면 공백만인 이름이 통과해 목록에 빈 줄로 뜬다
  // (2026-09-07 리뷰 ⚪15).
  name: z.string().trim().min(1).max(200),
});

/**
 * 트랜잭션 안에서 던져 쓰기를 되돌리는 신호. 밖에서 잡아 `limit-reached`로 바꾼다 —
 * `LastOwnerRollback`과 같은 관용구다(사용자에게 예외를 보내지 않는다).
 */
class ProjectLimitRollback extends Error {
  constructor() {
    super("owner project limit reached");
    this.name = "ProjectLimitRollback";
  }
}

export type StartUserConnectResult = { ok: false; error: OnboardFailure };

/**
 * GitHub 계정 연결의 **나가는 쪽 — 사용자 수준** (design §3.6). 인가는 `requireUser`뿐이다:
 * `Account` 행은 사용자 소유이므로 프로젝트 권한을 요구할 근거가 없다.
 *
 * ⚠️ **설정 화면의 `startGithubConnect`와 다른 것은 인가와 `dest` 둘뿐이다.** 쿠키 이름·`secure`·
 * origin 판정은 `requestOrigin`·`callbackUrl`·`stateCookieName`이 한 곳에서 든다 — 그 규칙을
 * 여기서 다시 구현하지 않는다 (malmoi#7이 그 판정이 갈려서 났다).
 *
 * 성공하면 GitHub으로 `redirect`하므로 **반환하지 않는다.**
 */
export async function startGithubConnectForUser(): Promise<StartUserConnectResult> {
  const { userId } = await requireUser();

  const head = await headers();
  const origin = requestOrigin({
    host: head.get("host"),
    forwardedProto: head.get("x-forwarded-proto"),
  });
  // Host를 못 믿으면 authorize URL을 만들지 않는다 — 추측한 origin으로 사용자를 보내지 않는다.
  if (origin === null) return { ok: false, error: "unavailable" };
  const nonce = randomBytes(32).toString("base64url");

  const cookieStore = await cookies();
  cookieStore.set(
    stateCookieName(origin.secure),
    signState({
      userId,
      // 착지가 서명 안에 있다 — 쿼리로 실으면 공격자가 그것을 정한다 (design §3.6).
      dest: { kind: "new" },
      nonce,
      expiresAt: new Date(Date.now() + STATE_TTL_MINUTES * 60 * 1000),
      secret: requireEnv("AUTH_SECRET"),
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
  redirect(authorizeUrl(nonce, callbackUrl(origin.origin)));
}

export type DisconnectResult = { ok: true } | { ok: false; error: "unavailable" };

/**
 * GitHub 계정 연결 **해제 — 사용자 수준** (2026-09-07 리뷰 🟡9. 설정 화면에서 여기로 옮겼다).
 *
 * ⚠️ **인가가 `project:settings`면 도달할 수 없는 사람이 생긴다.** 연결은 5단계에서 사용자 수준으로
 * 열렸으므로(`startGithubConnectForUser`) **프로젝트를 하나도 안 만든 사용자**가 연결만 하고 남을 수
 * 있고, 그 사람에게는 설정 화면이 없다 — `taken-by-other`가 영구 잠금이 된다(SAAS §5.5는 자동 병합을
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
    // 없는 행을 지우려 하면 P2025로 던진다 — 조회 후 지운다. 연결이 이미 없는 것은 실패가 아니다:
    // 원하는 상태가 이미 이뤄져 있다.
    const row = await prisma.account.findFirst({
      where: { userId, provider: APP_ACCOUNT_PROVIDER },
      select: { providerAccountId: true },
    });
    if (row !== null) {
      await prisma.account.delete({
        where: {
          provider_providerAccountId: {
            provider: APP_ACCOUNT_PROVIDER,
            providerAccountId: row.providerAccountId,
          },
        },
      });
    }
  } catch (error) {
    // 처리하지 않으면 digest만 있는 일반 오류가 된다 — 거부는 값으로 흘러야 한다 (ARCHITECTURE §6.3).
    logFailure("disconnect", error);
    return { ok: false, error: "unavailable" };
  }

  /**
   * ⚠️ **`"layout"`이다.** 이 연결을 보이는 화면이 둘이고(`/projects`의 계정 섹션 · 각 프로젝트의
   * 설정 화면) 여기서는 slug를 모른다 — 경로 하나만 무효화하면 설정 화면이 연결된 상태를 계속 보인다.
   */
  revalidatePath("/projects", "layout");
  return { ok: true };
}

export type ConnectableRepo = { owner: string; repo: string; fullName: string };
export type ConnectableReposResult =
  | { ok: true; repos: ConnectableRepo[] }
  | { ok: false; error: OnboardFailure };

/**
 * 내 설치가 덮는 리포 목록 (화면 ②). **표시용이지만 인가 근거와 같은 목록이다** — `createProject`가
 * 제출 시점에 이것을 다시 부르고, 여기서 본 것을 믿지 않는다 (SAAS §5.2).
 *
 * ⚠️ **빈 상태 둘을 가른다** (§3.12): 설치가 0개(`no-installations`)와 설치에 선택된 리포가
 * 0개(`no-repos`)는 사용자가 할 일이 다르다 — App 설치 대 설치 설정에서 리포 추가.
 */
export async function listConnectableRepos(): Promise<ConnectableReposResult> {
  const { userId } = await requireUser();

  const prisma = getPrisma();
  const token = await ensureUserToken(prisma, userId, new Date());
  if (token.status !== "ok") return { ok: false, error: token.status };

  let installations: readonly string[];
  try {
    // ⚠️ **전 페이지를 읽는다** — 31번째 설치가 빠지면 정당한 리포가 목록에 없다 (`user.ts`).
    installations = await listUserInstallations(token.accessToken);
  } catch (error) {
    return listFailure([error]);
  }
  if (installations.length === 0) return { ok: false, error: "no-installations" };

  /**
   * ⚠️ **설치 하나의 실패가 나머지를 막지 않는다** (code-review 2026-09-07 🟡2). 일시중지된 설치는
   * 403을 주고 그건 영구 상태다 — `Promise.all`로 묶어 통째로 `unavailable`로 접으면 정상 설치의
   * 리포도 못 고르고 화면은 "잠시 뒤 다시"를 말한다. `/api/pull`이 프로젝트별로 감싸 한 실패가
   * 순회를 멈추지 않게 한 것과 같은 판단이다 (design §3.9).
   */
  const settled = await Promise.all(
    installations.map((id) =>
      listInstallationRepos(token.accessToken, id).then(
        (repos): { repos: readonly string[] } => ({ repos }),
        (error: unknown): { error: unknown } => ({ error }),
      ),
    ),
  );
  const failures = settled.flatMap((r) => ("error" in r ? [r.error] : []));
  // 같은 리포가 두 설치에 걸릴 수 있다 — 목록에 두 번 보이지 않게 접는다.
  const fullNames = [...new Set(settled.flatMap((r) => ("repos" in r ? r.repos : [])))].sort();

  // 하나도 못 읽었는데 실패가 있었다면 빈 목록은 "리포가 없다"가 아니다 — 장애를 거부로 위장하지 않는다.
  if (fullNames.length === 0 && failures.length > 0) return listFailure(failures);
  // 일부만 실패했으면 원인은 로그에만 남는다 — 화면은 읽어낸 목록으로 진행한다.
  for (const error of failures) logFailure("onboard-repos", error);

  if (fullNames.length === 0) return { ok: false, error: "no-repos" };

  return {
    ok: true,
    repos: fullNames.flatMap((fullName) => {
      const [owner, repo] = fullName.split("/");
      // `owner/name`이 아닌 응답은 이해하지 못한 것이다 — 화면에 반쪽 값을 보내지 않는다.
      return owner === undefined || repo === undefined || owner === "" || repo === ""
        ? []
        : [{ owner, repo, fullName }];
    }),
  };
}

export type DetectResult =
  | { ok: true; candidates: CandidateSummary[] }
  | { ok: false; error: OnboardFailure };

/**
 * 탐지 (화면 ③) — **2패스다** (design §3.1). `FileProbe`가 동기라 경로만으로 1차 후보를 얻고,
 * 내려받을 파일을 고른 뒤(`probeTargets`, blob ≤21), 내용을 들고 다시 돈다.
 *
 * ⚠️ **1패스 결과를 사용자에게 보이지 않는다.** probe 없는 1순위는 검색 인덱스 같은 무관한 JSON
 * 묶음일 수 있다(bugshot-web 실측) — 중간값이지 화면에 쓰는 값이 아니다.
 */
export async function detectRepoFormats(raw: { owner: string; repo: string }): Promise<DetectResult> {
  const parsed = RepoInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { owner, repo } = parsed.data;

  const { userId } = await requireUser();

  const prisma = getPrisma();
  const access = await checkRepoAccess(prisma, userId, owner, repo);
  if (access.status !== "ok") return { ok: false, error: access.error };

  const reader = await openRepoReader(access.repoOwner, access.repoName, access.installationId);
  const snapshot = await reader.snapshot(access.defaultBranch);
  if (snapshot.status !== "ok") return { ok: false, error: snapshotError(snapshot) };

  const paths = snapshot.files.map((f) => f.path);
  // 1패스: probe 없이 경로 모양만. code-dict는 여기서 후보가 0개이고 probe가 그것을 **만든다**.
  const targets = probeTargets(detectCandidatesAcross(paths), codeDictCandidatePaths(paths));
  const files = await readFiles(reader, snapshot, targets);
  const blobs = new Map(files.map((f) => [f.path, f.content]));

  // 2패스: 내려받은 내용으로 검증된 후보만 남는다.
  const summaries = summarizeCandidates(detectCandidatesAcross(paths, makeProbe(blobs)), blobs);
  if (summaries.length === 0) return { ok: false, error: "no-candidates" };

  return { ok: true, candidates: summaries };
}

export type CreateProjectResult =
  /**
   * `baseBranch`는 **결과 화면의 워크플로 YAML용**이다 (T7). `on.push.branches`를 `main`으로 고정하면
   * base가 `develop`인 리포에서 CI가 영영 안 돌고, 그 값을 아는 것은 probe를 부른 서버뿐이다.
   */
  | { ok: true; slug: string; pushToken: string; baseBranch: string }
  | { ok: false; error: OnboardFailure };

/**
 * 확정 (화면 ④) — 행 + OWNER 멤버십 + push 토큰 해시를 **한 트랜잭션**으로 만들고 **원문을 한 번**
 * 돌려준다 (design §3.11). 첫 적재는 하지 않는다: 60초를 넘기면 행은 커밋됐는데 응답이 사라져
 * 토큰 원문을 아무도 못 본다.
 *
 * ⚠️ **클라이언트가 보낸 `adapter`·`pathTemplate`을 그대로 저장하지 않는다** (design §3.4). 임의의
 * 템플릿을 저장할 수 있으면 pull이 그 리포의 아무 파일이나 덮어쓰는 커밋을 만든다 — 파일을 다시
 * 읽어 `detectFormatWith`를 돌리고 **그 반환값을** 저장한다 (POSTMORTEM 2026-09-05: 검증한 값을
 * 저장하지 않으면 검증이 장식이다).
 */
export async function createProject(raw: {
  owner: string;
  repo: string;
  adapter: string;
  pathTemplate: string;
  baseLocale: string;
  slug: string;
  name: string;
}): Promise<CreateProjectResult> {
  const parsed = CreateProjectInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const input = parsed.data;

  const { userId } = await requireUser();

  // ⚠️ **형식 규칙은 `lib/pull/trigger.ts`의 `REF_SAFE_SLUG`와 같은 정규식이다** — 갈리면 온보딩이
  // 만든 slug가 pull에서 `fail()`로 죽는다. 형식이 틀리면 GitHub을 부를 이유가 없다.
  if (planSlug(input.slug) !== "ok") return { ok: false, error: "invalid-slug" };
  // 모르는 어댑터는 아무 파일도 가리키지 못한다 — 조작된 입력이라 리포를 읽지 않는다.
  if (!isAdapterName(input.adapter)) return { ok: false, error: "invalid input" };
  const adapterName: AdapterName = input.adapter;

  const prisma = getPrisma();
  const access = await checkRepoAccess(prisma, userId, input.owner, input.repo);
  if (access.status === "rejected") return { ok: false, error: access.error };

  const [ownerCount, existing] = await Promise.all([
    // ⚠️ **OWNER 행만 센다** — 멤버십 전체를 세면 EDITOR로 초대만 받은 사람이 하나도 못 만든다 (spec §4).
    prisma.projectMember.count({ where: { userId, role: "OWNER" } }),
    // ⚠️ **전역 조회다** — slug는 `@unique`이고 "이미 쓰는 주소인가"는 테넌트 안에서 답할 수 없는
    // 질문이다 (§7.7의 대가). 돌려주는 것은 존재 여부뿐이고 화면에는 `slug-taken` 한 줄만 간다 —
    // 남의 프로젝트 이름·리포는 새지 않는다.
    prisma.project.findUnique({ where: { slug: input.slug }, select: { id: true } }),
  ]);

  /**
   * ⚠️ **연결 거부는 `checkRepoAccess`가 이미 값으로 돌려줬다** — 여기 오는 `connect`는 항상 ok다
   * (code-review 2026-09-07 🟡1). 그래도 `planProjectCreate`에 그것을 넘기는 이유는 **순서가 그
   * 함수에 문서화돼 있기** 때문이다: 연결 거부 → 제한 → 충돌. 두 층의 매핑이 같은지는
   * "슬롯이 없고 리포 접근도 없으면 연결 거부가 먼저" 테스트가 고정한다.
   */
  const plan = planProjectCreate({
    repoConnect: access.connect,
    ownerCount,
    slugTaken: existing !== null,
    limit: PROJECT_LIMIT,
  });
  if (plan.status !== "ok") return { ok: false, error: plan.status };

  const reader = await openRepoReader(plan.repoOwner, plan.repoName, plan.installationId);
  const snapshot = await reader.snapshot(access.defaultBranch);
  if (snapshot.status !== "ok") return { ok: false, error: snapshotError(snapshot) };

  const paths = snapshot.files.map((f) => f.path);
  const attempted = templatePaths(adapterName, input.pathTemplate, paths);
  const files = await readFiles(reader, snapshot, attempted);
  const confirmed = planConfirmedFormat(
    { adapter: adapterName, pathTemplate: input.pathTemplate, baseLocale: input.baseLocale },
    files,
  );
  if (confirmed.status !== "ok") {
    /**
     * ⚠️ **못 받은 파일이 있으면 장애다** (2026-09-07 리뷰 🟡4). `readFiles`가 실패한 blob을 조용히
     * 빼므로 그 상태가 "템플릿이 아무 파일도 가리키지 않는다"와 구별되지 않는데, 문구는 "경로와
     * 형식을 다시 확인해 주세요"라 **사용자가 맞는 입력을 고치려 든다** (POSTMORTEM 2026-09-03).
     */
    if (files.length < attempted.length) {
      logFailure(
        "onboard-confirm",
        new Error(`재검증 파일을 내려받지 못했다: ${attempted.length - files.length}/${attempted.length}`),
      );
      return { ok: false, error: "unavailable" };
    }
    // 나머지 갈래 넷은 한 문구로 접는다 — 사용자가 할 일이 같다(다른 후보를 고르거나 경로를 고친다).
    return { ok: false, error: "manual-no-match" };
  }

  // 원문은 여기서 한 번 돌려주고 **저장하지 않는다** (초대 토큰과 같은 모델 — SAAS §7.8).
  const pushToken = generatePushToken();

  try {
    await prisma.$transaction(async (tx) => {
      /**
       * ⚠️ **같은 사용자의 동시 생성을 직렬화한다** (2026-09-07 리뷰 🟡7). 위 `ownerCount` 선조회는
       * 트랜잭션 밖이라 두 탭이 동시에 통과하면 슬롯이 셋인데 넷이 생기고, 삭제가 비범위라
       * 사용자가 그 슬롯을 되찾을 수 없다. `createInvitation`·`changeMember`가 프로젝트 행을
       * 잠그는 것과 같은 이유이고 — **생성 경로에는 잠글 프로젝트가 없으므로 대상이 `User`다.**
       * 선조회를 남겨 두는 것은 거부될 요청이 GitHub을 읽지 않게 하기 위해서다.
       */
      await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const owned = await tx.projectMember.count({ where: { userId, role: "OWNER" } });
      if (owned >= PROJECT_LIMIT) throw new ProjectLimitRollback();

      const project = await tx.project.create({
        data: {
          slug: input.slug,
          name: input.name,
          // 이름은 **probe가 준 현재 값**이다 — 리네임된 리포도 지금 이름으로 붙는다.
          repoOwner: plan.repoOwner,
          repoName: plan.repoName,
          // ⚠️ default가 `"main"`이라 **반드시 채운다** — default branch가 `develop`인 리포의
          // pull이 `main`을 찾아 `base-branch-missing`으로 죽는다 (design §4).
          baseBranch: access.defaultBranch,
          installationId: plan.installationId,
          // 저장하는 것은 재탐지 결과다 — 클라이언트 입력이 아니다.
          adapterName: confirmed.format.adapter,
          pathTemplate: confirmed.format.pathTemplate,
          baseLocale: confirmed.baseLocale,
          pushTokenHash: hashPushToken(pushToken),
        },
        select: { id: true },
      });
      await tx.projectMember.create({ data: { projectId: project.id, userId, role: "OWNER" } });
    });
  } catch (error) {
    // 잠금 안에서 센 결과가 넘쳤다 — 쓰기는 되돌아갔고 사용자에게는 선조회와 같은 사유가 간다.
    if (error instanceof ProjectLimitRollback) return { ok: false, error: "limit-reached" };
    // ⚠️ **선조회를 지난 뒤의 경합이다** — 둘이 같은 slug로 동시에 들어오면 여기서 P2002가 난다.
    // 처리하지 않으면 digest만 있는 일반 오류가 되고 `planProjectCreate`가 만들어 둔 사유가 사라진다.
    if (isUniqueViolation(error)) return { ok: false, error: "slug-taken" };
    throw error;
  }

  revalidatePath("/projects");
  return { ok: true, slug: input.slug, pushToken, baseBranch: access.defaultBranch };
}

export type FirstIngestResultView =
  | { ok: true; count: number; failed: number; errors: { path: string; message: string }[] }
  | { ok: false; error: OnboardError | AccessError | "invalid input" };

/**
 * 첫 적재 (화면 ⑤⑥) — **`awaiting_first_sync`에서만 돈다** (design §3.7). 설정 화면의 [다시 시도]가
 * 같은 Action이고, `retryFirstIngest`는 따로 없다.
 *
 * ⚠️ **`ready`에서 돌리면 strict push라 번역자 편집을 버튼 하나로 덮는다.** 그래서 `not-awaiting`이다.
 *
 * ⚠️ **포맷의 `locales`는 컬럼에 없다** — 첫 적재가 `Locale` 행을 만들기 때문이다. 그래서 저장된
 * 템플릿으로 파일을 다시 읽어 `planConfirmedFormat`을 지난다: 확정과 같은 경로이고, 그 사이에
 * 파일이 옮겨졌으면 여기서 잡힌다.
 */
export async function runFirstIngest(raw: { slug: string }): Promise<FirstIngestResultView> {
  const parsed = SlugOnlyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { slug } = parsed.data;

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
      adapterName: true,
      pathTemplate: true,
      baseLocale: true,
      lastCommitSha: true,
    },
  });
  if (project === null) return { ok: false, error: "not-found" };

  if (planProjectReadiness(project) !== "awaiting_first_sync") return { ok: false, error: "not-awaiting" };
  const { installationId, adapterName, pathTemplate, baseLocale } = project;
  // `awaiting_first_sync`는 `installationId`가 있다는 뜻이지만 컴파일러는 그것을 모른다.
  // 포맷 셋이 비어 있는 것은 온보딩 밖에서 만들어진 행이라 여기서 적재할 근거가 없다.
  if (installationId === null || adapterName === null || pathTemplate === null || baseLocale === null) {
    logFailure("onboard-ingest", new Error(`포맷이 저장되지 않은 프로젝트다: ${slug}`));
    return { ok: false, error: "ingest-failed" };
  }
  if (!isAdapterName(adapterName)) {
    logFailure("onboard-ingest", new Error(`모르는 어댑터 이름이 저장돼 있다: ${adapterName}`));
    return { ok: false, error: "ingest-failed" };
  }

  const reader = await openRepoReader(project.repoOwner, project.repoName, installationId);
  const snapshot = await reader.snapshot(project.baseBranch);
  if (snapshot.status !== "ok") return { ok: false, error: snapshotError(snapshot) };

  const paths = snapshot.files.map((f) => f.path);
  /**
   * ⚠️ **내려받기를 "시도한" 목록은 여기서 나온다 — `ingestTargets`가 아니다** (2026-09-07 리뷰 🔴2).
   * 그쪽은 `confirmed.format.locales`를 순회하고 그 locales는 **성공한 blob에서 나온 값**이라,
   * 내려받지 못한 로케일이 목록에서 함께 사라져 `ingest.ts`의 `missing`이 0이 된다 — 화면이
   * "N개 키를 적재했어요"를 쓰고 `ready`가 서면 [다시 시도]도 `not-awaiting`이다 (불변식 9).
   * 템플릿이 가리키는 파일은 트리에서 나오므로 다운로드 성공과 무관하다.
   */
  const attempted = templatePaths(adapterName, pathTemplate, paths);
  const files = await readFiles(reader, snapshot, attempted);
  const confirmed = planConfirmedFormat({ adapter: adapterName, pathTemplate, baseLocale }, files);
  if (confirmed.status !== "ok") {
    logFailure("onboard-ingest", new Error(`저장된 포맷이 더 이상 성립하지 않는다: ${confirmed.reason}`));
    return { ok: false, error: "ingest-failed" };
  }

  const adapter = adapterFor(confirmed.format);
  // ⚠️ **`selectLocaleFiles`를 새로 짜지 않는다** — 껍데기가 파일을 안 골라 어댑터가 "존재하지
  // 않았던" 전례가 있다 (POSTMORTEM 2026-09-02). `ingestTargets`가 그 함수를 지난 경로 목록이다.
  // **합집합을 넘긴다**: 시도한 것(다운로드 실패를 세는 근거)과 적재가 원하는 것(그쪽에만 있는
  // 경로가 생기면 그것도 실패다) 둘 다 `blobs`에 있어야 정상이다.
  const targets = [...new Set([...attempted, ...ingestTargets(confirmed.format, adapter.layout, paths)])].sort(
    compareKeys,
  );
  const blobs = new Map(files.map((f) => [f.path, f.content]));
  // 이미 받은 것은 다시 받지 않는다 — 남는 것은 첫 시도가 실패한 파일이고, 한 번 더 받아 본다.
  for (const extra of await readFiles(reader, snapshot, targets.filter((p) => !blobs.has(p)))) {
    blobs.set(extra.path, extra.content);
  }

  try {
    const result = await ingestFirstSnapshot(prisma, {
      projectId,
      projectSlug: slug,
      format: confirmed.format,
      baseLocale: confirmed.baseLocale,
      headSha: snapshot.headSha,
      // ⚠️ **base head 커밋의 시각이다.** `new Date()`면 CI 첫 push가 `stale-commit` 409다 (design §4).
      headCommittedAt: snapshot.headCommittedAt,
      paths,
      // 내려받기를 **시도한** 목록이다 — `blobs`에 없는 것을 실패로 센다 (불변식 9).
      targets,
      blobs,
    });

    revalidatePath(`/projects/${slug}/settings`);
    revalidatePath("/projects");
    return { ok: true, count: result.count, failed: result.failed, errors: [...result.errors] };
  } catch (error) {
    // 던지지 않는다 — 직렬화 경계라 클라이언트가 받을 수 있는 모양으로 바꾼다. 행은 그대로 남고
    // 설정 화면의 [다시 시도]가 같은 Action을 부른다.
    logFailure("onboard-ingest", error);
    return { ok: false, error: "ingest-failed" };
  }
}

export type RotateTokenResult =
  | { ok: true; pushToken: string }
  | { ok: false; error: OnboardError | AccessError | "invalid input" };

/**
 * push 토큰 재발급 (설정 화면). **원문은 이 반환값에만 있다** — 잃으면 다시 재발급이다.
 *
 * ⚠️ **회전하면 옛 토큰이 즉시 무효다.** 대상 리포의 `PUSH_TOKEN` secret을 바꾸기 전까지 그 리포의
 * CI는 401이고, 화면이 버튼 **위에** 그 사실을 상시 캡션으로 둔다 (design §3.13).
 */
export async function rotatePushToken(raw: { slug: string }): Promise<RotateTokenResult> {
  const parsed = SlugOnlyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { slug } = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;

  const prisma = getPrisma();
  const access = await getProjectAccess(prisma, { userId, slug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };

  const pushToken = generatePushToken();
  // ⚠️ `where`가 **인가가 돌려준 projectId**다.
  await prisma.project.update({
    where: { id: access.projectId },
    data: { pushTokenHash: hashPushToken(pushToken) },
  });

  revalidatePath(`/projects/${slug}/settings`);
  return { ok: true, pushToken };
}

/**
 * 목록 조회 실패 → 사유. **401이 있으면 그것이 이긴다** (design §2.4): 사용자가 GitHub에서 App
 * 인가를 철회하면 DB 토큰은 아직 만료 전이라 `ensureUserToken`이 `ok`를 주고 **이 GET이 유일한
 * 신호**다. `unavailable`로 접으면 영구 상태를 "잠시 뒤 다시"로 안내해 사용자가 같은 버튼을 무한히
 * 누른다 — 필요한 것은 "GitHub 다시 연결" 버튼이다.
 */
function listFailure(errors: readonly unknown[]): { ok: false; error: OnboardFailure } {
  for (const error of errors) logFailure("onboard-repos", error);
  return errors.some((error) => httpStatus(error) === 401)
    ? { ok: false, error: "reauthorize" }
    : { ok: false, error: "unavailable" };
}

/**
 * SAAS §5.4의 3중 검증 — **App 토큰으로 리포를 열기 전에** 이 사람이 그 설치를 볼 수 있는지 묻는다.
 * 이것이 없으면 로그인한 누구나 우리 App이 설치된 남의 리포를 우리 토큰으로 읽을 수 있다.
 *
 * 판정은 `planRepoConnect`가 한다 — `connectRepository`와 같은 함수이고, 그래서 §5.7의 공격
 * 시나리오 둘이 두 경로에서 같은 답을 낸다.
 */
async function checkRepoAccess(
  prisma: PrismaClient,
  userId: string,
  owner: string,
  repo: string,
): Promise<
  | { status: "ok"; connect: RepoConnect; installationId: string; repoOwner: string; repoName: string; defaultBranch: string }
  | { status: "rejected"; error: OnboardFailure }
> {
  const token = await ensureUserToken(prisma, userId, new Date());
  if (token.status !== "ok") return { status: "rejected", error: token.status };

  // ⚠️ **try 밖이다.** `probeRepo`는 GitHub 실패를 값으로 주고, 던지는 것은 환경변수 누락(설정
  // 오류)뿐이다 — 그것을 아래 catch가 `unavailable`로 접으면 "잠시 뒤 다시"가 영원히 뜬다.
  const probe = await probeRepo(owner, repo);

  let userInstallationIds: readonly string[];
  let userRepoFullNames: readonly string[];
  try {
    userInstallationIds = await listUserInstallations(token.accessToken);
    // ⚠️ **접근 불가 설치의 리포 목록을 부르지 않는다** — 404가 나고 catch가 그것을 `unavailable`로
    // 접어 거부가 장애로 위장된다. 빈 목록이면 `planRepoConnect`가 `installation-forbidden`을 낸다.
    userRepoFullNames =
      probe.status === "ok" && userInstallationIds.includes(probe.installationId)
        ? await listInstallationRepos(token.accessToken, probe.installationId)
        : [];
  } catch (error) {
    if (httpStatus(error) === 401) return { status: "rejected", error: "reauthorize" };
    logFailure("onboard-access", error);
    return { status: "rejected", error: "unavailable" };
  }

  const connect = planRepoConnect({ probe, userInstallationIds, userRepoFullNames });
  // ⚠️ **`unavailable`을 거부로 접지 않는다** — `planProjectCreate`가 그것을 그대로 흘리도록
  // 설계됐고, 여기서 접으면 사용자가 있는 권한을 없다고 믿는다 (POSTMORTEM 2026-09-03).
  if (connect.status !== "ok" || probe.status !== "ok") {
    return connect.status === "ok"
      ? { status: "rejected", error: "unavailable" }
      : { status: "rejected", error: connect.status };
  }

  return {
    status: "ok",
    connect,
    installationId: connect.installationId,
    repoOwner: connect.repoOwner,
    repoName: connect.repoName,
    // `GET /repos` 응답에 이미 있다 — pull이 이 값을 읽는다 (design §4).
    defaultBranch: probe.defaultBranch,
  };
}

/**
 * 트리 항목의 `sha`로 내려받는다 — contents API는 1MB에서 잘려 조용히 빈 내용을 준다.
 *
 * 못 읽은 파일은 **빠진다.** 탐지에서는 그 후보가 "키 수 확인 실패"로 남고(ARCHITECTURE §4의 연장),
 * 첫 적재에서는 `targets`와 대조해 **실패로 센다** — 조용히 빼면 성공 문구가 나간다 (불변식 9).
 */
async function readFiles(
  reader: RepoReader,
  snapshot: Extract<RepoSnapshot, { status: "ok" }>,
  paths: readonly string[],
): Promise<AdapterFile[]> {
  const shaByPath = new Map(snapshot.files.map((f) => [f.path, f.sha]));
  const out: AdapterFile[] = [];
  // 순차로 받는다 — 한 번에 던지면 secondary rate limit에 걸리고, 예산이 ≤21개(탐지) 또는
  // 로케일 파일 수(첫 적재)라 `maxDuration=60` 안에 든다 (design §3.1·§4).
  for (const path of paths) {
    const sha = shaByPath.get(path);
    if (sha === undefined) continue;
    const content = await reader.blob(sha);
    if (content === undefined) continue;
    out.push({ path, content });
  }
  return out;
}

/**
 * 스냅샷의 비-ok 갈래 → 화면 문구가 있는 사유.
 *
 * ⚠️ **`truncated`에는 수동 지정으로 가는 길이 없다** (2026-09-07 정정 — 전 주석은 반대로 적혀 있었다).
 * 확정의 재검증(`planConfirmedFormat`)이 **같은 잘린 스냅샷**을 읽으므로 같은 갈래를 다시 낸다.
 * 문구도 그렇게 말한다 (`onboardErrorMessage`).
 */
function snapshotError(snapshot: Exclude<RepoSnapshot, { status: "ok" }>): OnboardError {
  if (snapshot.status === "truncated") return "tree-truncated";
  if (snapshot.status === "base-branch-missing") return "base-branch-missing";
  return "unavailable";
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
