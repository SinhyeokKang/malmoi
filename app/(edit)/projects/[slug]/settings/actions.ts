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
import { callbackUrl, requestOrigin } from "@/lib/github-connect/origin";
import { httpStatus } from "@/lib/github-connect/health";
import { logFailure } from "@/lib/github-connect/log";
import type { ConnectError } from "@/lib/github-connect/message";
import { STATE_TTL_MINUTES, signState, stateCookieName } from "@/lib/github-connect/state";
import { ensureUserToken } from "@/lib/github-connect/token-store";
import { authorizeUrl, listInstallationRepos, listUserInstallations } from "@/lib/github-connect/user";
import { probeRepo } from "@/lib/github";
import { isValidBranchName } from "@/lib/pull/branch-name";
import type { RepositorySettingsError } from "@/lib/settings/message";

/**
 * GitHub 계정 연결의 **나가는 쪽** (ARCHITECTURE §6.4). 돌아오는 쪽만 Route Handler다
 * (`app/api/github/callback/route.ts`) — 외부로 302하는 것은 Server Action이 쿠키를 심고
 * `redirect(절대 URL)`로 할 수 있고, 그래야 CLAUDE.md의 "내부 쓰기에 Route Handler 금지"와
 * 어긋나지 않는다.
 *
 * ⚠️ **화면은 6단계까지 없다.** 지금 이 Action을 부르는 것은 T4의 설정 화면이고, 그 전까지는
 * 도달 경로가 없다. 그래도 여기 두는 이유는 판정(`getProjectAccess`)과 쿠키 규칙이 라우트 옆에
 * 있어야 `entry-points.test.ts`가 그것을 세기 때문이다.
 */

const Input = z.object({ slug: z.string().min(1) });


export type StartConnectResult = { ok: false; error: string };

/**
 * 성공하면 GitHub으로 `redirect`하므로 **반환하지 않는다.** 실패만 값으로 돌아온다 —
 * 거부는 값으로 흐른다 (ARCHITECTURE §6.3).
 */
export async function startGithubConnect(raw: { slug: string; returnTo?: "add-surface" }): Promise<StartConnectResult> {
  const parsed = Input.extend({ returnTo: z.literal("add-surface").optional() }).safeParse(raw);
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

  /**
   * ⚠️ **origin과 쿠키 `secure`를 한 판정에서 얻는다** (malmoi#7). 따로 읽으면 쿠키를 심은 이름과
   * GitHub이 돌려보내는 origin이 갈릴 수 있고, 그때 증상은 "쿠키가 없다"라 원인을 서명에서 찾게 된다.
   * Vercel 뒤에서는 요청 URL이 http로 보이므로 프록시 헤더를 본다.
   */
  const head = await headers();
  const origin = requestOrigin({
    host: head.get("host"),
    forwardedProto: head.get("x-forwarded-proto"),
  });
  // Host를 못 믿으면 authorize URL을 만들지 않는다 — 추측한 origin으로 사용자를 보내지 않는다.
  if (origin === null) return { ok: false, error: "unavailable" };
  const { secure } = origin;
  const nonce = randomBytes(32).toString("base64url");

  // ⚠️ **목적지는 쿠키의 서명 안에 있다.** 쿼리로 실어 보내면 GitHub이 돌려줄 때 공격자가
  // 그 값을 정할 수 있다 — 서명 대상에 넣으면 open redirect 판정 자체가 필요 없다 (ARCHITECTURE §6.4).
  const cookieStore = await cookies();
  cookieStore.set(
    stateCookieName(secure),
    signState({
      userId,
      // 이 Action은 설정 화면 전용이다 — 생성 경로는 `{kind:"new"}`로 서명한다 (ARCHITECTURE §6.4).
      dest: { kind: parsed.data.returnTo ?? "settings", slug },
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
      secure,
    },
  );

  // 쿼리에는 nonce와 redirect_uri만 간다. `redirect`는 던지므로 이 아래는 실행되지 않는다.
  redirect(authorizeUrl(nonce, callbackUrl(origin.origin)));
}


export type ConnectResult = { ok: true } | { ok: false; error: ConnectError | AccessError | "invalid input" };

/**
 * 리포 **재연결** (ARCHITECTURE §6.4). 이름이 `connect`지만 리포를 고르지는 않는다 — 리포는 Project에
 * 고정돼 있고(PRODUCT §7.1 "다른 리포는 다른 프로젝트다"), 여기서 정해지는 것은 **어느 설치가 그 리포를
 * 덮는가**와 리네임된 경우의 새 이름뿐이다.
 *
 * ⚠️ **클라이언트가 보내는 것은 slug 하나다.** `installationId`는 `probeRepo`가 GitHub에 물어 얻으므로
 * ARCHITECTURE §6가 걱정한 "브라우저가 보낸 값을 그대로 저장"의 표면이 없다. 그래도 사용자 쪽 목록 둘을
 * **제출 시점에 다시 부른다** — 렌더 때 본 것을 믿으면 클라이언트가 보낸 값을 인가 근거로 쓰는 것과
 * 같다 (ARCHITECTURE §6.00 ③).
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
    select: { repoOwner: true, repoName: true, repositoryId: true },
  });
  if (project === null) return { ok: false, error: "not-found" };

  // ⚠️ **try 밖이다.** `probeRepo`는 GitHub 실패를 값으로 주고, 던지는 것은 환경변수 누락(설정 오류)뿐이다 —
  // 그것을 아래 catch가 `unavailable`로 접으면 "잠시 뒤 다시"가 영원히 뜬다 (code-review 2026-09-07 🟡1).
  const probe = await probeRepo(project.repoOwner, project.repoName);

  let userInstallationIds: readonly string[];
  let userRepoFullNames: readonly string[];
  try {
    userInstallationIds = await listUserInstallations(token.accessToken);
    /**
     * ⚠️ **접근 불가 설치의 리포 목록을 부르지 않는다.** 부르면 404가 나고 아래 catch가 그것을
     * `unavailable`로 접어 **거부가 장애로 위장된다.** 빈 목록으로 두면 `planRepoConnect`가 리포
     * 검사보다 **먼저** 설치를 보므로 `installation-forbidden`이 정확히 나온다.
     *
     * ⚠️ 이 `includes`는 `planRepoConnect`의 같은 검사와 **비교 방식이 같아야 한다** — 갈리면
     * 정당한 설치인데 리포 목록을 안 불러 `repo-forbidden`이 난다.
     */
    userRepoFullNames =
      probe.status === "ok" && userInstallationIds.includes(probe.installationId)
        ? (await listInstallationRepos(token.accessToken, probe.installationId)).map((r) => r.fullName)
        : [];
  } catch (error) {
    /**
     * ⚠️ **401은 거부가 아니라 재인가 신호다** (ARCHITECTURE §6.4). 사용자가 GitHub에서 App 인가를
     * 철회하면 DB 토큰은 아직 만료 전이라 `ensureUserToken`이 `ok`를 주고, **이 GET이 유일한 신호**다.
     * `unavailable`로 접으면 영구 상태를 "잠시 뒤 다시"로 안내해 사용자가 같은 버튼을 무한히 누른다 —
     * 필요한 것은 "GitHub 다시 연결" 버튼이고 그것은 `reauthorize`에만 나온다.
     */
    if (httpStatus(error) === 401) return { ok: false, error: "reauthorize" };
    // 나머지는 재시도가 유효한 실패다 (POSTMORTEM 2026-09-03). 화면에는 갈래 이름만 가므로 원인은 여기서 남긴다.
    logFailure("connect", error);
    return { ok: false, error: "unavailable" };
  }

  const plan = planRepoConnect({ probe, userInstallationIds, userRepoFullNames });
  if (plan.status !== "ok") return { ok: false, error: plan.status };

  if (probe.status !== "ok" || !probe.repositoryId || (project.repositoryId && project.repositoryId !== probe.repositoryId)) return { ok: false, error: "repo-forbidden" };

  // ⚠️ `where`가 **인가가 돌려준 projectId**다 — 클라이언트가 보낸 slug는 판정 입력일 뿐이다.
  try {
    await prisma.project.update({
      where: { id: projectId, repositoryId: project.repositoryId ?? null, repoOwner: project.repoOwner, repoName: project.repoName },
      data: {
        installationId: plan.installationId,
        repositoryId: probe.repositoryId,
        repoOwner: plan.repoOwner,
        repoName: plan.repoName,
      },
    });
  } catch (error) {
    // 동시에 들어온 재연결이 우리가 인가한 신원·주소를 바꿨다.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return { ok: false, error: "repo-forbidden" };
    }
    throw error;
  }

  revalidatePath(`/projects/${slug}/settings`);
  /**
   * ⚠️ **Home이 `planConnectionHealth`의 새 소비자다** (2026-09-15 — project-home T10). 다시
   * 연결해도 Home의 미연결 배너가 다음 재검증까지 남으면, 사용자는 방금 누른 것이 안 먹은 줄 안다.
   */
  revalidatePath(`/projects/${slug}`, "layout");
  return { ok: true };
}


// ── 기준 브랜치 (6b-3. 기준 로케일은 6b-5가 `locales/actions.ts`로 옮겼다) ────────

const SettingsInput = z.object({
  slug: z.string().min(1),
  /** 트림하지 않는다 — `isValidBranchName`이 앞뒤 공백을 **거부**한다 (그 모듈의 경고). */
  baseBranch: z.string().min(1),
});

export type RepositorySettingsResult =
  | { ok: true }
  | { ok: false; error: RepositorySettingsError | AccessError | "invalid input" };

/**
 * 기준 브랜치 — `Project.baseBranch`를 **즉시** 쓴다. `checkFormat`이 보지 않는 축이라 대기 개념이 없다.
 *
 * ⚠️ **6b-5가 기준 로케일을 떼어냈다** (`locales/actions.ts`의 `updateBaseLocale`). 인자를 optional로
 * 두지 않고 **가른** 이유: 화면이 갈린 뒤 optional 인자는 서버가 "무엇을 안 보냈나"를 추측하게
 * 만들고, 그 추측이 곧 malmoi#20의 모양이다 — 대기 중에 브랜치만 고친 저장이 선언을 지웠다.
 * 지금 이 Action은 **선언 컬럼을 아예 모른다.**
 *
 * ⚠️ **`Translation`·`StringKey`를 건드리지 않는다.** 재적재 경로는 CI 하나뿐이고
 * (`runFirstIngest`는 ready에서 `not-awaiting`), 자동으로 이어 붙이면 저장 하나가 GitHub 왕복이 된다.
 */
export async function updateRepositorySettings(raw: {
  slug: string;
  baseBranch: string;
}): Promise<RepositorySettingsResult> {
  const parsed = SettingsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { slug, baseBranch } = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };

  const prisma = getPrisma();
  const access = await getProjectAccess(prisma, {
    userId: session.userId,
    slug,
    permission: "project:settings",
  });
  if (access.status !== "ok") return { ok: false, error: access.status };
  const { projectId } = access;

  /**
   * 형식은 저장 전에 본다 — **여기서는** GitHub을 부르지 않는다(브랜치의 실존은 pull이 시끄럽게
   * 말한다, DESIGN §6.6).
   *
   * ⚠️ **온보딩은 반대로 묻는다** (2026-09-13, new-project-modal): ①이 `listRepoBranches`로 목록을
   * 받아 `Select`에 넣는다. 같은 컬럼에 UI가 두 벌로 갈리는 것이 **의도다** — 온보딩은 **처음 고르는
   * 자리**라 무엇이 있는지 보여 줘야 하고(안 보여 주면 default branch가 기본값으로 굳는다), 설정은
   * **이미 아는 값을 고치는 자리**라 목록이 필요 없다. 맞춘다면 설정을 온보딩 쪽으로 올린다 —
   * 반대 방향은 온보딩이 브랜치를 묻기 시작한 목적을 되돌린다.
   *
   * ⚠️ **검증 함수는 한 벌이다** — 양쪽 다 `isValidBranchName`이고, 갈리면 온보딩이 통과시킨 이름을
   * 설정이 거부한다.
   */
  if (!isValidBranchName(baseBranch)) return { ok: false, error: "invalid-branch" };

  // ⚠️ **인가가 준 projectId로 읽는다** — slug로 다시 찾으면 인가한 행과 조회한 행이 갈릴 수 있다.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { baseBranch: true },
  });
  // 인가와 조회 사이에 지워진 경우다 — 존재 여부를 말하지 않는 같은 갈래로 접는다.
  if (project === null) return { ok: false, error: "not-found" };

  // **바뀐 것이 없으면 쓰지 않는다** — 빈 update는 `Project.updatedAt`만 올린다.
  if (baseBranch !== project.baseBranch) {
    await prisma.project.update({ where: { id: projectId }, data: { baseBranch } });
  }

  revalidatePath(`/projects/${slug}/settings`);
  /**
   * ⚠️ **브랜치를 보이는 화면이 2026-09-15에 둘이 됐다** — Home의 메타 열과 Sync 확인 Dialog의
   * 본문이 그 값을 읽는다. 전 주석("이 화면 하나다")이 그때 거짓이 됐다.
   */
  revalidatePath(`/projects/${slug}`, "layout");
  return { ok: true };
}
