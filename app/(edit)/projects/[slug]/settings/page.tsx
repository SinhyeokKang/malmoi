import Link from "next/link";

import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { optionalEnv } from "@/lib/env";
import { probeRepo } from "@/lib/github";
import { planConnectionHealth, type ConnectionHealth } from "@/lib/github-connect/health";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { ensureUserToken } from "@/lib/github-connect/token-store";
import { getViewer } from "@/lib/github-connect/user";
import { GithubAccount, ReauthorizePrompt } from "@/components/github-account";
import { ReconnectButton } from "@/components/reconnect-button";

/**
 * 프로젝트 설정 — 지금은 **리포 연결** 하나다 (design §8). 6단계가 같은 페이지에 멤버 관리 섹션을
 * 얹는다.
 *
 * ⚠️ **최상단에서 `requireProjectAccess`를 던진다.** 조건부 렌더는 차단이 아니다 — App Router가
 * 레이아웃과 페이지를 병렬로 렌더해 페이지가 이미 실행되고 RSC 페이로드에 데이터가 실린다
 * (POSTMORTEM 2026-08-31, 실측 1.3MB).
 *
 * ⚠️ **섹션 둘이 독립적으로 실패한다.** 건강성은 App 토큰, 계정은 사용자 토큰이라 한쪽 API가 죽어도
 * 다른 쪽은 그려야 한다 — 하나로 묶으면 GitHub 장애에 화면이 통째로 빈다.
 */
export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const { slug } = await params;
  const { projectId, userId } = await requireProjectAccess({ slug, permission: "project:settings" });

  // callback이 실패 사유를 여기로 보낸다. 주소창 값이라 판정 함수로 거른다 — 모르는 값은 무시.
  const { e } = await searchParams;
  const notice = isConnectError(e) ? (
    <p className="text-destructive text-sm">{connectErrorMessage(e)}</p>
  ) : null;

  const prisma = getPrisma();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { repoOwner: true, repoName: true, installationId: true },
  });
  if (project === null) return null;

  const [health, account] = await Promise.all([
    loadHealth(project),
    loadAccount(prisma, userId),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-medium">설정</h1>
        <Link href={`/projects/${slug}/translations`} className="text-muted-foreground hover:text-foreground text-xs underline">
          ← 번역
        </Link>
      </div>
      {notice}

      <section className="border-border space-y-2 rounded-md border p-4">
        <h2 className="text-sm font-medium">리포 연결</h2>
        <p className="text-mono bg-muted inline-block rounded px-2 py-1">
          {project.repoOwner}/{project.repoName}
        </p>
        <HealthRow health={health} slug={slug} appSlug={optionalEnv("GITHUB_APP_SLUG")} />
      </section>

      <section className="border-border space-y-2 rounded-md border p-4">
        <h2 className="text-sm font-medium">GitHub 계정</h2>
        {account.status === "reauthorize" ? (
          <ReauthorizePrompt slug={slug} />
        ) : account.status === "unavailable" ? (
          <p className="text-muted-foreground text-xs">계정 정보를 가져오지 못했어요 — 잠시 뒤 다시 열어 주세요.</p>
        ) : (
          <GithubAccount slug={slug} login={account.login} />
        )}
      </section>
    </div>
  );
}

/** App 토큰 쪽. 실패해도 계정 섹션을 막지 않는다. */
async function loadHealth(project: {
  repoOwner: string;
  repoName: string;
  installationId: string | null;
}): Promise<ConnectionHealth> {
  try {
    const probe = await probeRepo(project.repoOwner, project.repoName);
    return planConnectionHealth({ project, probe });
  } catch {
    return { status: "unknown" };
  }
}

/** 사용자 토큰 쪽. 실패해도 건강성 섹션을 막지 않는다. */
async function loadAccount(
  prisma: ReturnType<typeof getPrisma>,
  userId: string,
): Promise<{ status: "ok"; login: string | null } | { status: "reauthorize" } | { status: "unavailable" }> {
  // ⚠️ **세션 사용자의 행만 본다.** `where`에 `userId`가 없으면 아무의 연결이나 집어 남의 GitHub
  // 핸들을 화면에 띄운다 — 조회를 인가된 주체로 좁히는 것은 `projectId` 규칙과 같은 축이다.
  const token = await ensureUserToken(prisma, userId, new Date());
  if (token.status === "not-connected") return { status: "ok", login: null };
  if (token.status === "reauthorize") return { status: "reauthorize" };
  if (token.status === "unavailable") return { status: "unavailable" };

  try {
    const viewer = await getViewer(token.accessToken);
    return { status: "ok", login: viewer.login };
  } catch {
    // 401이면 인가가 철회된 것이고, 그 밖은 일시 장애다 — 둘을 가르는 것은 다음 호출이 한다.
    return { status: "unavailable" };
  }
}

/** §3.3 표 그대로 여섯 갈래. **DESIGN §6.2 밖의 raw 색을 늘리지 않는다.** */
function HealthRow({
  health,
  slug,
  appSlug,
}: {
  health: ConnectionHealth;
  slug: string;
  appSlug: string | undefined;
}) {
  const installUrl = appSlug === undefined ? null : `https://github.com/apps/${appSlug}/installations/new`;

  switch (health.status) {
    case "ok":
      // 가장 흔한 상태가 가장 조용해야 한다 (DESIGN §6.1) — 초록을 늘리지 않는다.
      return <p className="text-muted-foreground text-xs">연결됨</p>;
    case "not-connected":
      return (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">아직 설치가 연결되지 않았어요.</p>
          <ReconnectButton slug={slug} label="연결" />
        </div>
      );
    case "app-uninstalled":
      return (
        <div className="space-y-2">
          <p className="text-destructive text-xs">App이 제거·일시중지됐거나 이 리포 접근이 철회됐어요.</p>
          {installUrl !== null && (
            <p className="text-xs">
              <a href={installUrl} className="text-blue-600 underline">
                App 설치하기
              </a>
              <span className="text-muted-foreground"> — 설치한 뒤 이 화면으로 돌아와 다시 연결하세요.</span>
            </p>
          )}
          <ReconnectButton slug={slug} label="다시 연결" />
        </div>
      );
    case "installation-changed":
      return (
        <div className="space-y-2">
          <p className="text-destructive text-xs">App이 다시 설치됐어요 — 다시 연결하세요.</p>
          <ReconnectButton slug={slug} label="다시 연결" />
        </div>
      );
    case "repo-moved":
      return (
        <div className="space-y-2">
          <p className="text-xs">
            <span className="rounded bg-amber-100/80 px-2 py-1 text-amber-800">
              리포가 <span className="text-mono">{health.fullName}</span>로 이동했어요
            </span>
          </p>
          <ReconnectButton slug={slug} label="다시 연결" />
        </div>
      );
    default:
      // 조회 실패를 "제거됨"으로 접지 않는다 (design §3.3).
      return <p className="text-muted-foreground text-xs">확인할 수 없어요 — 잠시 뒤 다시 열어 주세요.</p>;
  }
}
