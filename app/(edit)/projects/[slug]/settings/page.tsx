import Link from "next/link";
import { redirect } from "next/navigation";

import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { optionalEnv } from "@/lib/env";
import { probeRepo } from "@/lib/github";
import { planConnectionHealth, type ConnectionHealth } from "@/lib/github-connect/health";
import { logFailure } from "@/lib/github-connect/log";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { ensureUserToken } from "@/lib/github-connect/token-store";
import { getViewer } from "@/lib/github-connect/user";
import { planProjectReadiness, readinessLabel } from "@/lib/onboarding/readiness";
import { renderWorkflowYaml } from "@/lib/onboarding/workflow";
import { GithubAccount, ReauthorizePrompt } from "@/components/github-account";
import { FirstIngestRetry } from "@/components/onboarding/first-ingest-retry";
import { PushTokenPanel } from "@/components/onboarding/push-token-panel";
import { WorkflowBlock } from "@/components/onboarding/workflow-block";
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

/**
 * ⚠️ **Server Action은 자기를 부른 페이지 세그먼트의 `maxDuration`을 쓴다** (`app/api/*`의 값이 아니다 —
 * design §2). 이 화면의 [다시 시도]가 `runFirstIngest`를 부르고 그것은 로케일 파일 수만큼 blob을
 * 받으므로, 기본 제한으로는 큰 리포에서 응답 도중 잘린다.
 */
export const maxDuration = 60;
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
    select: {
      repoOwner: true,
      repoName: true,
      installationId: true,
      // 상태 섹션과 워크플로 YAML의 재료 (SaaS 5단계 — design §3.7·§7).
      lastCommitSha: true,
      baseBranch: true,
      adapterName: true,
      baseLocale: true,
    },
  });
  // 인가는 지났는데 행이 없다 — 그 사이에 지워진 경우다. 빈 화면 대신 `requireProjectAccess`의 not-found와
  // 같은 곳으로 보낸다 (문구가 존재 여부를 말하지 않는다).
  if (project === null) redirect("/projects?e=not-found");

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
        <h2 className="text-sm font-medium">상태</h2>
        <StatusRow slug={slug} project={project} />
      </section>

      <section className="border-border space-y-2 rounded-md border p-4">
        <h2 className="text-sm font-medium">push 토큰</h2>
        <PushTokenPanel slug={slug} />
      </section>

      <section className="border-border space-y-2 rounded-md border p-4">
        <h2 className="text-sm font-medium">워크플로</h2>
        <WorkflowBlock yaml={workflowYaml(slug, project)} />
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
  // ⚠️ 저장된 설치가 없으면 probe 결과가 판정을 바꾸지 못한다(`planConnectionHealth`가 그때
  // `not-connected`를 준다) — 부르면 App JWT 조회와 토큰 발급 두 번이 헛돈다. 지금 프로덕션의
  // `skillflo`가 그 상태다.
  if (project.installationId === null) return { status: "not-connected" };

  // ⚠️ try로 감싸지 않는다. `probeRepo`는 GitHub 실패를 값(`error` → `unknown`)으로 주고, 던지는 것은
  // 환경변수 누락뿐이다 — 그것까지 `unknown`("잠시 뒤 다시")으로 접으면 설정 오류가 영원히 일시 장애로
  // 보인다 (code-review 2026-09-07 🟡1). "섹션 둘의 독립 실패"는 GitHub 장애에 대한 것이지 설정 오류가 아니다.
  const probe = await probeRepo(project.repoOwner, project.repoName);
  return planConnectionHealth({ project, probe });
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
  } catch (error) {
    // 401이면 인가가 철회된 것이고, 그 밖은 일시 장애다 — 둘을 가르는 것은 다음 호출이 한다.
    logFailure("viewer", error);
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

/**
 * 첫 적재 상태 (design §3.7). **재방문·`not-ready` 착지의 얼굴이 여기다** — 온보딩 결과 화면은
 * 클라이언트 상태라 새로고침하면 사라진다.
 *
 * ⚠️ **실패 사유는 여기에 없다.** 중간 상태를 저장하지 않으므로(design §3.4) 이 화면은 "적재가
 * 끝나지 않았다"만 알고, 원인은 [다시 시도]의 인라인 결과로 돌아온다.
 */
function StatusRow({
  slug,
  project,
}: {
  slug: string;
  project: { installationId: string | null; lastCommitSha: string | null };
}) {
  const readiness = planProjectReadiness(project);
  if (readiness === "ready") {
    // 가장 흔한 상태가 가장 조용해야 한다 (DESIGN §6.1) — 초록을 늘리지 않는다.
    return <p className="text-muted-foreground text-xs">첫 적재가 끝났어요.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        {readinessLabel(readiness)} — {readiness === "setup"
          ? "리포 연결을 먼저 마쳐 주세요."
          : "리포의 번역 파일을 아직 읽어오지 못했어요."}
      </p>
      {readiness === "awaiting_first_sync" && <FirstIngestRetry slug={slug} />}
    </div>
  );
}

/**
 * 복사용 워크플로 YAML. **`ts-dict`만 어댑터를 고정한다** — 그 포맷은 자동 탐지에 참여하지 않으므로
 * (ADAPTER-COVERAGE 판정 ③) 고정하지 않으면 CI가 "로케일 파일을 못 찾았다"로 끝난다. 나머지는
 * 탐지가 같은 답을 내므로 고정할 이유가 없다 (design §7).
 */
function workflowYaml(
  slug: string,
  project: { baseBranch: string; adapterName: string | null; baseLocale: string | null },
): string {
  // 두 호출로 가른다 — 스프레드로 합치면 `adapter`가 `string`으로 넓어져 인자 타입과 어긋난다.
  if (project.adapterName !== "ts-dict" || project.baseLocale === null) {
    return renderWorkflowYaml({ slug, baseBranch: project.baseBranch });
  }
  return renderWorkflowYaml({
    slug,
    baseBranch: project.baseBranch,
    adapter: "ts-dict",
    baseLocale: project.baseLocale,
  });
}
