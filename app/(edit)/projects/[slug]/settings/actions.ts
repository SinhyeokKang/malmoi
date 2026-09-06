"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { AccessError } from "@/lib/auth/message";
import { getProjectAccess } from "@/lib/auth/query";
import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { planRepoConnect } from "@/lib/github-connect/connect-plan";
import type { ConnectError } from "@/lib/github-connect/message";
import { signState, stateCookieName } from "@/lib/github-connect/state";
import { ensureUserToken } from "@/lib/github-connect/token-store";
import { authorizeUrl, listInstallationRepos, listUserInstallations } from "@/lib/github-connect/user";
import { probeRepo } from "@/lib/github";

/**
 * GitHub 계정 연결의 **나가는 쪽** (design §3.1). 돌아오는 쪽만 Route Handler다
 * (`app/api/github/callback/route.ts`) — 외부로 302하는 것은 Server Action이 쿠키를 심고
 * `redirect(절대 URL)`로 할 수 있고, 그래야 CLAUDE.md의 "내부 쓰기에 Route Handler 금지"와
 * 어긋나지 않는다.
 *
 * ⚠️ **화면은 6단계까지 없다.** 지금 이 Action을 부르는 것은 T4의 설정 화면이고, 그 전까지는
 * 도달 경로가 없다. 그래도 여기 두는 이유는 판정(`getProjectAccess`)과 쿠키 규칙이 라우트 옆에
 * 있어야 `entry-points.test.ts`가 그것을 세기 때문이다.
 */

const Input = z.object({ slug: z.string().min(1) });

const PROVIDER = "github-app";

/** 인가 화면까지 왕복하기에 충분하고, 방치된 탭이 오래 열려 있지 않을 만큼 짧다. */
const STATE_MINUTES = 10;

export type StartConnectResult = { ok: false; error: string };

/**
 * 성공하면 GitHub으로 `redirect`하므로 **반환하지 않는다.** 실패만 값으로 돌아온다 —
 * 거부는 값으로 흐른다 (ARCHITECTURE §6.3).
 */
export async function startGithubConnect(raw: { slug: string }): Promise<StartConnectResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { slug } = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;

  const access = await getProjectAccess(getPrisma(), {
    userId,
    slug,
    permission: "project:settings",
  });
  if (access.status !== "ok") return { ok: false, error: access.status };

  // 프로토콜 판정을 프록시 헤더에서 한다 — Vercel 뒤에서는 요청 URL이 http로 보인다.
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  const nonce = randomBytes(32).toString("base64url");

  // ⚠️ **목적지 slug는 쿠키의 서명 안에 있다.** 쿼리로 실어 보내면 GitHub이 돌려줄 때 공격자가
  // 그 값을 정할 수 있다 — 서명 대상에 넣으면 open redirect 판정 자체가 필요 없다 (design §3.1).
  const cookieStore = await cookies();
  cookieStore.set(
    stateCookieName(secure),
    signState({
      userId,
      slug,
      nonce,
      expiresAt: new Date(Date.now() + STATE_MINUTES * 60 * 1000),
      secret: requireEnv("AUTH_SECRET"),
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_MINUTES * 60,
      // `__Host-` 접두와 짝이어야 한다 — 접두만 붙이고 Secure를 빼면 브라우저가 쿠키를 버린다.
      secure,
    },
  );

  // 쿼리에는 nonce만 간다. `redirect`는 던지므로 이 아래는 실행되지 않는다.
  redirect(authorizeUrl(nonce));
}


export type ConnectResult = { ok: true } | { ok: false; error: ConnectError | AccessError | "invalid input" };

/**
 * 리포 **재연결** (design §3.2). 이름이 `connect`지만 리포를 고르지는 않는다 — 리포는 Project에
 * 고정돼 있고(spec §4 "다른 리포는 다른 프로젝트다"), 여기서 정해지는 것은 **어느 설치가 그 리포를
 * 덮는가**와 리네임된 경우의 새 이름뿐이다.
 *
 * ⚠️ **클라이언트가 보내는 것은 slug 하나다.** `installationId`는 `probeRepo`가 GitHub에 물어 얻으므로
 * SAAS §5.4가 걱정한 "브라우저가 보낸 값을 그대로 저장"의 표면이 없다. 그래도 사용자 쪽 목록 둘을
 * **제출 시점에 다시 부른다** — 렌더 때 본 것을 믿으면 클라이언트가 보낸 값을 인가 근거로 쓰는 것과
 * 같다 (SAAS §5.2).
 */
export async function connectRepository(raw: { slug: string }): Promise<ConnectResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { slug } = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;

  const prisma = getPrisma();
  // ⚠️ 인가가 GitHub 조회보다 **먼저**다 — 거부될 요청이 외부 API를 부르면 남의 프로젝트로 레이트
  // 리밋을 태울 수 있다.
  const access = await getProjectAccess(prisma, { userId, slug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const { projectId } = access;

  const token = await ensureUserToken(prisma, userId, new Date());
  if (token.status !== "ok") return { ok: false, error: token.status };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { repoOwner: true, repoName: true },
  });
  if (project === null) return { ok: false, error: "not-found" };

  let probe;
  let userInstallationIds: readonly string[];
  let userRepoFullNames: readonly string[];
  try {
    probe = await probeRepo(project.repoOwner, project.repoName);
    // 설치를 모르면 그 안의 리포를 물을 수 없다 — 판정은 `planRepoConnect`가 하므로 여기선 빈 목록.
    userInstallationIds = await listUserInstallations(token.accessToken);
    userRepoFullNames =
      probe.status === "ok" && userInstallationIds.includes(probe.installationId)
        ? await listInstallationRepos(token.accessToken, probe.installationId)
        : [];
  } catch {
    // 조회 실패를 거부로 접지 않는다 (POSTMORTEM 2026-09-03).
    return { ok: false, error: "unavailable" };
  }

  const plan = planRepoConnect({ probe, userInstallationIds, userRepoFullNames });
  if (plan.status !== "ok") return { ok: false, error: plan.status };

  // ⚠️ `where`가 **인가가 돌려준 projectId**다 — 클라이언트가 보낸 slug는 판정 입력일 뿐이다.
  await prisma.project.update({
    where: { id: projectId },
    data: {
      installationId: plan.installationId,
      repoOwner: plan.repoOwner,
      repoName: plan.repoName,
    },
  });

  revalidatePath(`/projects/${slug}/settings`);
  return { ok: true };
}

export type DisconnectResult = { ok: true } | { ok: false; error: AccessError | "invalid input" };

/**
 * GitHub 계정 연결 해제 (design §3.4). **Project와 번역 데이터는 건드리지 않는다** — 건강성은 App
 * 토큰으로 계산되므로 해제 뒤에도 그대로 보인다.
 *
 * ⚠️ **자기 행만 지운다.** `taken-by-other`가 영구 잠금이 되지 않게 하는 경로이고, 남의 연결을
 * 끊는 수단이 아니다. 로그인용 `provider: "github"` 행도 건드리지 않는다 — 의미가 다른 인가다.
 */
export async function disconnectGithub(raw: { slug: string }): Promise<DisconnectResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { slug } = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;

  const prisma = getPrisma();
  const access = await getProjectAccess(prisma, { userId, slug, permission: "project:settings" });
  if (access.status !== "ok") return { ok: false, error: access.status };

  // 없는 행을 지우려 하면 P2025로 던진다 — `deleteMany`가 없어도 되게 조회 후 지운다.
  // 연결이 이미 없는 것은 실패가 아니다: 원하는 상태가 이미 이뤄져 있다.
  const row = await prisma.account.findFirst({
    where: { userId, provider: PROVIDER },
    select: { providerAccountId: true },
  });
  if (row !== null) {
    await prisma.account.delete({
      where: { provider_providerAccountId: { provider: PROVIDER, providerAccountId: row.providerAccountId } },
    });
  }

  revalidatePath(`/projects/${slug}/settings`);
  return { ok: true };
}
